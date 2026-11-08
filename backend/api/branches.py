import logging

from django.db import DatabaseError, IntegrityError, transaction
from django.db.models.deletion import ProtectedError, RestrictedError
from rest_framework import serializers
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .models import Branch
from .views import IsAccountAdministrator

logger = logging.getLogger(__name__)


class BranchSerializer(serializers.ModelSerializer):
    class Meta:
        model = Branch
        fields = ("id", "name", "address", "commune", "region", "active")
        read_only_fields = ("id",)
        extra_kwargs = {"active": {"allow_null": False, "required": False}}

    def validate(self, attrs):
        unknown = set(self.initial_data) - {"name", "address", "commune", "region", "active"}
        if unknown:
            raise serializers.ValidationError("Hay campos no permitidos.")
        return attrs


@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated, IsAccountAdministrator])
def branches(request):
    try:
        if request.method == "GET":
            return Response({"ok": True, "branches": BranchSerializer(Branch.objects.order_by("id"), many=True).data})
        serializer = BranchSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        with transaction.atomic():
            branch = serializer.save()
        return Response({"ok": True, "branch": BranchSerializer(branch).data}, status=201)
    except DatabaseError:
        logger.exception("No fue posible consultar o guardar las sucursales.")
        return Response({"ok": False, "message": "No fue posible acceder a las sucursales en PostgreSQL."}, status=503)


@api_view(["PATCH", "DELETE"])
@permission_classes([IsAuthenticated, IsAccountAdministrator])
def branch_detail(request, branch_id):
    try:
        with transaction.atomic():
            branch = Branch.objects.select_for_update().filter(pk=branch_id).first()
            if branch is None:
                return Response({"ok": False, "message": "La sucursal no existe."}, status=404)
            if request.method == "DELETE":
                branch.delete()
                return Response({"ok": True, "message": "Sucursal eliminada."})
            serializer = BranchSerializer(branch, data=request.data, partial=True)
            serializer.is_valid(raise_exception=True)
            branch = serializer.save()
            return Response({"ok": True, "branch": BranchSerializer(branch).data})
    except (IntegrityError, ProtectedError, RestrictedError):
        logger.exception("No se pudo modificar o eliminar la sucursal por una restricción.")
        return Response({"ok": False, "message": "No se puede modificar o eliminar la sucursal porque está vinculada a otros datos o viola una restricción."}, status=409)
    except DatabaseError:
        logger.exception("No fue posible modificar la sucursal.")
        return Response({"ok": False, "message": "No fue posible acceder a las sucursales en PostgreSQL."}, status=503)
