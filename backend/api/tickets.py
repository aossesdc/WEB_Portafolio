import logging
import uuid

from django.db import DatabaseError, IntegrityError, transaction
from django.db.models.functions import Lower, Trim
from rest_framework import serializers
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .contracts import validation_response
from .models import HardwareCategory, SupportPersonnel, Ticket, User, normalize_role
from .ticket_notifications import notify_ticket

logger = logging.getLogger(__name__)


class TicketCreateSerializer(serializers.Serializer):
    title = serializers.CharField(max_length=200)
    description = serializers.CharField()
    category_id = serializers.PrimaryKeyRelatedField(source="category", queryset=HardwareCategory.objects.filter(active=True))

    def validate(self, attrs):
        if set(self.initial_data) - {"title", "description", "category_id"}:
            raise serializers.ValidationError("Hay campos no permitidos.")
        return attrs


def active_clients():
    return User.objects.filter(is_active=True).annotate(
        normalized_client_role=Lower(Trim("role")),
    ).filter(normalized_client_role__in=("client", "cliente"))


class ExecutiveTicketCreateSerializer(serializers.Serializer):
    title = serializers.CharField(max_length=200)
    description = serializers.CharField()
    client_id = serializers.PrimaryKeyRelatedField(source="client", queryset=active_clients())
    category_id = serializers.PrimaryKeyRelatedField(
        source="category", queryset=HardwareCategory.objects.filter(active=True), allow_null=True, required=False,
    )
    status = serializers.ChoiceField(choices=("Abierto", "Cerrado"), allow_null=True, required=False)
    priority = serializers.ChoiceField(choices=("Baja", "Media", "Alta", "Crítica"), allow_null=True, required=False)
    risk = serializers.ChoiceField(choices=("Bajo", "Medio", "Alto"), allow_null=True, required=False)
    support_person_id = serializers.PrimaryKeyRelatedField(
        source="support_person", queryset=SupportPersonnel.objects.filter(active=True), allow_null=True, required=False,
    )

    def validate(self, attrs):
        allowed = {"title", "description", "client_id", "category_id", "status", "priority", "risk", "support_person_id"}
        if set(self.initial_data) - allowed:
            raise serializers.ValidationError("Hay campos no permitidos.")
        return attrs


class TicketUpdateSerializer(serializers.Serializer):
    status = serializers.ChoiceField(choices=("Abierto", "Cerrado"), required=False)
    priority = serializers.ChoiceField(choices=("Baja", "Media", "Alta", "Crítica"), required=False)
    risk = serializers.ChoiceField(choices=("Bajo", "Medio", "Alto"), required=False)
    support_person_id = serializers.PrimaryKeyRelatedField(
        source="support_person", queryset=SupportPersonnel.objects.all(), required=False, allow_null=True,
    )

    def validate_support_person_id(self, person):
        if person is not None and not person.active and (not self.instance or self.instance.support_person_id != person.pk):
            raise serializers.ValidationError("El personal seleccionado está inactivo.")
        return person

    def validate(self, attrs):
        if not attrs or set(self.initial_data) - {"status", "priority", "risk", "support_person_id"}:
            raise serializers.ValidationError("Selecciona campos válidos para actualizar.")
        return attrs


class SupportTicketUpdateSerializer(serializers.Serializer):
    status = serializers.ChoiceField(choices=("Abierto", "Cerrado"), required=False)
    resolution = serializers.CharField(max_length=1000, required=False, allow_blank=True, allow_null=True)

    def validate(self, attrs):
        if not attrs or set(self.initial_data) - {"status", "resolution"}:
            raise serializers.ValidationError("Solo puedes actualizar el estado y la descripción de la solución.")
        status = attrs.get("status", self.instance.status)
        resolution = attrs.get("resolution", self.instance.resolution)
        if status == "Cerrado" and not (resolution or "").strip():
            raise serializers.ValidationError("Para cerrar el ticket, describe la solución.")
        return attrs


