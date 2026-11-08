from unittest.mock import patch

from django.db import IntegrityError, connection
from django.test import Client, TransactionTestCase, override_settings

from .authentication import create_session_token
from .models import Branch, ClientProfile, Company, Contract, HardwareCategory, ServiceType, StaffProfile, SupportPersonnel, Ticket, User


@override_settings(ALLOWED_HOSTS=["testserver"])
class ContractIntegrationTests(TransactionTestCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        with connection.schema_editor() as editor:
            for model in (User, ClientProfile, StaffProfile, Company, ServiceType, Contract, HardwareCategory, Branch, SupportPersonnel, Ticket):
                editor.create_model(model)
        with connection.cursor() as cursor:
            cursor.execute("""
                CREATE TRIGGER test_contract_code AFTER INSERT ON tb_contratos
                WHEN NEW.codigo_contrato IS NULL
                BEGIN
                    UPDATE tb_contratos SET codigo_contrato = 'TEST-' || NEW.id WHERE id = NEW.id;
                END
            """)

    @classmethod
    def tearDownClass(cls):
        with connection.schema_editor() as editor:
            for model in (Ticket, SupportPersonnel, Branch, HardwareCategory, Contract, ServiceType, Company, StaffProfile, ClientProfile, User):
                editor.delete_model(model)
        super().tearDownClass()

    def setUp(self):
        self.admin = User.objects.create_user(email="admin@example.com", password="Test-password-123", role="admin")
        self.customer = User.objects.create_user(email="client@example.com", password="Test-password-123", role="cliente")
        self.auth = {"HTTP_AUTHORIZATION": f"Bearer {create_session_token(self.admin)}"}
        self.client = Client()
        self.company = Company.objects.create(rut="76.123.456-K", name="Empresa", email="empresa@example.com")
        self.data = {"company_id": self.company.pk, "start_date": "2026-01-01", "end_date": "2026-12-31",
                     "coverage": "8x5", "amount": "125.50", "status": "Activo",
                     "description": "Soporte continuo"}

    def tearDown(self):
        Contract.objects.all().delete()
        ServiceType.objects.all().delete()
        Company.objects.all().delete()
        User.objects.all().delete()
        super().tearDown()

    def post(self, data):
        return self.client.post("/api/contracts", data, content_type="application/json", **self.auth)

    def patch_contract(self, pk, data):
        return self.client.patch(f"/api/contracts/{pk}", data, content_type="application/json", **self.auth)

    def test_create_search_data_update_states_and_delete(self):
        result = self.post(self.data)
        self.assertEqual(result.status_code, 201, result.content)
        contract = result.json()["contract"]
        self.assertEqual(contract["code"], f"TEST-{contract['id']}")
        self.assertEqual(contract["amount"], "125.50")
        self.assertEqual(contract["company_name"], "Empresa")
        pk = contract["id"]
        self.assertEqual(len(self.client.get("/api/contracts", **self.auth).json()["contracts"]), 1)
        for data in ({"coverage": "24x7"}, {"status": "Suspendido"}, {"status": "Vencido"}, {"status": "Activo"}):
            self.assertEqual(self.patch_contract(pk, data).status_code, 200)
        self.assertEqual(Contract.objects.get(pk=pk).status, "Activo")
        with self.assertLogs("api.companies", level="ERROR"):
            self.assertEqual(self.client.delete(f"/api/companies/{self.company.pk}", **self.auth).status_code, 409)
        self.assertEqual(self.client.delete(f"/api/contracts/{pk}", **self.auth).status_code, 200)
        self.assertEqual(self.client.delete(f"/api/contracts/{pk}", **self.auth).status_code, 404)

    def test_validation_and_permissions(self):
        user_auth = {"HTTP_AUTHORIZATION": f"Bearer {create_session_token(self.customer)}"}
        self.assertEqual(self.client.get("/api/contracts").status_code, 401)
        for method, path, data in (
            ("get", "/api/contracts", None), ("post", "/api/contracts", self.data),
            ("patch", "/api/contracts/1", {"status": "Activo"}), ("delete", "/api/contracts/1", None),
        ):
            result = getattr(self.client, method)(path, data=data, content_type="application/json", **user_auth) if data else getattr(self.client, method)(path, **user_auth)
            self.assertEqual(result.status_code, 403)
        for changes in ({"company_id": 9999}, {"end_date": "2026-01-01"}, {"coverage": "9x5"},
                        {"status": "Otro"}, {"amount": "12.345"}, {"code": "manual"}):
            result = self.post({**self.data, **changes})
            self.assertEqual(result.status_code, 400, result.content)
            self.assertTrue(result.json()["message"])
        result = self.post(self.data)
        pk = result.json()["contract"]["id"]
        self.assertEqual(self.patch_contract(pk, {"start_date": "2027-01-01"}).status_code, 400)
        self.assertEqual(self.patch_contract(pk, {"end_date": "2026-01-01"}).status_code, 400)
        self.assertEqual(self.patch_contract(9999, {"status": "Activo"}).status_code, 404)

    def test_missing_trigger_rolls_back(self):
        with connection.cursor() as cursor:
            cursor.execute("DROP TRIGGER test_contract_code")
        try:
            with self.assertLogs("api.contracts", level="ERROR"):
                result = self.post(self.data)
            self.assertEqual(result.status_code, 503)
            self.assertIn("trigger", result.json()["message"])
            self.assertFalse(Contract.objects.exists())
        finally:
            with connection.cursor() as cursor:
                cursor.execute("""
                    CREATE TRIGGER test_contract_code AFTER INSERT ON tb_contratos
                    WHEN NEW.codigo_contrato IS NULL
                    BEGIN
                        UPDATE tb_contratos SET codigo_contrato = 'TEST-' || NEW.id WHERE id = NEW.id;
                    END
                """)

    def test_integrity_errors_are_reported(self):
        with patch.object(Contract.objects, "create", side_effect=IntegrityError("conflict")):
            with self.assertLogs("api.contracts", level="ERROR"):
                result = self.post(self.data)
        self.assertEqual(result.status_code, 409)
        self.assertFalse(Contract.objects.exists())

    def test_description_creation_and_edit(self):
        description = "Soporte de redes\nAtención continua"
        result = self.post({**self.data, "description": description})
        self.assertEqual(result.status_code, 201, result.content)
        contract = result.json()["contract"]
        pk = contract["id"]
        self.assertEqual(contract["description"], description)
        self.assertEqual(Contract.objects.get(pk=pk).description, description)
        self.assertEqual(self.client.get("/api/contracts", **self.auth).json()["contracts"][0]["description"], description)
        self.assertEqual(self.patch_contract(pk, {"status": "Suspendido"}).status_code, 200)
        self.assertEqual(Contract.objects.get(pk=pk).description, description)
        result = self.patch_contract(pk, {"description": "Detalle actualizado"})
        self.assertEqual(result.json()["contract"]["description"], "Detalle actualizado")
        self.assertEqual(Contract.objects.get(pk=pk).description, "Detalle actualizado")
        for value in (" \n ", "", None, "abcdefghijklm n 12345!!!", "á" * 14):
            with self.subTest(value=value):
                result = self.patch_contract(pk, {"description": value})
                self.assertEqual(result.status_code, 400, result.content)
                self.assertEqual(Contract.objects.get(pk=pk).description, "Detalle actualizado")
                self.assertEqual(self.post({**self.data, "description": value}).status_code, 400)
        no_description = {key: value for key, value in self.data.items() if key != "description"}
        self.assertEqual(self.post(no_description).status_code, 400)
        for value in ("abcde fghij klmno", "a\u0301" * 15):
            result = self.post({**self.data, "description": value})
            self.assertEqual(result.status_code, 201, result.content)
            self.assertEqual(result.json()["contract"]["description"], value)

    def test_existing_missing_description_can_change_status_but_requires_edit(self):
        contract = Contract.objects.create(
            company=self.company, start_date="2026-01-01", end_date="2026-12-31",
            coverage="8x5", description=None,
        )
        self.assertEqual(self.patch_contract(contract.pk, {"status": "Suspendido"}).status_code, 200)
        result = self.patch_contract(contract.pk, {"coverage": "24x7"})
        self.assertEqual(result.status_code, 400)
        self.assertIn("15 letras", result.json()["message"])
        contract.refresh_from_db()
        self.assertIsNone(contract.description)
        self.assertEqual(contract.coverage, "8x5")
        self.assertEqual(self.patch_contract(contract.pk, {"coverage": "24x7", "description": "Soporte continuo"}).status_code, 200)

    def test_optional_service_link_create_change_clear_and_invalid(self):
        active = ServiceType.objects.create(name="Redes", description="Redes", priority="Media", active=True)
        inactive = ServiceType.objects.create(name="Equipos", description="Equipos", priority="Baja", active=False)
        result = self.post(self.data)
        self.assertEqual(result.status_code, 201, result.content)
        contract = result.json()["contract"]
        self.assertIsNone(contract["service_type_id"])
        self.assertIsNone(contract["service_type_name"])
        pk = contract["id"]
        for service in (active, inactive):
            result = self.patch_contract(pk, {"service_type_id": service.pk})
            self.assertEqual(result.status_code, 200, result.content)
            self.assertEqual(result.json()["contract"]["service_type_name"], service.name)
            self.assertEqual(Contract.objects.get(pk=pk).service_type_id, service.pk)
        listing = self.client.get("/api/contracts", **self.auth).json()["contracts"][0]
        self.assertEqual(listing["service_type_id"], inactive.pk)
        self.assertEqual(listing["service_type_name"], inactive.name)
        self.assertEqual(self.patch_contract(pk, {"status": "Suspendido"}).status_code, 200)
        self.assertEqual(Contract.objects.get(pk=pk).service_type_id, inactive.pk)
        self.assertEqual(self.patch_contract(pk, {"service_type_id": 99999}).status_code, 400)
        self.assertEqual(Contract.objects.get(pk=pk).service_type_id, inactive.pk)
        self.assertEqual(self.patch_contract(pk, {"service_type_id": None}).status_code, 200)
        self.assertIsNone(Contract.objects.get(pk=pk).service_type_id)
        result = self.post({**self.data, "service_type_id": inactive.pk})
        self.assertEqual(result.status_code, 201, result.content)
        self.assertEqual(result.json()["contract"]["service_type_name"], inactive.name)
        self.assertEqual(self.post({**self.data, "service_type_id": 99999}).status_code, 400)

    def test_deleting_service_clears_link_preserves_contract(self):
        service = ServiceType.objects.create(name="Redes", description="Redes", active=True)
        result = self.post({**self.data, "service_type_id": service.pk})
        pk = result.json()["contract"]["id"]
        self.assertEqual(self.client.delete(f"/api/service-types/{service.pk}", **self.auth).status_code, 200)
        self.assertIsNone(Contract.objects.get(pk=pk).service_type_id)
        listing = self.client.get("/api/contracts", **self.auth).json()["contracts"][0]
        self.assertIsNone(listing["service_type_id"])
        self.assertIsNone(listing["service_type_name"])
