from unittest.mock import patch

from django.db import IntegrityError, connection
from django.test import Client, TransactionTestCase, override_settings

from .authentication import create_session_token
from .models import Branch, ClientProfile, Company, Contract, HardwareCategory, ServiceType, StaffProfile, SupportPersonnel, Ticket, User


@override_settings(ALLOWED_HOSTS=["testserver"])
class CompanyIntegrationTests(TransactionTestCase):
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
        self.admin = User.objects.create_user(email="admin@example.com", password="Example-Password-892!", role="admin")
        self.customer = User.objects.create_user(email="cliente@example.com", password="Example-Password-893!", role="cliente")
        self.auth = {"HTTP_AUTHORIZATION": f"Bearer {create_session_token(self.admin)}"}
        self.client = Client()
        self.data = {"rut": "76.123.456-K", "name": "Empresa", "email": "contacto@example.com"}

    def tearDown(self):
        Company.objects.all().delete()
        User.objects.all().delete()
        super().tearDown()

    def post(self, data):
        return self.client.post("/api/companies", data, content_type="application/json", **self.auth)

    def patch_company(self, company_id, data):
        return self.client.patch(f"/api/companies/{company_id}", data, content_type="application/json", **self.auth)

    def test_create_list_update_state_link_and_delete(self):
        result = self.post({**self.data, "user_id": self.customer.pk})
        self.assertEqual(result.status_code, 201, result.content)
        pk = result.json()["company"]["id"]
        self.assertEqual(result.json()["company"]["user_id"], self.customer.pk)
        self.assertTrue(result.json()["company"]["active"])
        self.assertEqual(len(self.client.get("/api/companies", **self.auth).json()["companies"]), 1)
        for data in ({"name": "Nueva", "business": "Servicios", "phone": "123"},
                     {"active": False}, {"active": True}):
            self.assertEqual(self.patch_company(pk, data).status_code, 200)
            self.assertEqual(Company.objects.get(pk=pk).user_id, self.customer.pk)
        self.assertEqual(self.patch_company(pk, {"user_id": None}).status_code, 200)
        company = Company.objects.get(pk=pk)
        self.assertEqual(company.name, "Nueva")
        self.assertIsNone(company.user_id)
        self.assertEqual(self.client.delete(f"/api/companies/{pk}", **self.auth).status_code, 200)
        self.assertFalse(Company.objects.filter(pk=pk).exists())
        self.assertEqual(self.client.delete(f"/api/companies/{pk}", **self.auth).status_code, 404)

    def test_permissions_validation_and_duplicate(self):
        user_auth = {"HTTP_AUTHORIZATION": f"Bearer {create_session_token(self.customer)}"}
        self.assertEqual(self.client.get("/api/companies").status_code, 401)
        for method, path, data in (
            ("get", "/api/companies", None), ("get", "/api/companies/clients", None),
            ("post", "/api/companies", self.data), ("patch", "/api/companies/1", {"active": False}),
            ("delete", "/api/companies/1", None),
        ):
            result = getattr(self.client, method)(path, data=data, content_type="application/json", **user_auth) if data else getattr(self.client, method)(path, **user_auth)
            self.assertEqual(result.status_code, 403)
        for data in ({**self.data, "name": "   "}, {**self.data, "email": "invalid"},
                     {**self.data, "rut": "x" * 13}, {**self.data, "user_id": self.admin.pk},
                     {**self.data, "user_id": 99999}, {**self.data, "active": None}):
            self.assertEqual(self.post(data).status_code, 400)
        result = self.post(self.data)
        self.assertEqual(result.status_code, 201)
        self.assertIsNone(result.json()["company"]["user_id"])
        self.assertEqual(self.post(self.data).status_code, 400)
        clients = self.client.get("/api/companies/clients", **self.auth).json()["clients"]
        self.assertEqual([item["id"] for item in clients], [self.customer.pk])

    def test_referenced_company_cannot_be_deleted(self):
        company = Company.objects.create(**self.data)
        with patch.object(Company, "delete", side_effect=IntegrityError("referenced")):
            with self.assertLogs("api.companies", level="ERROR"):
                result = self.client.delete(f"/api/companies/{company.pk}", **self.auth)
        self.assertEqual(result.status_code, 409)
        self.assertTrue(Company.objects.filter(pk=company.pk).exists())
