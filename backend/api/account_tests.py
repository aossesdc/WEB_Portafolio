from django.db import connection
from django.test import Client, TransactionTestCase, override_settings

from .authentication import create_session_token
from .models import Branch, ClientProfile, Company, HardwareCategory, ServiceType, StaffProfile, SupportPersonnel, Ticket, User


@override_settings(ALLOWED_HOSTS=["testserver"])
class AccountApiTests(TransactionTestCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        with connection.schema_editor() as editor:
            editor.create_model(User)
            editor.create_model(ClientProfile)
            editor.create_model(StaffProfile)
            editor.create_model(Company)
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
            editor.delete_model(Company)
            editor.delete_model(StaffProfile)
            editor.delete_model(ClientProfile)
            editor.delete_model(User)
        super().tearDownClass()

    def setUp(self):
        self.admin = User.objects.create_user(email="admin@example.com", password="Safe-Password-890!", role="admin")
        StaffProfile.objects.create(user=self.admin, full_name="Admin")
        self.customer = User.objects.create_user(email="client@example.com", password="Safe-Password-891!", role="cliente")
        ClientProfile.objects.create(user=self.customer, first_name="Ana", last_name="Perez")
        self.staff = User.objects.create_user(email="staff@example.com", password="Safe-Password-892!", role="ejecutivo")
        StaffProfile.objects.create(user=self.staff, full_name="Ejecutivo")
        self.client = Client()
        self.auth = {"HTTP_AUTHORIZATION": f"Bearer {create_session_token(self.admin)}"}

    def tearDown(self):
        ClientProfile.objects.all().delete()
        StaffProfile.objects.all().delete()
        User.objects.update(created_by_admin=None)
        User.objects.all().delete()
        super().tearDown()

    def post(self, data, **auth):
        return self.client.post("/api/accounts", data, content_type="application/json", **auth)

    def patch_account(self, user, data, **auth):
        return self.client.patch(f"/api/accounts/{user.pk}", data, content_type="application/json", **auth)

    def test_only_admin_can_manage_accounts(self):
        self.assertEqual(self.client.get("/api/accounts").status_code, 401)
        for user in (self.customer, self.staff):
            auth = {"HTTP_AUTHORIZATION": f"Bearer {create_session_token(user)}"}
            self.assertEqual(self.client.get("/api/accounts", **auth).status_code, 403)
            self.assertEqual(self.post({}, **auth).status_code, 403)
            self.assertEqual(self.patch_account(self.customer, {"email": "new@example.com"}, **auth).status_code, 403)
            self.assertEqual(self.client.delete(f"/api/accounts/{self.customer.pk}", **auth).status_code, 403)
        self.admin.is_active = False
        self.admin.save()
        self.assertEqual(self.client.get("/api/accounts", **self.auth).status_code, 401)

    def test_create_personnel_and_list_without_passwords(self):
        for role in ("admin", "ejecutivo", "soporte"):
            response = self.post({"email": f"new-{role}@example.com", "role": role, "password": "Safe-Password-893!", "full_name": "Nueva Persona"}, **self.auth)
            self.assertEqual(response.status_code, 201, response.content)
            user = User.objects.get(email=f"new-{role}@example.com")
            self.assertEqual(user.role, role)
            self.assertEqual(user.created_by_admin, self.admin)
            self.assertTrue(user.check_password("Safe-Password-893!"))
            self.assertEqual(user.staff_profile.full_name, "Nueva Persona")
        listing = self.client.get("/api/accounts", **self.auth)
        self.assertEqual(listing.status_code, 200)
        self.assertEqual(len(listing.json()["accounts"]), 6)
        self.assertNotIn("password", str(listing.json()))
        self.assertEqual(self.post({"email": "new@example.com", "role": "cliente", "password": "Safe-Password-893!", "full_name": "Cliente"}, **self.auth).status_code, 400)
        self.assertEqual(self.post({"email": "ADMIN@example.com", "role": "admin", "password": "Safe-Password-893!", "full_name": "Admin"}, **self.auth).status_code, 400)

    def test_edit_client_and_staff_without_changing_role(self):
        result = self.patch_account(self.customer, {"first_name": "Beatriz", "last_name": "Lopez", "phone": "123", "email": "beatriz@example.com"}, **self.auth)
        self.assertEqual(result.status_code, 200, result.content)
        self.customer.refresh_from_db()
        self.assertEqual(self.customer.client_profile.first_name, "Beatriz")
        self.assertEqual(self.customer.role, "cliente")
        result = self.patch_account(self.staff, {"full_name": "Nombre nuevo", "employee_code": "ABC", "password": "New-Password-895!"}, **self.auth)
        self.assertEqual(result.status_code, 200, result.content)
        self.staff.refresh_from_db()
        self.assertTrue(self.staff.check_password("New-Password-895!"))
        self.assertEqual(self.staff.staff_profile.employee_code, "ABC")
        self.assertEqual(self.patch_account(self.customer, {"role": "admin"}, **self.auth).status_code, 400)
        self.assertEqual(self.patch_account(self.staff, {"first_name": "Invalid"}, **self.auth).status_code, 400)
        self.assertEqual(self.patch_account(self.staff, {"password": "123"}, **self.auth).status_code, 400)
        self.assertEqual(self.patch_account(self.staff, {"password": "          "}, **self.auth).status_code, 400)

    def test_duplicate_employee_code_rolls_back_user_creation(self):
        self.staff.staff_profile.employee_code = "CODE-1"
        self.staff.staff_profile.save()
        response = self.post({
            "email": "duplicate@example.com", "role": "soporte",
            "password": "Safe-Password-893!", "full_name": "Nuevo",
            "employee_code": "CODE-1",
        }, **self.auth)
        self.assertEqual(response.status_code, 409)
        self.assertFalse(User.objects.filter(email="duplicate@example.com").exists())

    def test_deactivation_preserves_profiles_and_can_be_reversed(self):
        self.assertEqual(self.client.delete(f"/api/accounts/{self.admin.pk}", **self.auth).status_code, 400)
        self.assertEqual(self.patch_account(self.admin, {"active": False}, **self.auth).status_code, 400)
        self.assertEqual(self.client.delete(f"/api/accounts/{self.customer.pk}", **self.auth).status_code, 200)
        self.customer.refresh_from_db()
        self.assertFalse(self.customer.is_active)
        self.assertTrue(ClientProfile.objects.filter(user=self.customer).exists())
        token = {"HTTP_AUTHORIZATION": f"Bearer {create_session_token(self.customer)}"}
        self.assertEqual(self.client.get("/api/changes", **token).status_code, 401)
        self.assertEqual(self.patch_account(self.customer, {"active": True}, **self.auth).status_code, 200)
        self.customer.refresh_from_db()
        self.assertTrue(self.customer.is_active)
