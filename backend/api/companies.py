import logging

from django.db import DatabaseError, IntegrityError, transaction
from django.db.models.deletion import ProtectedError, RestrictedError
from rest_framework import serializers
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .models import Company, User, normalize_role
from .views import IsAccountAdministrator

logger = logging.getLogger(__name__)


class CompanySerializer(serializers.ModelSerializer):
    user_id = serializers.PrimaryKeyRelatedField(
        source="user", queryset=User.objects.all(), required=False, allow_null=True,
    )

    class Meta:
        model = Company
        fields = ("id", "rut", "name", "business", "address", "email", "phone", "active", "user_id")
        read_only_fields = ("id",)
        extra_kwargs = {
            "active": {"allow_null": False, "required": False},
            "email": {"max_length": 255},
        }

    def validate_user_id(self, user):
        if user is not None and normalize_role(user.role) != "client":
            raise serializers.ValidationError("El usuario asociado debe tener rol de cliente.")
        return user

    def validate(self, attrs):
        if set(self.initial_data) - {"rut", "name", "business", "address", "email", "phone", "active", "user_id"}:
            raise serializers.ValidationError("Hay campos no permitidos.")
        return attrs


@api_view(["GET"])
@permission_classes([IsAuthenticated, IsAccountAdministrator])
def company_clients(request):
    users = User.objects.select_related("client_profile").order_by("email")
    return Response({"ok": True, "clients": [
        {"id": user.pk, "name": user.name, "email": user.email, "active": bool(user.is_active)}
        for user in users if normalize_role(user.role) == "client"
    ]})


@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated, IsAccountAdministrator])
def companies(request):
    try:
        if request.method == "GET":
            return Response({"ok": True, "companies": CompanySerializer(Company.objects.order_by("id"), many=True).data})
        serializer = CompanySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        with transaction.atomic():
            company = serializer.save()
        return Response({"ok": True, "company": CompanySerializer(company).data}, status=201)
    except IntegrityError:
        logger.exception("No se pudo registrar la empresa por una restricción.")
        return Response({"ok": False, "message": "No se pudo registrar la empresa; revisa si el RUT ya existe o el usuario asociado cambió."}, status=409)
    except DatabaseError:
        logger.exception("No fue posible consultar o registrar empresas.")
        return Response({"ok": False, "message": "No fue posible acceder a las empresas en PostgreSQL."}, status=503)


@api_view(["PATCH", "DELETE"])
@permission_classes([IsAuthenticated, IsAccountAdministrator])
def company_detail(request, company_id):
    try:
        with transaction.atomic():
            company = Company.objects.select_for_update().filter(pk=company_id).first()
            if company is None:
                return Response({"ok": False, "message": "La empresa no existe."}, status=404)
            if request.method == "DELETE":
                company.delete()
                return Response({"ok": True, "message": "Empresa eliminada."})
            serializer = CompanySerializer(company, data=request.data, partial=True)
            serializer.is_valid(raise_exception=True)
            company = serializer.save()
            return Response({"ok": True, "company": CompanySerializer(company).data})
    except (IntegrityError, ProtectedError, RestrictedError):
        logger.exception("No se pudo modificar o eliminar la empresa por una restricción.")
        return Response({"ok": False, "message": "No se pudo modificar o eliminar la empresa: revisa el RUT y los datos vinculados."}, status=409)
    except DatabaseError:
        logger.exception("No fue posible modificar la empresa.")
        return Response({"ok": False, "message": "No fue posible acceder a las empresas en PostgreSQL."}, status=503)
