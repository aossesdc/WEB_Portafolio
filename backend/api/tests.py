import hashlib
import secrets
from contextlib import nullcontext
from types import SimpleNamespace
from unittest.mock import patch

from django.test import Client, RequestFactory, SimpleTestCase, override_settings
from rest_framework.exceptions import AuthenticationFailed

from .authentication import BearerSessionAuthentication, create_session_token
from .models import ClientProfile, StaffProfile, User, normalize_role


class LegacyPasswordTests(SimpleTestCase):
    def test_verifies_existing_node_password_hashes(self):
        password = "Cliente123"
        salt = secrets.token_bytes(16)
        digest = hashlib.scrypt(
            password.encode(),
            salt=salt,
            n=16384,
            r=8,
            p=1,
            dklen=64,
            maxmem=64 * 1024 * 1024,
        )
        stored = f"{salt.hex()}:{digest.hex()}"
        from .views import valid_legacy_password

        self.assertTrue(valid_legacy_password(password, stored))
        self.assertFalse(valid_legacy_password("incorrecta", stored))


class AuthSchemaTests(SimpleTestCase):
    def test_models_map_only_to_existing_authentication_tables(self):
        self.assertEqual(User._meta.db_table, "tb_usuarios")
        self.assertEqual(User._meta.get_field("role").column, "rol")
        self.assertEqual(User._meta.get_field("password").column, "password_hash")
        self.assertEqual(ClientProfile._meta.db_table, "tb_perfiles_cliente")
        self.assertEqual(StaffProfile._meta.db_table, "tb_perfiles_personal")
        self.assertFalse(User._meta.managed)
        self.assertFalse(ClientProfile._meta.managed)
        self.assertFalse(StaffProfile._meta.managed)

    def test_normalizes_database_roles_for_the_api(self):
        self.assertEqual(normalize_role("cliente"), "client")
        self.assertEqual(normalize_role("administrador"), "admin")
        self.assertEqual(normalize_role("ejecutivo"), "executive")


class StatelessSessionTests(SimpleTestCase):
    def setUp(self):
        self.factory = RequestFactory()

    @patch("api.authentication.User.objects.get")
    def test_authenticates_signed_token_without_a_session_table(self, get_user):
        user = SimpleNamespace(pk=12, password="encoded-password", is_active=True)
        get_user.return_value = user
        token = create_session_token(user)
        request = self.factory.get("/", HTTP_AUTHORIZATION=f"Bearer {token}")

        authenticated_user, auth_token = BearerSessionAuthentication().authenticate(request)

        self.assertIs(authenticated_user, user)
        self.assertEqual(auth_token, token)
        get_user.assert_called_once_with(pk=12, is_active=True)

    @patch("api.authentication.User.objects.get")
    def test_password_change_invalidates_session(self, get_user):
        user = SimpleNamespace(pk=12, password="before", is_active=True)
        token = create_session_token(user)
        user.password = "after"
        get_user.return_value = user
        request = self.factory.get("/", HTTP_AUTHORIZATION=f"Bearer {token}")
        with self.assertRaises(AuthenticationFailed):
            BearerSessionAuthentication().authenticate(request)

    @patch("api.authentication.User.objects.get")
    def test_rejects_tampered_token_without_querying_postgresql(self, get_user):
        request = self.factory.get("/", HTTP_AUTHORIZATION="Bearer invalid-token")

        with self.assertRaises(AuthenticationFailed):
            BearerSessionAuthentication().authenticate(request)

        get_user.assert_not_called()


@override_settings(ALLOWED_HOSTS=["testserver"])
class ApiContractTests(SimpleTestCase):
    def setUp(self):
        self.client = Client()

    def test_status_endpoint_keeps_existing_response_shape(self):
        response = self.client.get("/api/status")
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json()["ok"])
        self.assertIn("mensaje", response.json())

    def test_auth_validation_errors_are_json_and_keep_message_key(self):
        response = self.client.post("/api/auth/login", data={}, content_type="application/json")
        self.assertEqual(response.status_code, 400)
        self.assertFalse(response.json()["ok"])
        self.assertIn("message", response.json())

        response = self.client.post("/api/auth/register", data={}, content_type="application/json")
        self.assertEqual(response.status_code, 400)
        self.assertIn("message", response.json())

    def test_register_saves_user_and_client_profile(self):
        user = SimpleNamespace(
            pk=12,
            name="Ana Pérez",
            email="ana@example.com",
            profile="Cliente corporativo",
            role="cliente",
        )
        with (
            patch("api.views.User.objects.create_user", return_value=user) as create_user,
            patch("api.views.ClientProfile.objects.create") as create_profile,
            patch("api.views.transaction.atomic", return_value=nullcontext()),
        ):
            response = self.client.post(
                "/api/auth/register",
                data={
                    "name": "Ana",
                    "surname": "Pérez",
                    "email": "ANA@example.com",
                    "password": "Unica-Password-892!",
                },
                content_type="application/json",
            )

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json()["user"]["role"], "client")
        create_user.assert_called_once_with(
            email="ana@example.com",
            password="Unica-Password-892!",
            role="cliente",
        )
        create_profile.assert_called_once_with(
            user=user,
            first_name="Ana",
            last_name="Pérez",
        )

    def test_legacy_maintainer_endpoints_are_explicitly_disabled(self):
        response = self.client.get("/api/maintainers/sla")
        self.assertEqual(response.status_code, 410)
        self.assertFalse(response.json()["ok"])
