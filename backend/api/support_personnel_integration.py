from unittest.mock import patch

from django.db import DatabaseError, IntegrityError, connection
from django.test import Client, TransactionTestCase, override_settings

from .authentication import create_session_token
from .models import Branch, ClientProfile, Company, HardwareCategory, ServiceType, StaffProfile, SupportPersonnel, Ticket, User


@override_settings(ALLOWED_HOSTS=["testserver"])
class SupportPersonnelIntegrationTests(TransactionTestCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        with connection.schema_editor() as editor:
            for model in (User, ClientProfile, StaffProfile, Company, ServiceType, HardwareCategory, Branch, SupportPersonnel, Ticket):
                editor.create_model(model)

    @classmethod
    def tearDownClass(cls):
        with connection.schema_editor() as editor:
            for model in (Ticket, SupportPersonnel, Branch, HardwareCategory, ServiceType, Company, StaffProfile, ClientProfile, User):
                editor.delete_model(model)
        super().tearDownClass()

    def setUp(self):
        self.admin = User.objects.create_user(email="admin@example.com", password="test-pass", role="admin")
        self.support = User.objects.create_user(email="support@example.com", password="test-pass", role="soporte", is_active=False)
        self.executive = User.objects.create_user(email="executive@example.com", password="test-pass", role="ejecutivo")
        self.client_user = User.objects.create_user(email="client@example.com", password="test-pass", role="cliente")
        self.tech = User.objects.create_user(email="tech@example.com", password="test-pass", role="tech")
        StaffProfile.objects.create(user=self.support, full_name="Persona Soporte")
        self.category = HardwareCategory.objects.create(name="Equipos", description="Activos críticos", active=False)
        self.branch = Branch.objects.create(name="Centro", address="Alameda", commune="Santiago", region="Metropolitana", active=False)
        self.other_branch = Branch.objects.create(name="Norte", address="Calle 1", commune="Santiago", region="Metropolitana")
        self.auth = {"HTTP_AUTHORIZATION": f"Bearer {create_session_token(self.admin)}"}
        self.client = Client()

    def tearDown(self):
        SupportPersonnel.objects.all().delete()
        HardwareCategory.objects.all().delete()
        User.objects.all().delete()
        Branch.objects.all().delete()
        super().tearDown()

    def post(self, data):
        return self.client.post("/api/support-personnel", data, content_type="application/json", **self.auth)

    def update(self, pk, data):
        return self.client.patch(f"/api/support-personnel/{pk}", data, content_type="application/json", **self.auth)

    def test_create_update_availability_and_delete_preserves_account(self):
        response = self.post({"user_id": self.support.pk, "branch_id": self.branch.pk, "category_id": self.category.pk})
        self.assertEqual(response.status_code, 201, response.content)
        person = response.json()["person"]
        self.assertEqual(person["user_name"], "Persona Soporte")
        self.assertFalse(person["user_active"])
        self.assertEqual(person["category_name"], "Equipos")
        self.assertEqual(person["branch_id"], self.branch.pk)
        self.assertEqual(person["branch_name"], "Centro")
        self.assertFalse(person["branch_active"])
        self.assertEqual(person["availability"], "Disponible")
        self.assertTrue(person["active"])
        pk = person["id"]
        for value in ("Disponible", "Asignado", "En Terreno", "Licencia", "No Disponible"):
            self.assertEqual(self.update(pk, {"availability": value}).status_code, 200)
            self.assertEqual(SupportPersonnel.objects.get(pk=pk).availability, value)
        for active in (False, True):
            self.assertEqual(self.update(pk, {"active": active}).status_code, 200)
            self.support.refresh_from_db()
            self.assertFalse(self.support.is_active)
        self.assertEqual(self.update(pk, {"category_id": None, "user_id": self.executive.pk, "branch_id": self.other_branch.pk}).status_code, 200)
        listed = self.client.get("/api/support-personnel", **self.auth).json()["personnel"][0]
        self.assertEqual(listed["user_id"], self.executive.pk)
        self.assertEqual(listed["branch_name"], "Norte")
        self.assertIsNone(listed["category_name"])
        self.assertEqual(self.client.delete(f"/api/support-personnel/{pk}", **self.auth).status_code, 200)
        self.assertTrue(User.objects.filter(pk=self.executive.pk).exists())
        self.assertEqual(self.client.delete(f"/api/support-personnel/{pk}", **self.auth).status_code, 404)

    def test_users_selection_validation_and_historical_role(self):
        users = self.client.get("/api/support-personnel/users", **self.auth).json()["users"]
        self.assertEqual({user["id"] for user in users}, {self.support.pk, self.executive.pk})
        self.assertEqual(set(users[0]), {"id", "name", "email", "role", "active"})
        for data in ({}, {"user_id": self.support.pk}, {"user_id": self.support.pk, "branch_id": None},
                     {"user_id": self.support.pk, "branch_id": 9999},
                     {"user_id": self.admin.pk, "branch_id": self.branch.pk},
                     {"user_id": self.client_user.pk, "branch_id": self.branch.pk},
                     {"user_id": self.tech.pk, "branch_id": self.branch.pk},
                     {"user_id": 9999, "branch_id": self.branch.pk},
                     {"user_id": self.support.pk, "branch_id": self.branch.pk, "category_id": 9999},
                     {"user_id": self.support.pk, "branch_id": self.branch.pk, "availability": "en terreno"},
                     {"user_id": self.support.pk, "branch_id": self.branch.pk, "active": None},
                     {"user_id": self.support.pk, "branch_id": self.branch.pk, "unknown": 1}):
            response = self.post(data)
            self.assertEqual(response.status_code, 400, response.content)
            self.assertTrue(response.json()["message"])
        person_id = self.post({"user_id": self.support.pk, "branch_id": self.branch.pk}).json()["person"]["id"]
        self.assertEqual(self.post({"user_id": self.support.pk, "branch_id": self.branch.pk}).status_code, 400)
        self.assertEqual(self.update(person_id, {"branch_id": None}).status_code, 400)
        self.assertEqual(self.update(person_id, {"branch_id": 9999}).status_code, 400)
        self.assertEqual(self.update(person_id, {"user_id": self.support.pk}).status_code, 200)
        executive_person = self.post({"user_id": self.executive.pk, "branch_id": self.branch.pk}).json()["person"]["id"]
        self.assertEqual(self.update(executive_person, {"user_id": self.support.pk}).status_code, 400)
        self.support.role = "cliente"
        self.support.save(update_fields=["role"])
        self.assertEqual(self.update(person_id, {"user_id": self.support.pk, "availability": "Licencia"}).status_code, 200)
        self.assertEqual(self.update(person_id, {"user_id": self.tech.pk}).status_code, 400)
        self.assertEqual(self.update(9999, {"active": False}).status_code, 404)

    def test_deleting_category_keeps_person(self):
        person_id = self.post({"user_id": self.support.pk, "branch_id": self.branch.pk, "category_id": self.category.pk}).json()["person"]["id"]
        response = self.client.delete(f"/api/hardware-categories/{self.category.pk}", **self.auth)
        self.assertEqual(response.status_code, 200, response.content)
        self.assertIsNone(SupportPersonnel.objects.get(pk=person_id).category_id)

    def test_deleting_user_cascades_to_personnel(self):
        person_id = self.post({"user_id": self.support.pk, "branch_id": self.branch.pk}).json()["person"]["id"]
        self.support.delete()
        self.assertFalse(SupportPersonnel.objects.filter(pk=person_id).exists())

    def test_branch_deletion_restricted_until_reassigned(self):
        person_id = self.post({"user_id": self.support.pk, "branch_id": self.branch.pk}).json()["person"]["id"]
        self.assertEqual(self.update(person_id, {"active": False}).status_code, 200)
        with self.assertLogs("api.branches", level="ERROR"):
            response = self.client.delete(f"/api/branches/{self.branch.pk}", **self.auth)
        self.assertEqual(response.status_code, 409)
        self.assertTrue(response.json()["message"])
        self.assertTrue(Branch.objects.filter(pk=self.branch.pk).exists())
        self.assertEqual(SupportPersonnel.objects.get(pk=person_id).branch_id, self.branch.pk)
        self.assertEqual(self.update(person_id, {"branch_id": self.other_branch.pk}).status_code, 200)
        self.assertEqual(self.client.delete(f"/api/branches/{self.branch.pk}", **self.auth).status_code, 200)

    def test_permissions_and_database_errors(self):
        other_auth = {"HTTP_AUTHORIZATION": f"Bearer {create_session_token(self.executive)}"}
        for method, url, data in (
            ("get", "/api/support-personnel", None), ("get", "/api/support-personnel/users", None),
            ("post", "/api/support-personnel", {"user_id": self.executive.pk}),
            ("patch", "/api/support-personnel/1", {"active": False}), ("delete", "/api/support-personnel/1", None),
        ):
            request = getattr(self.client, method)
            args = {"data": data, "content_type": "application/json"} if data else {}
            self.assertEqual(request(url, **args).status_code, 401)
            self.assertEqual(request(url, **args, **other_auth).status_code, 403)
        with patch.object(SupportPersonnel.objects, "select_related", side_effect=DatabaseError("unavailable")):
            with self.assertLogs("api.support_personnel", level="ERROR"):
                self.assertEqual(self.client.get("/api/support-personnel", **self.auth).status_code, 503)
        with patch.object(SupportPersonnel.objects, "create", side_effect=IntegrityError("duplicate")):
            with self.assertLogs("api.support_personnel", level="ERROR"):
                response = self.post({"user_id": self.support.pk, "branch_id": self.branch.pk})
        self.assertEqual(response.status_code, 409)