def ticket_data(ticket, client_view=False):
    result = {
        "id": ticket.pk, "code": ticket.code, "title": ticket.title, "description": ticket.description,
        "category_id": ticket.category_id, "category_name": ticket.category.name if ticket.category_id else None,
        "status": ticket.status, "resolution": ticket.resolution,
    }
    if not client_view:
        result.update({
            "client_name": ticket.client.name, "client_email": ticket.client.email,
            "priority": ticket.priority, "risk": ticket.risk, "support_person_id": ticket.support_person_id,
            "support_person_name": ticket.support_person.user.name if ticket.support_person_id else None,
        })
    return result


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def ticket_options(request):
    role = normalize_role(request.user.role)
    if role not in ("client", "executive"):
        return Response({"ok": False, "message": "No tienes permiso para consultar estas opciones."}, status=403)
    try:
        categories = HardwareCategory.objects.filter(active=True).order_by("name", "id").values("id", "name")
        if role == "client":
            return Response({"ok": True, "categories": list(categories)})
        people = SupportPersonnel.objects.filter(active=True).select_related(
            "user", "user__staff_profile", "branch",
        ).order_by("id")
        clients = list(active_clients().select_related("client_profile").order_by("email", "id"))
        email_counts = {}
        for client in clients:
            email = client.email.strip().lower()
            email_counts[email] = email_counts.get(email, 0) + 1
        duplicate_emails = any(count > 1 for count in email_counts.values())
        return Response({"ok": True, "categories": list(categories), "clients": [
            {"id": client.id, "name": client.name, "email": client.email}
            for client in clients if email_counts[client.email.strip().lower()] == 1
        ], "duplicate_client_emails": duplicate_emails, "personnel": [
            {"id": person.id, "name": person.user.name, "branch_name": person.branch.name,
             "user_active": person.user.is_active, "availability": person.availability}
            for person in people
        ]})
    except DatabaseError:
        logger.exception("No fue posible consultar las opciones de tickets.")
        return Response({"ok": False, "message": "No fue posible cargar las opciones de tickets."}, status=503)


@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def tickets(request):
    role = normalize_role(request.user.role)
    if role not in ("client", "executive", "soporte", "tech", "admin") or (request.method == "POST" and role not in ("client", "executive")):
        return Response({"ok": False, "message": "No tienes permiso para esta acción."}, status=403)
    try:
        if request.method == "GET":
            records = Ticket.objects.select_related(
                "category", "client", "client__client_profile", "support_person", "support_person__user",
                "support_person__user__staff_profile", "support_person__user__client_profile",
            ).order_by("-id")
            if role == "client":
                records = records.filter(client=request.user)
            elif role in ("soporte", "tech"):
                records = records.filter(support_person__user=request.user)
            return Response({"ok": True, "tickets": [ticket_data(ticket, role == "client") for ticket in records]})
        serializer = (TicketCreateSerializer if role == "client" else ExecutiveTicketCreateSerializer)(data=request.data)
        if not serializer.is_valid():
            return validation_response(serializer)
        with transaction.atomic():
            values = dict(serializer.validated_data)
            client = values.get("client")
            if client is not None:
                client = active_clients().select_for_update().filter(pk=client.pk).first()
                if client is None:
                    return Response({"ok": False, "message": "El cliente ya no está disponible."}, status=400)
                if active_clients().annotate(normalized_email=Lower(Trim("email"))).filter(
                    normalized_email=client.email.strip().lower(),
                ).exclude(pk=client.pk).exists():
                    return Response({"ok": False, "message": "El correo del cliente está duplicado. Corrige las cuentas antes de crear el ticket."}, status=409)
                values["client"] = client
            else:
                values["client"] = request.user
            category = values.get("category")
            if category is not None:
                category = HardwareCategory.objects.select_for_update().filter(pk=category.pk, active=True).first()
                if category is None:
                    return Response({"ok": False, "message": "La categoría ya no está disponible."}, status=400)
                values["category"] = category
            person = values.get("support_person")
            if person is not None:
                person = SupportPersonnel.objects.select_for_update().filter(pk=person.pk, active=True).first()
                if person is None:
                    return Response({"ok": False, "message": "El personal seleccionado ya no está disponible."}, status=400)
                values["support_person"] = person
            ticket = Ticket.objects.create(**values, code=f"INC-{uuid.uuid4().hex.upper()}")
            data = ticket_data(ticket, role == "client")
            events = ["created"]
            if ticket.support_person_id:
                events.append("assigned")
            if ticket.status == "Cerrado":
                events.append("closed")
    except IntegrityError:
        logger.exception("No se pudo registrar el ticket por una restricción.")
        return Response({"ok": False, "message": "No se pudo guardar el ticket por un conflicto de datos. Inténtalo nuevamente."}, status=409)
    except DatabaseError:
        logger.exception("No fue posible acceder a los tickets.")
        return Response({"ok": False, "message": "No fue posible acceder a los tickets en PostgreSQL."}, status=503)
    warning = notify_ticket(ticket, events)
    return Response({"ok": True, "ticket": data, "notification_warning": warning}, status=201)


