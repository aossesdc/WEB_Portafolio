import logging
import unicodedata

from django.db import DatabaseError, IntegrityError, transaction
from django.db.models.deletion import ProtectedError, RestrictedError
from rest_framework import serializers
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .models import Company, Contract, ServiceType
from .views import IsAccountAdministrator

logger = logging.getLogger(__name__)


def has_valid_description(value):
    return isinstance(value, str) and sum(
        char.isalpha() for char in unicodedata.normalize("NFC", value)
    ) >= 15


class ContractSerializer(serializers.ModelSerializer):
    company_id = serializers.PrimaryKeyRelatedField(source="company", queryset=Company.objects.all())
    company_name = serializers.CharField(source="company.name", read_only=True)
    service_type_id = serializers.PrimaryKeyRelatedField(
        source="service_type", queryset=ServiceType.objects.all(), required=False, allow_null=True,
    )
    service_type_name = serializers.CharField(source="service_type.name", read_only=True, default=None)
    description = serializers.CharField(required=True, allow_null=True, allow_blank=True, trim_whitespace=False)
    coverage = serializers.ChoiceField(choices=("8x5", "24x7"))
    status = serializers.ChoiceField(choices=("Activo", "Vencido", "Suspendido"), required=False)

    class Meta:
        model = Contract
        fields = ("id", "code", "company_id", "company_name", "service_type_id", "service_type_name",
                  "description", "start_date", "end_date", "coverage", "amount", "status")
        read_only_fields = ("id", "code", "company_name", "service_type_name")

    def validate(self, attrs):
        unknown = set(self.initial_data) - {"company_id", "service_type_id", "description", "start_date", "end_date", "coverage", "amount", "status"}
        if unknown:
            raise serializers.ValidationError("Hay campos no permitidos.")
        if self.instance and set(self.initial_data) - {"status"} and "description" not in attrs:
            if not has_valid_description(self.instance.description):
                raise serializers.ValidationError("La descripción debe contener al menos 15 letras; los espacios, números y signos no cuentan.")
        start = attrs.get("start_date", self.instance.start_date if self.instance else None)
        end = attrs.get("end_date", self.instance.end_date if self.instance else None)
        if start and end and end <= start:
            raise serializers.ValidationError("La fecha de término debe ser posterior a la fecha de inicio.")
        return attrs

    def validate_description(self, value):
        if not has_valid_description(value):
            raise serializers.ValidationError("La descripción debe contener al menos 15 letras; los espacios, números y signos no cuentan.")
        return value


def validation_response(serializer):
    errors = [str(error) for values in serializer.errors.values()
              for error in (values if isinstance(values, list) else [values])]
    return Response({"ok": False, "message": " ".join(errors)}, status=400)


@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated, IsAccountAdministrator])
def contracts(request):
    try:
        if request.method == "GET":
            records = Contract.objects.select_related("company", "service_type").order_by("id")
            return Response({"ok": True, "contracts": ContractSerializer(records, many=True).data})
        serializer = ContractSerializer(data=request.data)
        if not serializer.is_valid():
            return validation_response(serializer)
        with transaction.atomic():
            contract = serializer.save()
            contract.refresh_from_db()
            if not contract.code:
                logger.error("La base de datos no generó el código del contrato.")
                transaction.set_rollback(True)
                return Response({"ok": False, "message": "PostgreSQL no generó el código del contrato. Revisa el trigger."}, status=503)
        return Response({"ok": True, "contract": ContractSerializer(contract).data}, status=201)
    except IntegrityError:
        logger.exception("No se pudo registrar el contrato por una restricción.")
        return Response({"ok": False, "message": "No se pudo registrar el contrato por un conflicto de datos o código. Revisa la empresa y el trigger de generación de código."}, status=409)
    except DatabaseError:
        logger.exception("No fue posible consultar o registrar contratos.")
        return Response({"ok": False, "message": "No fue posible acceder a los contratos en PostgreSQL."}, status=503)


@api_view(["PATCH", "DELETE"])
@permission_classes([IsAuthenticated, IsAccountAdministrator])
def contract_detail(request, contract_id):
    try:
        with transaction.atomic():
            contract = Contract.objects.select_for_update().filter(pk=contract_id).first()
            if contract is None:
                return Response({"ok": False, "message": "El contrato no existe."}, status=404)
            if request.method == "DELETE":
                contract.delete()
                return Response({"ok": True, "message": "Contrato eliminado."})
            serializer = ContractSerializer(contract, data=request.data, partial=True)
            if not serializer.is_valid():
                return validation_response(serializer)
            contract = serializer.save()
            return Response({"ok": True, "contract": ContractSerializer(contract).data})
    except (IntegrityError, ProtectedError, RestrictedError):
        logger.exception("No se pudo modificar o eliminar el contrato por una restricción.")
        return Response({"ok": False, "message": "No se pudo modificar o eliminar el contrato debido a una restricción de la base."}, status=409)
    except DatabaseError:
        logger.exception("No fue posible modificar el contrato.")
        return Response({"ok": False, "message": "No fue posible acceder a los contratos en PostgreSQL."}, status=503)
