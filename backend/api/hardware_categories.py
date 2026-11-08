import logging

from django.db import DatabaseError, IntegrityError, transaction
from django.db.models.deletion import ProtectedError, RestrictedError
from rest_framework import serializers
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .contracts import validation_response
from .models import HardwareCategory, ServiceType
from .views import IsAccountAdministrator

logger = logging.getLogger(__name__)


class HardwareCategorySerializer(serializers.ModelSerializer):
    service_type_id = serializers.PrimaryKeyRelatedField(
        source="service_type", queryset=ServiceType.objects.all(), required=False, allow_null=True,
    )
    service_type_name = serializers.CharField(source="service_type.name", read_only=True, default=None)

    class Meta:
        model = HardwareCategory
        fields = ("id", "name", "description", "service_type_id", "service_type_name", "active")
        read_only_fields = ("id", "service_type_name")

    def validate(self, attrs):
        if set(self.initial_data) - {"name", "description", "service_type_id", "active"}:
            raise serializers.ValidationError("Hay campos no permitidos.")
        return attrs


@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated, IsAccountAdministrator])
def hardware_categories(request):
    try:
        if request.method == "GET":
            records = HardwareCategory.objects.select_related("service_type").order_by("id")
            return Response({"ok": True, "categories": HardwareCategorySerializer(records, many=True).data})
        serializer = HardwareCategorySerializer(data=request.data)
        if not serializer.is_valid():
            return validation_response(serializer)
        with transaction.atomic():
            category = serializer.save()
        return Response({"ok": True, "category": HardwareCategorySerializer(category).data}, status=201)
    except IntegrityError:
        logger.exception("No se pudo registrar la categoría por una restricción.")
        return Response({"ok": False, "message": "No se pudo registrar la categoría. Revisa el nombre y el tipo de servicio."}, status=409)
    except DatabaseError:
        logger.exception("No fue posible consultar o registrar categorías de equipos.")
        return Response({"ok": False, "message": "No fue posible acceder a las categorías de equipos en PostgreSQL."}, status=503)


@api_view(["PATCH", "DELETE"])
@permission_classes([IsAuthenticated, IsAccountAdministrator])
def hardware_category_detail(request, category_id):
    try:
        with transaction.atomic():
            category = HardwareCategory.objects.select_for_update().filter(pk=category_id).first()
            if category is None:
                return Response({"ok": False, "message": "La categoría no existe."}, status=404)
            if request.method == "DELETE":
                category.delete()
                return Response({"ok": True, "message": "Categoría eliminada."})
            serializer = HardwareCategorySerializer(category, data=request.data, partial=True)
            if not serializer.is_valid():
                return validation_response(serializer)
            category = serializer.save()
            return Response({"ok": True, "category": HardwareCategorySerializer(category).data})
    except (IntegrityError, ProtectedError, RestrictedError):
        logger.exception("No se pudo modificar o eliminar la categoría por una restricción.")
        return Response({"ok": False, "message": "No se pudo modificar o eliminar la categoría: revisa el nombre y los datos vinculados."}, status=409)
    except DatabaseError:
        logger.exception("No fue posible modificar la categoría.")
        return Response({"ok": False, "message": "No fue posible acceder a las categorías de equipos en PostgreSQL."}, status=503)