@api_view(["PATCH"])
@permission_classes([IsAuthenticated])
def ticket_detail(request, ticket_id):
    role = normalize_role(request.user.role)
    if role not in ("executive", "soporte", "tech"):
        return Response({"ok": False, "message": "No tienes permiso para actualizar tickets."}, status=403)
    try:
        with transaction.atomic():
            records = Ticket.objects.select_for_update().filter(pk=ticket_id)
            if role in ("soporte", "tech"):
                records = records.filter(support_person_id__in=SupportPersonnel.objects.filter(user=request.user).values("pk"))
            ticket = records.first()
            if ticket is None:
                return Response({"ok": False, "message": "El ticket no existe."}, status=404)
            previous_status = ticket.status
            previous_person_id = ticket.support_person_id
            if role in ("soporte", "tech") and ticket.status == "Cerrado" and request.data.get("status") == "Abierto":
                return Response({"ok": False, "message": "Soporte no puede reabrir un ticket cerrado; contacta al ejecutivo."}, status=409)
            if role in ("soporte", "tech") and ticket.status == "Cerrado" and "resolution" in request.data:
                return Response({"ok": False, "message": "Soporte no puede modificar la solución de un ticket cerrado; contacta al ejecutivo."}, status=409)
            serializer_class = TicketUpdateSerializer if role == "executive" else SupportTicketUpdateSerializer
            serializer = serializer_class(ticket, data=request.data, partial=True)
            if not serializer.is_valid():
                return validation_response(serializer)
            if "risk" in serializer.validated_data and ticket.risk is not None:
                return Response({"ok": False, "message": "El riesgo ya fue asignado y no se puede modificar."}, status=409)
            person = serializer.validated_data.get("support_person")
            if person is not None and person.pk != ticket.support_person_id:
                person = SupportPersonnel.objects.select_for_update().filter(pk=person.pk, active=True).first()
                if person is None:
                    return Response({"ok": False, "message": "El personal seleccionado ya no está disponible."}, status=400)
                serializer.validated_data["support_person"] = person
            for field, value in serializer.validated_data.items():
                setattr(ticket, field, value)
            ticket.save()
            data = ticket_data(ticket)
            events = []
            if ticket.support_person_id and ticket.support_person_id != previous_person_id:
                events.append("assigned")
            if ticket.status == "Cerrado" and previous_status != "Cerrado":
                events.append("closed")
    except IntegrityError:
        logger.exception("No se pudo actualizar el ticket por una restricción.")
        return Response({"ok": False, "message": "No se pudo actualizar el ticket por una restricción de datos."}, status=409)
    except DatabaseError:
        logger.exception("No fue posible actualizar el ticket.")
        return Response({"ok": False, "message": "No fue posible actualizar el ticket en PostgreSQL."}, status=503)
    warning = notify_ticket(ticket, events)
    return Response({"ok": True, "ticket": data, "notification_warning": warning})
