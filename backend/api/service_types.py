import logging

from django.db import DatabaseError, IntegrityError, transaction
from django.db.models.deletion import ProtectedError, RestrictedError
from rest_framework import serializers
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .contracts import validation_response
from .models import ServiceType
from .views import IsAccountAdministrator

logger = logging.getLogger(__name__)


class ServiceTypeSerializer(serializers.ModelSerializer):
    priority = serializers.ChoiceField(choices=("Baja", "Media", "Alta", "Crítica"), required=False)

    class Meta:
        model = ServiceType
        fields = ("id", "name", "description", "priority", "active")
        read_only_fields = ("id",)
        extra_kwargs = {"active": {"required": False}}

    def validate(self, attrs):
        if set(self.initial_data) - {"name", "description", "priority", "active"}:
            raise serializers.ValidationError("Hay campos no permitidos.")
        return attrs


@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated, IsAccountAdministrator])
def service_types(request):
    try:
        if request.method == "GET":
            records = ServiceType.objects.order_by("id")
            return Response({"ok": True, "service_types": ServiceTypeSerializer(records, many=True).data})
        serializer = ServiceTypeSerializer(data=request.data)
        if not serializer.is_valid():
            return validation_response(serializer)
        with transaction.atomic():
            service_type = serializer.save()
        return Response({"ok": True, "service_type": ServiceTypeSerializer(service_type).data}, status=201)
    except IntegrityError:
        logger.exception("No se pudo registrar el tipo de servicio por una restricción.")
        return Response({"ok": False, "message": "No se pudo registrar el tipo de servicio. Revisa si el nombre ya existe."}, status=409)
    except DatabaseError:
        logger.exception("No fue posible consultar o registrar tipos de servicio.")
        return Response({"ok": False, "message": "No fue posible acceder a los tipos de servicio en PostgreSQL."}, status=503)


@api_view(["PATCH", "DELETE"])
@permission_classes([IsAuthenticated, IsAccountAdministrator])
def service_type_detail(request, service_type_id):
    try:
        with transaction.atomic():
            service_type = ServiceType.objects.select_for_update().filter(pk=service_type_id).first()
            if service_type is None:
                return Response({"ok": False, "message": "El tipo de servicio no existe."}, status=404)
            if request.method == "DELETE":
                service_type.delete()
                return Response({"ok": True, "message": "Tipo de servicio eliminado."})
            serializer = ServiceTypeSerializer(service_type, data=request.data, partial=True)
            if not serializer.is_valid():
                return validation_response(serializer)
            service_type = serializer.save()
            return Response({"ok": True, "service_type": ServiceTypeSerializer(service_type).data})
    except (IntegrityError, ProtectedError, RestrictedError):
        logger.exception("No se pudo modificar o eliminar el tipo de servicio por una restricción.")
        return Response({"ok": False, "message": "No se pudo modificar o eliminar el tipo de servicio: revisa el nombre y los datos vinculados."}, status=409)
    except DatabaseError:
        logger.exception("No fue posible modificar el tipo de servicio.")
        return Response({"ok": False, "message": "No fue posible acceder a los tipos de servicio en PostgreSQL."}, status=503)
