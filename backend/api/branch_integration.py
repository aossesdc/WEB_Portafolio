from unittest.mock import patch

from django.db import IntegrityError, connection
from django.test import Client, TransactionTestCase, override_settings

from .authentication import create_session_token
from .models import Branch, ClientProfile, Company, HardwareCategory, ServiceType, StaffProfile, SupportPersonnel, Ticket, User


@override_settings(ALLOWED_HOSTS=["testserver"])
class BranchIntegrationTests(TransactionTestCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        with connection.schema_editor() as editor:
            for model in (User, ClientProfile, StaffProfile, Company, Branch, ServiceType, HardwareCategory, SupportPersonnel, Ticket):
                editor.create_model(model)

    @classmethod
    def tearDownClass(cls):
        with connection.schema_editor() as editor:
            for model in (Ticket, SupportPersonnel, HardwareCategory, ServiceType, Branch, Company, StaffProfile, ClientProfile, User):
                editor.delete_model(model)
        super().tearDownClass()

    def setUp(self):
        self.admin = User.objects.create_user(email="admin@example.com", password="Example-Password-892!", role="admin")
        self.customer = User.objects.create_user(email="client@example.com", password="Example-Password-893!", role="cliente")
        self.auth = {"HTTP_AUTHORIZATION": f"Bearer {create_session_token(self.admin)}"}
        self.client = Client()
        self.data = {"name": "Centro", "address": "Alameda 123", "commune": "Santiago", "region": "Metropolitana"}

    def tearDown(self):
        Branch.objects.all().delete()
        User.objects.all().delete()
        super().tearDown()

    def test_create_list_update_deactivate_reactivate_delete(self):
        result = self.client.post("/api/branches", self.data, content_type="application/json", **self.auth)
        self.assertEqual(result.status_code, 201, result.content)
        branch_id = result.json()["branch"]["id"]
        self.assertTrue(result.json()["branch"]["active"])
        self.assertEqual(self.client.get("/api/branches", **self.auth).json()["branches"][0]["name"], "Centro")
        for data in ({"name": "Nuevo"}, {"active": False}, {"active": True}):
            result = self.client.patch(f"/api/branches/{branch_id}", data, content_type="application/json", **self.auth)
            self.assertEqual(result.status_code, 200)
        self.assertEqual(Branch.objects.get(pk=branch_id).name, "Nuevo")
        self.assertTrue(Branch.objects.get(pk=branch_id).active)
        self.assertEqual(self.client.delete(f"/api/branches/{branch_id}", **self.auth).status_code, 200)
        self.assertFalse(Branch.objects.filter(pk=branch_id).exists())
        self.assertEqual(self.client.delete(f"/api/branches/{branch_id}", **self.auth).status_code, 404)

    def test_permissions_and_validation(self):
        branch = Branch.objects.create(**self.data)
        user_auth = {"HTTP_AUTHORIZATION": f"Bearer {create_session_token(self.customer)}"}
        self.assertEqual(self.client.get("/api/branches").status_code, 401)
        for method, path, data in (
            ("get", "/api/branches", None), ("post", "/api/branches", self.data),
            ("patch", f"/api/branches/{branch.pk}", {"active": False}),
            ("delete", f"/api/branches/{branch.pk}", None),
        ):
            result = getattr(self.client, method)(path, data=data, content_type="application/json", **user_auth) if data else getattr(self.client, method)(path, **user_auth)
            self.assertEqual(result.status_code, 403)
        for data in ({**self.data, "name": "   "}, {**self.data, "address": "x" * 256},
                     {**self.data, "unknown": "x"}, {**self.data, "active": None}):
            result = self.client.post("/api/branches", data, content_type="application/json", **self.auth)
            self.assertEqual(result.status_code, 400, result.content)
        self.assertEqual(Branch.objects.count(), 1)

    def test_foreign_key_conflict_is_reported_without_deleting(self):
        branch = Branch.objects.create(**self.data)
        with patch.object(Branch, "delete", side_effect=IntegrityError("referenced")):
            with self.assertLogs("api.branches", level="ERROR"):
                result = self.client.delete(f"/api/branches/{branch.pk}", **self.auth)
        self.assertEqual(result.status_code, 409)
        self.assertTrue(Branch.objects.filter(pk=branch.pk).exists())
