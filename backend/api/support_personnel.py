import logging

from django.db import DatabaseError, IntegrityError, transaction
from django.db.models.deletion import ProtectedError, RestrictedError
from rest_framework import serializers
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .contracts import validation_response
from .models import Branch, HardwareCategory, SupportPersonnel, User, normalize_role
from .views import IsAccountAdministrator

logger = logging.getLogger(__name__)
AVAILABILITY = ("Disponible", "Asignado", "En Terreno", "Licencia", "No Disponible")


class SupportPersonnelSerializer(serializers.ModelSerializer):
    user_id = serializers.PrimaryKeyRelatedField(source="user", queryset=User.objects.all())
    user_name = serializers.CharField(source="user.name", read_only=True)
    user_email = serializers.EmailField(source="user.email", read_only=True)
    user_role = serializers.CharField(source="user.role", read_only=True)
    user_active = serializers.BooleanField(source="user.is_active", read_only=True, allow_null=True)
    branch_id = serializers.PrimaryKeyRelatedField(source="branch", queryset=Branch.objects.all())
    branch_name = serializers.CharField(source="branch.name", read_only=True)
    branch_active = serializers.BooleanField(source="branch.active", read_only=True, allow_null=True)
    category_id = serializers.PrimaryKeyRelatedField(
        source="category", queryset=HardwareCategory.objects.all(), required=False, allow_null=True,
    )
    category_name = serializers.CharField(source="category.name", read_only=True, default=None)
    availability = serializers.ChoiceField(choices=AVAILABILITY, required=False)

    class Meta:
        model = SupportPersonnel
        fields = ("id", "user_id", "user_name", "user_email", "user_role", "user_active",
                  "branch_id", "branch_name", "branch_active", "category_id", "category_name", "availability", "active")
        read_only_fields = ("id", "user_name", "user_email", "user_role", "user_active",
                            "branch_name", "branch_active", "category_name")

    def validate_user_id(self, user):
        if (not self.instance or self.instance.user_id != user.pk) and normalize_role(user.role) not in ("soporte", "executive"):
            raise serializers.ValidationError("La cuenta debe tener rol de soporte o ejecutivo.")
        if SupportPersonnel.objects.filter(user=user).exclude(pk=self.instance.pk if self.instance else None).exists():
            raise serializers.ValidationError("Esta cuenta ya está registrada en el catálogo.")
        return user

    def validate(self, attrs):
        if set(self.initial_data) - {"user_id", "branch_id", "category_id", "availability", "active"}:
            raise serializers.ValidationError("Hay campos no permitidos.")
        return attrs


@api_view(["GET"])
@permission_classes([IsAuthenticated, IsAccountAdministrator])
def support_personnel_users(request):
    try:
        users = User.objects.select_related("staff_profile").order_by("email")
        return Response({"ok": True, "users": [
            {"id": user.pk, "name": user.name, "email": user.email,
             "role": normalize_role(user.role), "active": user.is_active}
            for user in users if normalize_role(user.role) in ("soporte", "executive")
        ]})
    except DatabaseError:
        logger.exception("No fue posible consultar las cuentas de personal.")
        return Response({"ok": False, "message": "No fue posible consultar las cuentas de personal en PostgreSQL."}, status=503)


@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated, IsAccountAdministrator])
def support_personnel(request):
    try:
        if request.method == "GET":
            records = SupportPersonnel.objects.select_related(
                "user", "user__staff_profile", "user__client_profile", "branch", "category",
            ).order_by("id")
            return Response({"ok": True, "personnel": SupportPersonnelSerializer(records, many=True).data})
        serializer = SupportPersonnelSerializer(data=request.data)
        if not serializer.is_valid():
            return validation_response(serializer)
        with transaction.atomic():
            person = serializer.save()
        return Response({"ok": True, "person": SupportPersonnelSerializer(person).data}, status=201)
    except IntegrityError:
        logger.exception("No se pudo registrar el personal por una restricción.")
        return Response({"ok": False, "message": "No se pudo registrar el personal. Revisa si la cuenta ya está registrada o si los datos vinculados cambiaron."}, status=409)
    except DatabaseError:
        logger.exception("No fue posible consultar o registrar personal operativo.")
        return Response({"ok": False, "message": "No fue posible acceder al personal operativo en PostgreSQL."}, status=503)


@api_view(["PATCH", "DELETE"])
@permission_classes([IsAuthenticated, IsAccountAdministrator])
def support_personnel_detail(request, person_id):
    try:
        with transaction.atomic():
            person = SupportPersonnel.objects.select_for_update().filter(pk=person_id).first()
            if person is None:
                return Response({"ok": False, "message": "El registro de personal no existe."}, status=404)
            if request.method == "DELETE":
                person.delete()
                return Response({"ok": True, "message": "Registro de personal eliminado."})
            serializer = SupportPersonnelSerializer(person, data=request.data, partial=True)
            if not serializer.is_valid():
                return validation_response(serializer)
            person = serializer.save()
            return Response({"ok": True, "person": SupportPersonnelSerializer(person).data})
    except (IntegrityError, ProtectedError, RestrictedError):
        logger.exception("No se pudo modificar o eliminar el personal por una restricción.")
        return Response({"ok": False, "message": "No se pudo modificar o eliminar el registro: revisa la cuenta y los datos vinculados."}, status=409)
    except DatabaseError:
        logger.exception("No fue posible modificar el personal operativo.")
        return Response({"ok": False, "message": "No fue posible acceder al personal operativo en PostgreSQL."}, status=503)
