from unittest.mock import patch

from django.core import mail
from django.db import DatabaseError, IntegrityError, connection
from django.test import Client, TransactionTestCase, override_settings

from .authentication import create_session_token
from .models import Branch, ClientProfile, Company, HardwareCategory, ServiceType, StaffProfile, SupportPersonnel, Ticket, User


@override_settings(ALLOWED_HOSTS=["testserver"], EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend",
                   EMAIL_HOST="smtp.test", EMAIL_HOST_USER="test", EMAIL_HOST_PASSWORD="test",
                   DEFAULT_FROM_EMAIL="tickets@example.com")
class TicketIntegrationTests(TransactionTestCase):
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
        self.customer = User.objects.create_user(email="client@example.com", password="password", role="cliente")
        self.other = User.objects.create_user(email="other@example.com", password="password", role="cliente")
        self.executive = User.objects.create_user(email="exec@example.com", password="password", role="ejecutivo")
        self.staff = User.objects.create_user(email="staff@example.com", password="password", role="soporte")
        self.admin = User.objects.create_user(email="admin@example.com", password="password", role="admin")
        ClientProfile.objects.create(user=self.customer, first_name="Ana", last_name="Pérez")
        StaffProfile.objects.create(user=self.staff, full_name="Soporte")
        self.category = HardwareCategory.objects.create(name="Equipos", description="Activos")
        self.inactive_category = HardwareCategory.objects.create(name="Inactiva", description="Antigua", active=False)
        branch = Branch.objects.create(name="Centro", address="Calle", commune="Santiago", region="Metropolitana")
        self.person = SupportPersonnel.objects.create(user=self.staff, branch=branch)
        self.client = Client()
        self.customer_auth = {"HTTP_AUTHORIZATION": f"Bearer {create_session_token(self.customer)}"}
        self.other_auth = {"HTTP_AUTHORIZATION": f"Bearer {create_session_token(self.other)}"}
        self.exec_auth = {"HTTP_AUTHORIZATION": f"Bearer {create_session_token(self.executive)}"}
        self.data = {"title": "Equipo sin conexión", "description": "Revisar el cable", "category_id": self.category.id}

    def tearDown(self):
        Ticket.objects.all().delete()
        SupportPersonnel.objects.all().delete()
        HardwareCategory.objects.all().delete()
        Branch.objects.all().delete()
        User.objects.all().delete()
        super().tearDown()

    def post_ticket(self, data, auth=None):
        return self.client.post("/api/tickets", data, content_type="application/json", **(auth or self.customer_auth))

    def test_client_creation_is_private_and_executive_can_edit(self):
        response = self.post_ticket(self.data)
        self.assertEqual(response.status_code, 201, response.content)
        ticket = response.json()["ticket"]
        self.assertTrue(ticket["code"].startswith("INC-"))
        self.assertEqual(ticket["status"], "Abierto")
        self.assertNotIn("priority", ticket)
        self.assertEqual(Ticket.objects.get(pk=ticket["id"]).client, self.customer)
        self.assertIsNone(Ticket.objects.get(pk=ticket["id"]).priority)
        self.assertEqual(self.client.get("/api/tickets", **self.other_auth).json()["tickets"], [])
        self.assertEqual(len(self.client.get("/api/tickets", **self.customer_auth).json()["tickets"]), 1)
        items = self.client.get("/api/tickets", **self.exec_auth).json()["tickets"]
        self.assertEqual(items[0]["client_name"], "Ana Pérez")
        self.assertEqual(items[0]["description"], self.data["description"])
        self.assertIsNone(items[0]["priority"])
        result = self.client.patch(f"/api/tickets/{ticket['id']}", {"status": "Cerrado"},
            content_type="application/json", **self.exec_auth)
        self.assertEqual(result.status_code, 200, result.content)
        self.assertIsNone(result.json()["ticket"]["priority"])
        for state in ("Cerrado", "Abierto"):
            result = self.client.patch(f"/api/tickets/{ticket['id']}",
                {"status": state, "priority": "Alta", "support_person_id": self.person.pk},
                content_type="application/json", **self.exec_auth)
            self.assertEqual(result.status_code, 200, result.content)
            self.assertEqual(result.json()["ticket"]["status"], state)
            self.assertEqual(result.json()["ticket"]["support_person_name"], "Soporte")
            self.assertEqual(Ticket.objects.get(pk=ticket["id"]).priority, "Alta")
        self.person.active = False
        self.person.save(update_fields=["active"])
        self.assertEqual(self.client.patch(f"/api/tickets/{ticket['id']}",
            {"support_person_id": self.person.pk, "status": "Cerrado"},
            content_type="application/json", **self.exec_auth).status_code, 200)
        self.assertEqual(self.client.patch(f"/api/tickets/{ticket['id']}",
            {"support_person_id": None}, content_type="application/json", **self.exec_auth).status_code, 200)
        self.assertEqual(self.client.patch(f"/api/tickets/{ticket['id']}",
            {"support_person_id": self.person.pk}, content_type="application/json", **self.exec_auth).status_code, 400)

    def test_permissions_and_validation(self):
        self.assertEqual(self.client.get("/api/tickets").status_code, 401)
        admin_auth = {"HTTP_AUTHORIZATION": f"Bearer {create_session_token(self.admin)}"}
        self.assertEqual(self.client.get("/api/tickets", **admin_auth).status_code, 200)
        self.assertEqual(self.post_ticket(self.data, admin_auth).status_code, 403)
        self.assertEqual(self.post_ticket(self.data, self.exec_auth).status_code, 400)
        for data in ({}, {**self.data, "title": "  "}, {**self.data, "description": " "},
                     {**self.data, "category_id": self.inactive_category.pk}, {**self.data, "category_id": 9999},
                     {**self.data, "cliente_usuario_id": self.other.pk}, {**self.data, "priority": "Alta"}):
            self.assertEqual(self.post_ticket(data).status_code, 400)
        pk = self.post_ticket(self.data).json()["ticket"]["id"]
        self.assertEqual(self.client.patch(f"/api/tickets/{pk}", {"status": "Cerrado"},
            content_type="application/json", **admin_auth).status_code, 403)
        self.assertEqual(self.client.patch(f"/api/tickets/{pk}", {"status": "Cerrado"},
            content_type="application/json", **self.customer_auth).status_code, 403)
        for data in ({"status": "En progreso"}, {"priority": "Bajo"}, {"support_person_id": 9999}, {"client_id": self.other.pk}, {}):
            self.assertEqual(self.client.patch(f"/api/tickets/{pk}", data, content_type="application/json", **self.exec_auth).status_code, 400)
        self.assertEqual(self.client.patch("/api/tickets/9999", {"status": "Cerrado"},
            content_type="application/json", **self.exec_auth).status_code, 404)

    def test_admin_can_read_all_real_tickets_including_unassigned(self):
        first = Ticket.objects.create(code="INC-ADMIN-1", title="Pendiente", description="Detalle",
            client=self.customer, status=None, risk=None)
        second = Ticket.objects.create(code="INC-ADMIN-2", title="Cerrado", description="Resuelto",
            client=self.other, status="Cerrado", risk="Alto", support_person=self.person)
        auth = {"HTTP_AUTHORIZATION": "Bearer " + create_session_token(self.admin)}
        response = self.client.get("/api/tickets", **auth)
        self.assertEqual(response.status_code, 200)
        tickets = {item["id"]: item for item in response.json()["tickets"]}
        self.assertEqual(set(tickets), {first.id, second.id})
        self.assertIsNone(tickets[first.id]["status"])
        self.assertIsNone(tickets[first.id]["risk"])
        self.assertEqual(tickets[second.id]["support_person_name"], "Soporte")
        self.assertEqual(tickets[second.id]["client_email"], self.other.email)
        self.assertEqual(len(self.client.get("/api/tickets", **self.customer_auth).json()["tickets"]), 1)

    def test_risk_assignment_is_private_and_immutable(self):
        for risk in ("Bajo", "Medio", "Alto"):
            created = self.post_ticket(self.data).json()["ticket"]
            pk = created["id"]
            self.assertNotIn("risk", created)
            self.assertIsNone(Ticket.objects.get(pk=pk).risk)
            staff_auth = {"HTTP_AUTHORIZATION": "Bearer " + create_session_token(self.staff)}
            admin_auth = {"HTTP_AUTHORIZATION": "Bearer " + create_session_token(self.admin)}
            for auth in (self.customer_auth, self.other_auth, admin_auth):
                self.assertEqual(self.client.patch(f"/api/tickets/{pk}", {"risk": risk},
                    content_type="application/json", **auth).status_code, 403)
            self.assertEqual(self.client.patch(f"/api/tickets/{pk}", {"risk": risk},
                content_type="application/json", **staff_auth).status_code, 404)
            for invalid in ("Crítico", "", None):
                self.assertEqual(self.client.patch(f"/api/tickets/{pk}", {"risk": invalid},
                    content_type="application/json", **self.exec_auth).status_code, 400)
            result = self.client.patch(f"/api/tickets/{pk}", {"risk": risk, "status": "Cerrado"},
                content_type="application/json", **self.exec_auth)
            self.assertEqual(result.status_code, 200, result.content)
            self.assertEqual(result.json()["ticket"]["risk"], risk)
            self.assertNotIn("risk", self.client.get("/api/tickets", **self.customer_auth).json()["tickets"][0])
            result = self.client.patch(f"/api/tickets/{pk}", {"risk": "Alto", "status": "Abierto"},
                content_type="application/json", **self.exec_auth)
            self.assertEqual(result.status_code, 409)
            ticket = Ticket.objects.get(pk=pk)
            self.assertEqual((ticket.risk, ticket.status), (risk, "Cerrado"))
            self.assertEqual(self.client.patch(f"/api/tickets/{pk}", {"status": "Abierto"},
                content_type="application/json", **self.exec_auth).status_code, 200)

    def test_nullable_category_and_status_are_returned_without_losing_ticket(self):
        ticket = Ticket.objects.create(title="Antiguo", description="Sin categoría", category=None,
                                       client=self.customer, status=None)
        for auth in (self.customer_auth, self.exec_auth):
            result = self.client.get("/api/tickets", **auth)
            self.assertEqual(result.status_code, 200, result.content)
            item = result.json()["tickets"][0]
            self.assertEqual(item["id"], ticket.pk)
            self.assertIsNone(item["category_name"])
            self.assertIsNone(item["status"])
        result = self.client.patch(f"/api/tickets/{ticket.pk}", {"risk": "Bajo"},
            content_type="application/json", **self.exec_auth)
        self.assertEqual(result.status_code, 200, result.content)
        self.assertIsNone(result.json()["ticket"]["status"])

    def test_options_and_restricted_category_deletion(self):
        response = self.client.get("/api/tickets/options", **self.customer_auth).json()
        self.assertEqual(response["categories"], [{"id": self.category.pk, "name": "Equipos"}])
        self.assertEqual(self.client.get("/api/tickets/options", **self.exec_auth).json()["personnel"][0]["id"], self.person.id)
        self.post_ticket(self.data)
        with self.assertLogs("api.hardware_categories", level="ERROR"):
            self.assertEqual(self.client.delete(f"/api/hardware-categories/{self.category.pk}",
                HTTP_AUTHORIZATION=f"Bearer {create_session_token(self.admin)}").status_code, 409)

    def test_executive_can_create_full_ticket_for_a_client(self):
        payload = {**self.data, "client_id": self.customer.pk, "status": "Cerrado", "priority": "Crítica",
                   "risk": "Alto", "support_person_id": self.person.pk}
        result = self.post_ticket(payload, self.exec_auth)
        self.assertEqual(result.status_code, 201, result.content)
        item = result.json()["ticket"]
        ticket = Ticket.objects.get(pk=item["id"])
        self.assertEqual((ticket.client_id, ticket.category_id, ticket.support_person_id),
                         (self.customer.pk, self.category.pk, self.person.pk))
        self.assertEqual((ticket.status, ticket.priority, ticket.risk), ("Cerrado", "Crítica", "Alto"))
        self.assertEqual(item["risk"], "Alto")
        self.assertEqual(self.client.patch(f"/api/tickets/{ticket.pk}", {"risk": "Bajo"},
            content_type="application/json", **self.exec_auth).status_code, 409)
        visible = self.client.get("/api/tickets", **self.customer_auth).json()["tickets"]
        self.assertEqual(visible[0]["id"], ticket.pk)
        self.assertNotIn("risk", visible[0])
        self.assertEqual(self.client.get("/api/tickets", **self.other_auth).json()["tickets"], [])

    def test_executive_creation_nullable_fields_options_and_permissions(self):
        options = self.client.get("/api/tickets/options", **self.exec_auth).json()
        self.assertIn({"id": self.customer.pk, "name": "Ana Pérez", "email": self.customer.email}, options["clients"])
        self.assertNotIn(self.executive.pk, [client["id"] for client in options["clients"]])
        self.assertEqual(options["categories"], [{"id": self.category.pk, "name": "Equipos"}])
        minimal = {"title": "Sin asignar", "description": "Detalle", "client_id": self.customer.pk,
                   "category_id": None, "status": None, "priority": None, "risk": None, "support_person_id": None}
        result = self.post_ticket(minimal, self.exec_auth)
        self.assertEqual(result.status_code, 201, result.content)
        ticket = Ticket.objects.get(pk=result.json()["ticket"]["id"])
        self.assertEqual((ticket.category_id, ticket.status, ticket.priority, ticket.risk, ticket.support_person_id),
                         (None, None, None, None, None))
        defaults = self.post_ticket({"title": "Prueba", "description": "Detalle", "client_id": self.customer.pk}, self.exec_auth)
        self.assertEqual(defaults.status_code, 201, defaults.content)
        self.assertEqual(defaults.json()["ticket"]["status"], "Abierto")
        for field, value in (("client_id", self.staff.pk), ("client_id", 99999),
                             ("category_id", self.inactive_category.pk), ("status", "Pendiente"),
                             ("priority", "Bajo"), ("risk", "Crítico"), ("support_person_id", 99999),
                             ("codigo_ticket", "INV-1")):
            self.assertEqual(self.post_ticket({**minimal, field: value}, self.exec_auth).status_code, 400, field)
        self.customer.is_active = False
        self.customer.save(update_fields=["is_active"])
        self.assertEqual(self.post_ticket(minimal, self.exec_auth).status_code, 400)
        self.assertNotIn(self.customer.pk, [client["id"] for client in self.client.get("/api/tickets/options", **self.exec_auth).json()["clients"]])
        staff_auth = {"HTTP_AUTHORIZATION": "Bearer " + create_session_token(self.staff)}
        self.assertEqual(self.post_ticket(minimal, staff_auth).status_code, 403)
        self.assertEqual(self.post_ticket(minimal, self.other_auth).status_code, 400)

    def test_duplicate_client_emails_are_reported_and_cannot_be_selected(self):
        User.objects.filter(pk=self.other.pk).update(email="CLIENT@example.com")
        options = self.client.get("/api/tickets/options", **self.exec_auth)
        self.assertEqual(options.status_code, 200)
        self.assertTrue(options.json()["duplicate_client_emails"])
        self.assertEqual(options.json()["clients"], [])
        for client in (self.customer, self.other):
            result = self.post_ticket({**self.data, "client_id": client.pk}, self.exec_auth)
            self.assertEqual(result.status_code, 409)
            self.assertIn("duplicado", result.json()["message"])
        self.assertEqual(Ticket.objects.count(), 0)
        self.other.is_active = False
        self.other.save(update_fields=["is_active"])
        options = self.client.get("/api/tickets/options", **self.exec_auth).json()
        self.assertFalse(options["duplicate_client_emails"])
        self.assertEqual([client["id"] for client in options["clients"]], [self.customer.pk])
        self.assertEqual(self.post_ticket({**self.data, "client_id": self.customer.pk}, self.exec_auth).status_code, 201)

    def test_support_access_is_scoped_and_closure_requires_resolution(self):
        auth = {"HTTP_AUTHORIZATION": "Bearer " + create_session_token(self.staff)}
        assigned = Ticket.objects.create(title="Asignado", description="Falla", client=self.customer,
                                         category=self.category, support_person=self.person, risk=None)
        other = Ticket.objects.create(title="No asignado", description="Falla", client=self.other,
                                      category=self.category)
        response = self.client.get("/api/tickets", **auth)
        self.assertEqual(response.status_code, 200)
        self.assertEqual([item["id"] for item in response.json()["tickets"]], [assigned.pk])
        self.assertEqual(self.client.patch(f"/api/tickets/{other.pk}", {"status": "Cerrado", "resolution": "Arreglado"},
            content_type="application/json", **auth).status_code, 404)
        for data in ({"risk": "Alto"}, {"priority": "Alta"}, {"support_person_id": None},
                     {"status": "Cerrado"}, {"status": "Cerrado", "resolution": "   "},
                     {"resolution": "x" * 1001}):
            self.assertEqual(self.client.patch(f"/api/tickets/{assigned.pk}", data,
                content_type="application/json", **auth).status_code, 400, data)
        result = self.client.patch(f"/api/tickets/{assigned.pk}", {"status": "Cerrado", "resolution": "Reparado"},
            content_type="application/json", **auth)
        self.assertEqual(result.status_code, 200, result.content)
        for user_auth in (auth, self.exec_auth, self.customer_auth):
            items = self.client.get("/api/tickets", **user_auth).json()["tickets"]
            self.assertEqual(next(item for item in items if item["id"] == assigned.pk)["resolution"], "Reparado")
        self.assertEqual(self.client.patch(f"/api/tickets/{assigned.pk}", {"resolution": ""},
            content_type="application/json", **auth).status_code, 409)
        assigned.refresh_from_db()
        self.assertEqual((assigned.status, assigned.resolution), ("Cerrado", "Reparado"))
        assigned.support_person = None
        assigned.save()
        self.assertEqual(self.client.get("/api/tickets", **auth).json()["tickets"], [])
        self.assertEqual(self.client.patch(f"/api/tickets/{assigned.pk}", {"status": "Abierto"},
            content_type="application/json", **auth).status_code, 404)
        self.assertEqual(self.post_ticket(self.data, auth).status_code, 403)

    def test_support_without_personnel_record_has_no_tickets(self):
        tech = User.objects.create_user(email="tech@example.com", password="Safe-Password-893!", role="tech")
        auth = {"HTTP_AUTHORIZATION": "Bearer " + create_session_token(tech)}
        response = self.client.get("/api/tickets", **auth)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["tickets"], [])

    def test_support_cannot_reopen_closed_ticket_but_executive_can(self):
        auth = {"HTTP_AUTHORIZATION": "Bearer " + create_session_token(self.staff)}
        ticket = Ticket.objects.create(title="Equipo", description="Falla", client=self.customer,
                                       category=self.category, support_person=self.person)
        url = f"/api/tickets/{ticket.pk}"
        result = self.client.patch(url, {"status": "Cerrado", "resolution": "Reparado"},
                                   content_type="application/json", **auth)
        self.assertEqual(result.status_code, 200, result.content)
        result = self.client.patch(url, {"status": "Abierto", "resolution": "Cambio simultáneo"},
                                   content_type="application/json", **auth)
        self.assertEqual(result.status_code, 409)
        self.assertIn("no puede reabrir", result.json()["message"])
        ticket.refresh_from_db()
        self.assertEqual((ticket.status, ticket.resolution), ("Cerrado", "Reparado"))
        result = self.client.patch(url, {"resolution": "Reparación detallada"},
                                   content_type="application/json", **auth)
        self.assertEqual(result.status_code, 409)
        ticket.refresh_from_db()
        self.assertEqual(ticket.resolution, "Reparado")
        result = self.client.patch(url, {"status": "Abierto"}, content_type="application/json", **self.exec_auth)
        self.assertEqual(result.status_code, 200, result.content)
        result = self.client.patch(url, {"resolution": "Reparación detallada"},
                                   content_type="application/json", **auth)
        self.assertEqual(result.status_code, 200, result.content)
        result = self.client.patch(url, {"status": "Cerrado", "resolution": "Reparado nuevamente"},
                                   content_type="application/json", **auth)
        self.assertEqual(result.status_code, 200, result.content)

    def test_client_notifications_follow_ticket_transitions(self):
        created = self.post_ticket(self.data)
        self.assertEqual(created.status_code, 201)
        ticket_id = created.json()["ticket"]["id"]
        self.assertEqual(len(mail.outbox), 1)
        self.assertEqual(mail.outbox[0].to, [self.customer.email])
        self.assertIn("registrado", mail.outbox[0].body)
        url = f"/api/tickets/{ticket_id}"
        result = self.client.patch(url, {"support_person_id": self.person.pk}, content_type="application/json", **self.exec_auth)
        self.assertEqual(result.status_code, 200)
        self.assertEqual(len(mail.outbox), 2)
        self.assertIn("Soporte", mail.outbox[-1].body)
        result = self.client.patch(url, {"support_person_id": self.person.pk}, content_type="application/json", **self.exec_auth)
        self.assertEqual(result.status_code, 200)
        self.assertEqual(len(mail.outbox), 2)
        auth = {"HTTP_AUTHORIZATION": "Bearer " + create_session_token(self.staff)}
        result = self.client.patch(url, {"status": "Cerrado", "resolution": "Problema resuelto"},
                                   content_type="application/json", **auth)
        self.assertEqual(result.status_code, 200)
        self.assertEqual(len(mail.outbox), 3)
        self.assertEqual(mail.outbox[-1].to, [self.customer.email])
        self.assertIn("Problema resuelto", mail.outbox[-1].body)
        self.assertIn("cerrado", mail.outbox[-1].body)
        self.client.patch(url, {"status": "Cerrado"}, content_type="application/json", **self.exec_auth)
        self.assertEqual(len(mail.outbox), 3)
        self.client.patch(url, {"status": "Abierto"}, content_type="application/json", **self.exec_auth)
        self.client.patch(url, {"status": "Cerrado"}, content_type="application/json", **self.exec_auth)
        self.assertEqual(len(mail.outbox), 4)

    def test_email_failure_keeps_committed_ticket_and_returns_warning(self):
        with patch("api.ticket_notifications.send_mail", side_effect=OSError("SMTP no disponible")):
            with self.assertLogs("api.ticket_notifications", level="ERROR"):
                result = self.post_ticket(self.data)
        self.assertEqual(result.status_code, 201)
        self.assertIn("no se pudo enviar", result.json()["notification_warning"])
        self.assertTrue(Ticket.objects.filter(pk=result.json()["ticket"]["id"]).exists())
        url = f"/api/tickets/{result.json()['ticket']['id']}"
        with patch("api.ticket_notifications.send_mail", side_effect=OSError("SMTP no disponible")):
            with self.assertLogs("api.ticket_notifications", level="ERROR"):
                result = self.client.patch(url, {"status": "Cerrado"}, content_type="application/json", **self.exec_auth)
        self.assertEqual(result.status_code, 200)
        self.assertIn("no se pudo enviar", result.json()["notification_warning"])
        self.assertEqual(Ticket.objects.get(pk=result.json()["ticket"]["id"]).status, "Cerrado")

    @override_settings(EMAIL_HOST="")
    def test_unconfigured_smtp_warns_without_undoing_creation(self):
        with self.assertLogs("api.ticket_notifications", level="ERROR"):
            result = self.post_ticket(self.data)
        self.assertEqual(result.status_code, 201)
        self.assertIn("no se pudo enviar", result.json()["notification_warning"])
        self.assertTrue(Ticket.objects.filter(pk=result.json()["ticket"]["id"]).exists())

    def test_invalid_update_and_unassignment_do_not_send_notifications(self):
        ticket = Ticket.objects.create(title="Equipo", description="Falla", client=self.customer,
                                       category=self.category, support_person=self.person)
        url = f"/api/tickets/{ticket.pk}"
        with patch("api.ticket_notifications.send_mail") as sender:
            response = self.client.patch(url, {"risk": "inválido"}, content_type="application/json", **self.exec_auth)
            self.assertEqual(response.status_code, 400)
            response = self.client.patch(url, {"support_person_id": None}, content_type="application/json", **self.exec_auth)
            self.assertEqual(response.status_code, 200)
            sender.assert_not_called()

    def test_ticket_created_closed_and_assigned_sends_one_combined_email(self):
        result = self.post_ticket({**self.data, "client_id": self.customer.pk, "status": "Cerrado",
                                   "support_person_id": self.person.pk}, self.exec_auth)
        self.assertEqual(result.status_code, 201)
        self.assertEqual(len(mail.outbox), 1)
        self.assertIn("registrado", mail.outbox[0].body)
        self.assertIn("asignado", mail.outbox[0].body)
        self.assertIn("cerrado", mail.outbox[0].body)

    def test_database_errors(self):
        with patch.object(Ticket.objects, "select_related", side_effect=DatabaseError("offline")):
            with self.assertLogs("api.tickets", level="ERROR"):
                self.assertEqual(self.client.get("/api/tickets", **self.exec_auth).status_code, 503)
        with patch.object(Ticket.objects, "create", side_effect=IntegrityError("collision")):
            with self.assertLogs("api.tickets", level="ERROR"):
                self.assertEqual(self.post_ticket(self.data).status_code, 409)
