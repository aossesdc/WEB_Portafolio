from unittest.mock import patch

from django.db import DatabaseError, IntegrityError, connection
from django.test import Client, TransactionTestCase, override_settings

from .authentication import create_session_token
from .models import Branch, ClientProfile, Company, Contract, HardwareCategory, ServiceType, StaffProfile, SupportPersonnel, Ticket, User


@override_settings(ALLOWED_HOSTS=["testserver"])
class ServiceTypeIntegrationTests(TransactionTestCase):
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
        self.data = {"name": "Redes", "description": "Soporte de redes", "priority": "Media"}

    def tearDown(self):
        ServiceType.objects.all().delete()
        User.objects.all().delete()
        super().tearDown()

    def post(self, data):
        return self.client.post("/api/service-types", data, content_type="application/json", **self.auth)

    def patch_service(self, pk, data):
        return self.client.patch(f"/api/service-types/{pk}", data, content_type="application/json", **self.auth)

    def test_create_list_update_state_and_delete(self):
        result = self.post(self.data)
        self.assertEqual(result.status_code, 201, result.content)
        service = result.json()["service_type"]
        self.assertTrue(service["active"])
        self.assertEqual(self.client.get("/api/service-types", **self.auth).json()["service_types"], [service])
        pk = service["id"]
        for data in ({"name": "Soporte", "description": "Servicio actualizado", "priority": "Crítica"},
                     {"active": False}, {"active": True}):
            self.assertEqual(self.patch_service(pk, data).status_code, 200)
        service = ServiceType.objects.get(pk=pk)
        self.assertEqual((service.name, service.priority, service.active), ("Soporte", "Crítica", True))
        self.assertEqual(self.client.delete(f"/api/service-types/{pk}", **self.auth).status_code, 200)
        self.assertFalse(ServiceType.objects.filter(pk=pk).exists())
        self.assertEqual(self.client.delete(f"/api/service-types/{pk}", **self.auth).status_code, 404)

    def test_permissions_validation_and_duplicates(self):
        user_auth = {"HTTP_AUTHORIZATION": f"Bearer {create_session_token(self.customer)}"}
        self.assertEqual(self.client.get("/api/service-types").status_code, 401)
        for method, path, data in (
            ("get", "/api/service-types", None), ("post", "/api/service-types", self.data),
            ("patch", "/api/service-types/1", {"active": False}), ("delete", "/api/service-types/1", None),
        ):
            result = getattr(self.client, method)(path, data=data, content_type="application/json", **user_auth) if data else getattr(self.client, method)(path, **user_auth)
            self.assertEqual(result.status_code, 403)
        for changes in ({"name": " "}, {"name": "x" * 101}, {"description": "  "},
                        {"description": None}, {"priority": "Urgente"}, {"active": None}, {"unknown": "x"}):
            result = self.post({**self.data, **changes})
            self.assertEqual(result.status_code, 400, result.content)
            self.assertTrue(result.json()["message"])
        result = self.post(self.data)
        self.assertEqual(result.status_code, 201)
        duplicate = self.post(self.data)
        self.assertEqual(duplicate.status_code, 400)
        self.assertTrue(duplicate.json()["message"])
        self.assertEqual(self.patch_service(9999, {"active": False}).status_code, 404)
        for priority in ("Baja", "Media", "Alta", "Crítica"):
            self.assertEqual(self.patch_service(result.json()["service_type"]["id"], {"priority": priority}).status_code, 200)
        result = self.post({"name": "Nuevo", "description": "Otro"})
        self.assertEqual(result.json()["service_type"]["priority"], "Media")

    def test_database_and_integrity_errors(self):
        service = ServiceType.objects.create(**self.data)
        with patch.object(ServiceType, "delete", side_effect=IntegrityError("referenced")):
            with self.assertLogs("api.service_types", level="ERROR"):
                result = self.client.delete(f"/api/service-types/{service.pk}", **self.auth)
        self.assertEqual(result.status_code, 409)
        self.assertTrue(ServiceType.objects.filter(pk=service.pk).exists())
        with patch.object(ServiceType.objects, "order_by", side_effect=DatabaseError("unavailable")):
            with self.assertLogs("api.service_types", level="ERROR"):
                self.assertEqual(self.client.get("/api/service-types", **self.auth).status_code, 503)
