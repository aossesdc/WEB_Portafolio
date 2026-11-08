from datetime import date
from unittest.mock import patch
from urllib.error import URLError

from django.db import DatabaseError, connection
from django.test import Client, TransactionTestCase, override_settings

from .authentication import create_session_token
from .models import Branch, ClientProfile, Company, HardwareCategory, Holiday, ServiceType, StaffProfile, SupportPersonnel, Ticket, User


@override_settings(ALLOWED_HOSTS=["testserver"])
class HolidayIntegrationTests(TransactionTestCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        with connection.schema_editor() as editor:
            editor.create_model(User)
            editor.create_model(ClientProfile)
            editor.create_model(StaffProfile)
            editor.create_model(Company)
            editor.create_model(Holiday)
            editor.create_model(ServiceType)
            editor.create_model(HardwareCategory)
            editor.create_model(Branch)
            editor.create_model(SupportPersonnel)
            editor.create_model(Ticket)

    @classmethod
    def tearDownClass(cls):
        with connection.schema_editor() as editor:
            editor.delete_model(Ticket)
            editor.delete_model(SupportPersonnel)
            editor.delete_model(Branch)
            editor.delete_model(HardwareCategory)
            editor.delete_model(ServiceType)
            editor.delete_model(Holiday)
            editor.delete_model(Company)
            editor.delete_model(StaffProfile)
            editor.delete_model(ClientProfile)
            editor.delete_model(User)
        super().tearDownClass()

    def setUp(self):
        self.admin = User.objects.create_user(email="admin@example.com", password="Example-Password-892!", role="admin")
        self.user = User.objects.create_user(email="client@example.com", password="Example-Password-893!", role="cliente")
        self.auth = {"HTTP_AUTHORIZATION": f"Bearer {create_session_token(self.admin)}"}
        self.client = Client()

    def tearDown(self):
        Holiday.objects.all().delete()
        User.objects.all().delete()
        super().tearDown()

    @patch("api.holidays.fetch_national_weekday_holidays")
    def test_sync_inserts_only_missing_dates_and_get_reads_database(self, fetch):
        Holiday.objects.create(date=date(2026, 5, 1), title="Existente", type="Especial", is_irrenunciable=True)
        fetch.return_value = [(date(2026, 5, 1), "Origen", "Civil", False),
                              (date(2026, 5, 4), "Nuevo", "Religioso", False)]
        self.assertEqual(self.client.post("/api/holidays/sync").status_code, 401)
        user_auth = {"HTTP_AUTHORIZATION": f"Bearer {create_session_token(self.user)}"}
        self.assertEqual(self.client.post("/api/holidays/sync", **user_auth).status_code, 403)
        self.assertFalse(fetch.called)
        result = self.client.post("/api/holidays/sync", **self.auth)
        self.assertEqual(result.status_code, 200)
        self.assertEqual(result.json()["inserted"], 1)
        self.assertEqual(Holiday.objects.get(date=date(2026, 5, 1)).title, "Existente")
        self.assertEqual(self.client.post("/api/holidays/sync", **self.auth).json()["inserted"], 0)
        result = self.client.get("/api/holidays")
        self.assertEqual([x["title"] for x in result.json()["data"]], ["Existente", "Nuevo"])

    @patch("api.holidays.fetch_national_weekday_holidays", side_effect=URLError("unavailable"))
    def test_upstream_failure_preserves_existing_data(self, fetch):
        Holiday.objects.create(date=date(2026, 5, 1), title="Existente", type="Civil", is_irrenunciable=False)
        with self.assertLogs("api.holidays", level="ERROR"):
            result = self.client.post("/api/holidays/sync", **self.auth)
        self.assertEqual(result.status_code, 502)
        self.assertEqual(Holiday.objects.count(), 1)
        self.assertEqual(self.client.get("/api/holidays").json()["data"][0]["title"], "Existente")

    @patch("api.holidays.fetch_national_weekday_holidays")
    def test_database_error_rolls_back_the_whole_import(self, fetch):
        fetch.return_value = [(date(2026, 5, 1), "Primero", "Civil", False),
                              (date(2026, 5, 4), "Segundo", "Civil", False)]
        create = Holiday.objects.get_or_create
        with patch.object(Holiday.objects, "get_or_create", side_effect=[None]) as mocked:
            def insert_then_fail(*args, **kwargs):
                if mocked.call_count == 1:
                    return create(*args, **kwargs)
                raise DatabaseError("test")
            mocked.side_effect = insert_then_fail
            with self.assertLogs("api.holidays", level="ERROR"):
                result = self.client.post("/api/holidays/sync", **self.auth)
        self.assertEqual(result.status_code, 503)
        self.assertEqual(Holiday.objects.count(), 0)
