from unittest.mock import patch

from django.db import DatabaseError, IntegrityError, connection
from django.test import Client, TransactionTestCase, override_settings

from .authentication import create_session_token
from .models import Branch, ClientProfile, Company, Contract, HardwareCategory, ServiceType, StaffProfile, SupportPersonnel, Ticket, User


@override_settings(ALLOWED_HOSTS=["testserver"])
class HardwareCategoryIntegrationTests(TransactionTestCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        with connection.schema_editor() as editor:
            for model in (User, ClientProfile, StaffProfile, Company, ServiceType, Contract, HardwareCategory, Branch, SupportPersonnel, Ticket):
                editor.create_model(model)

    @classmethod
    def tearDownClass(cls):
        with connection.schema_editor() as editor:
            for model in (Ticket, SupportPersonnel, Branch, HardwareCategory, Contract, ServiceType, Company, StaffProfile, ClientProfile, User):
                editor.delete_model(model)
        super().tearDownClass()

    def setUp(self):
        self.admin = User.objects.create_user(email="admin@example.com", password="Password-123", role="admin")
        self.customer = User.objects.create_user(email="client@example.com", password="Password-123", role="cliente")
        self.auth = {"HTTP_AUTHORIZATION": f"Bearer {create_session_token(self.admin)}"}
        self.client = Client()
        self.service = ServiceType.objects.create(name="Redes", description="Soporte", active=False)
        self.data = {"name": "Servidores", "description": "Equipos críticos"}

    def tearDown(self):
        HardwareCategory.objects.all().delete()
        Contract.objects.all().delete()
        ServiceType.objects.all().delete()
        User.objects.all().delete()
        super().tearDown()

    def post(self, data):
        return self.client.post("/api/hardware-categories", data, content_type="application/json", **self.auth)

    def patch_category(self, pk, data):
        return self.client.patch(f"/api/hardware-categories/{pk}", data, content_type="application/json", **self.auth)

    def test_create_edit_states_links_and_delete(self):
        result = self.post(self.data)
        self.assertEqual(result.status_code, 201, result.content)
        category = result.json()["category"]
        self.assertTrue(category["active"])
        self.assertIsNone(category["service_type_id"])
        self.assertIsNone(category["service_type_name"])
        pk = category["id"]
        result = self.patch_category(pk, {"name": "Routers", "service_type_id": self.service.pk})
        self.assertEqual(result.status_code, 200, result.content)
        self.assertEqual(result.json()["category"]["service_type_name"], "Redes")
        self.assertEqual(self.client.get("/api/hardware-categories", **self.auth).json()["categories"][0]["service_type_id"], self.service.pk)
        for active in (False, True):
            self.assertEqual(self.patch_category(pk, {"active": active}).status_code, 200)
            self.assertEqual(HardwareCategory.objects.get(pk=pk).service_type_id, self.service.pk)
        self.assertEqual(self.patch_category(pk, {"service_type_id": None}).status_code, 200)
        self.assertIsNone(HardwareCategory.objects.get(pk=pk).service_type_id)
        self.assertEqual(self.client.delete(f"/api/hardware-categories/{pk}", **self.auth).status_code, 200)
        self.assertEqual(self.client.delete(f"/api/hardware-categories/{pk}", **self.auth).status_code, 404)

    def test_permissions_validation_and_duplicate(self):
        user_auth = {"HTTP_AUTHORIZATION": f"Bearer {create_session_token(self.customer)}"}
        self.assertEqual(self.client.get("/api/hardware-categories").status_code, 401)
        for method, path, data in (
            ("get", "/api/hardware-categories", None), ("post", "/api/hardware-categories", self.data),
            ("patch", "/api/hardware-categories/1", {"active": False}), ("delete", "/api/hardware-categories/1", None),
        ):
            result = getattr(self.client, method)(path, data=data, content_type="application/json", **user_auth) if data else getattr(self.client, method)(path, **user_auth)
            self.assertEqual(result.status_code, 403)
        for changes in ({"name": " "}, {"name": "x" * 101}, {"description": " "}, {"description": None},
                        {"service_type_id": 99999}, {"active": None}, {"unknown": "x"}):
            result = self.post({**self.data, **changes})
            self.assertEqual(result.status_code, 400, result.content)
            self.assertTrue(result.json()["message"])
        self.assertEqual(self.post(self.data).status_code, 201)
        self.assertEqual(self.post(self.data).status_code, 400)
        self.assertEqual(self.patch_category(99999, {"active": False}).status_code, 404)

    def test_deleting_service_preserves_linked_category(self):
        result = self.post({**self.data, "service_type_id": self.service.pk})
        self.assertEqual(result.status_code, 201, result.content)
        pk = result.json()["category"]["id"]
        self.assertEqual(self.client.delete(f"/api/service-types/{self.service.pk}", **self.auth).status_code, 200)
        self.assertIsNone(HardwareCategory.objects.get(pk=pk).service_type_id)
        category = self.client.get("/api/hardware-categories", **self.auth).json()["categories"][0]
        self.assertIsNone(category["service_type_id"])
        self.assertIsNone(category["service_type_name"])

    def test_database_and_integrity_errors(self):
        category = HardwareCategory.objects.create(**self.data)
        with patch.object(HardwareCategory, "delete", side_effect=IntegrityError("referenced")):
            with self.assertLogs("api.hardware_categories", level="ERROR"):
                result = self.client.delete(f"/api/hardware-categories/{category.pk}", **self.auth)
        self.assertEqual(result.status_code, 409)
        self.assertTrue(HardwareCategory.objects.filter(pk=category.pk).exists())
        with patch.object(HardwareCategory.objects, "select_related", side_effect=DatabaseError("unavailable")):
            with self.assertLogs("api.hardware_categories", level="ERROR"):
                self.assertEqual(self.client.get("/api/hardware-categories", **self.auth).status_code, 503)
