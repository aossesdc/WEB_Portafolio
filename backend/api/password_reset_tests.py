from datetime import timedelta
from unittest.mock import patch
from urllib.parse import urlsplit

from django.contrib.auth.tokens import default_token_generator
from django.core import mail
from django.core.cache import cache
from django.db import connection
from django.test import Client, TransactionTestCase, override_settings
from django.utils.encoding import force_bytes
from django.utils.http import urlsafe_base64_encode

from .authentication import create_session_token
from .models import User


@override_settings(
    ALLOWED_HOSTS=["testserver"],
    EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend",
    EMAIL_HOST="smtp.example.com",
    EMAIL_HOST_USER="mailer@example.com",
    EMAIL_HOST_PASSWORD="not-a-real-password",
    DEFAULT_FROM_EMAIL="mailer@example.com",
    FRONTEND_PUBLIC_URL="https://portal.example.com",
)
class PasswordResetTests(TransactionTestCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        with connection.schema_editor() as editor:
            editor.create_model(User)

    @classmethod
    def tearDownClass(cls):
        with connection.schema_editor() as editor:
            editor.delete_model(User)
        super().tearDownClass()

    def setUp(self):
        cache.clear()
        self.client = Client()
        self.user = User.objects.create_user(email="client@example.com", password="Old-Password-379!", role="cliente")

    def tearDown(self):
        User.objects.all()._raw_delete(using="default")
        cache.clear()
        super().tearDown()

    def request_reset(self, email):
        return self.client.post("/api/auth/password-reset", {"email": email}, content_type="application/json")

    def confirm(self, uid, token, password="New-Password-893!"):
        return self.client.post(
            "/api/auth/password-reset/confirm",
            {"uid": uid, "token": token, "password": password},
            content_type="application/json",
        )

    def test_email_link_resets_once_and_revokes_old_session(self):
        session = create_session_token(self.user)
        response = self.request_reset("CLIENT@example.com")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(mail.outbox), 1)
        self.assertEqual(mail.outbox[0].to, ["client@example.com"])
        url = next(line for line in mail.outbox[0].body.splitlines() if line.startswith("https://"))
        parsed = urlsplit(url)
        self.assertEqual(parsed.path, "/reset-password")
        uid, token = parsed.fragment.split("/")
        self.assertEqual(self.confirm(uid, token).status_code, 200)
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password("New-Password-893!"))
        self.assertEqual(self.confirm(uid, token).status_code, 400)
        self.assertEqual(self.client.get("/api/changes", HTTP_AUTHORIZATION=f"Bearer {session}").status_code, 401)

    @override_settings(FRONTEND_PUBLIC_URL="http://127.0.0.1:4000")
    def test_local_email_targets_django_frontend(self):
        response = self.request_reset("client@example.com")
        self.assertEqual(response.status_code, 200)
        url = next(line for line in mail.outbox[0].body.splitlines() if line.startswith("http://"))
        parsed = urlsplit(url)
        self.assertEqual(parsed.scheme, "http")
        self.assertEqual(parsed.netloc, "127.0.0.1:4000")
        self.assertEqual(parsed.path, "/reset-password")
        self.assertEqual(len(parsed.fragment.split("/")), 2)

    def test_unknown_staff_and_inactive_accounts_receive_no_email(self):
        User.objects.create_user(email="staff@example.com", password="Staff-Password-123!", role="admin")
        self.user.is_active = False
        self.user.save(update_fields=["is_active"])
        responses = [self.request_reset(email) for email in ("missing@example.com", "staff@example.com", self.user.email)]
        self.assertTrue(all(response.status_code == 200 for response in responses))
        self.assertEqual(len({response.json()["message"] for response in responses}), 1)
        self.assertEqual(len(mail.outbox), 0)

    def test_invalid_expired_and_weak_password_are_rejected(self):
        uid = urlsafe_base64_encode(force_bytes(self.user.pk))
        token = default_token_generator.make_token(self.user)
        self.assertEqual(self.confirm(uid, "invalid").status_code, 400)
        self.assertEqual(self.confirm(uid, token, "12345678").status_code, 400)
        now = default_token_generator._now()
        with patch.object(default_token_generator, "_now", return_value=now + timedelta(hours=2)):
            self.assertEqual(self.confirm(uid, token).status_code, 400)
        self.assertEqual(self.confirm(urlsafe_base64_encode(b"999999999999999999999999"), token).status_code, 400)
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password("Old-Password-379!"))

    def test_inactive_and_staff_tokens_cannot_reset_passwords(self):
        uid = urlsafe_base64_encode(force_bytes(self.user.pk))
        token = default_token_generator.make_token(self.user)
        self.user.is_active = False
        self.user.save(update_fields=["is_active"])
        self.assertEqual(self.confirm(uid, token).status_code, 400)
        self.user.is_active = True
        self.user.role = "admin"
        self.user.save(update_fields=["is_active", "role"])
        self.assertEqual(self.confirm(uid, token).status_code, 400)

    def test_smtp_failure_is_logged_without_account_disclosure(self):
        with patch("api.password_reset.send_mail", side_effect=OSError("unavailable")), self.assertLogs("api.password_reset", level="ERROR"):
            response = self.request_reset(self.user.email)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["message"], self.request_reset("missing@example.com").json()["message"])

    def test_request_throttle_limits_attempts(self):
        for _ in range(5):
            self.assertEqual(self.request_reset("missing@example.com").status_code, 200)
        self.assertEqual(self.request_reset("missing@example.com").status_code, 429)

    def test_duplicate_case_insensitive_emails_do_not_receive_a_link(self):
        # The manager normalizes emails; emulate inconsistent legacy data directly.
        User.objects.filter(email="client@example.com").update(email="CLIENT@example.com")
        User.objects.create_user(email="client@example.com", password="Other-Password-567!", role="cliente")
        with self.assertLogs("api.password_reset", level="ERROR"):
            response = self.request_reset("client@example.com")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(mail.outbox), 0)

    @override_settings(EMAIL_HOST="")
    def test_missing_smtp_configuration_is_reported_for_every_email(self):
        with self.assertLogs("api.password_reset", level="ERROR"):
            existing = self.request_reset("client@example.com")
            missing = self.request_reset("missing@example.com")
        self.assertEqual(existing.status_code, 503)
        self.assertEqual(existing.json(), missing.json())
