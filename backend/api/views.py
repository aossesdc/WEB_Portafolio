import hashlib
import hmac
import mimetypes
import re
from pathlib import Path

from django.conf import settings
from django.contrib.auth.password_validation import validate_password
from django.core import signing
from django.core.exceptions import ValidationError
from django.db import DatabaseError, IntegrityError, connection, transaction
from django.http import FileResponse, Http404, HttpResponse
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import (
    api_view,
    authentication_classes,
    permission_classes,
)
from rest_framework.permissions import AllowAny, BasePermission, IsAuthenticated
from rest_framework.response import Response

from .authentication import SESSION_MAX_AGE, create_session_token
from .accounts import AccountInput, account_data
from .models import ClientProfile, StaffProfile, User, normalize_role

def serialized_user(user):
    return {
        "id": user.pk,
        "name": user.name,
        "email": user.email,
        "profile": user.profile,
        "role": normalize_role(user.role),
    }


def valid_legacy_password(password, encoded):
    try:
        salt_hex, hash_hex = encoded.split(":", maxsplit=1)
        salt = bytes.fromhex(salt_hex)
        expected = bytes.fromhex(hash_hex)
        actual = hashlib.scrypt(
            password.encode("utf-8"),
            salt=salt,
            n=16384,
            r=8,
            p=1,
            dklen=len(expected),
            maxmem=64 * 1024 * 1024,
        )
    except (ValueError, TypeError):
        return False
    return len(expected) == len(actual) and hmac.compare_digest(expected, actual)


@api_view(["GET"])
@permission_classes([AllowAny])
def health(request):
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
    except DatabaseError:
        return Response(
            {"ok": False, "message": "No fue posible conectar con PostgreSQL."},
            status=status.HTTP_503_SERVICE_UNAVAILABLE,
        )
    return Response({"ok": True, "database": "connected"})


@api_view(["GET"])
@permission_classes([AllowAny])
def api_status(request):
    return Response({"ok": True, "mensaje": "El backend de SLA Control está en línea"})


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def changes(request):
    return Response(
        {
            "ok": True,
            "versions": {
                "users": User.objects.count(),
            },
        }
    )


@api_view(["POST"])
@authentication_classes([])
@permission_classes([AllowAny])
def register(request):
    if not isinstance(request.data, dict):
        return Response(
            {"ok": False, "message": "Revisa nombre, apellido, correo y contraseña."},
            status=status.HTTP_400_BAD_REQUEST,
        )
    name = request.data.get("name")
    surname = request.data.get("surname")
    email = request.data.get("email")
    password = request.data.get("password")
    if (
        not isinstance(name, str)
        or not name.strip()
        or len(name.strip()) > 100
        or not isinstance(surname, str)
        or not surname.strip()
        or len(surname.strip()) > 100
        or not isinstance(email, str)
        or not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", email.strip())
        or len(email.strip()) > 254
        or not isinstance(password, str)
        or len(password.strip()) < 8
        or len(password) > 128
    ):
        return Response(
            {
                "ok": False,
                "message": "Revisa nombre, apellido, correo y contraseña. La contraseña debe tener entre 8 y 128 caracteres.",
            },
            status=status.HTTP_400_BAD_REQUEST,
        )

    try:
        validate_password(password)
    except ValidationError as error:
        return Response(
            {"ok": False, "message": " ".join(error.messages)},
            status=status.HTTP_400_BAD_REQUEST,
        )

    try:
        with transaction.atomic():
            user = User.objects.create_user(
                email=email.strip().lower(),
                password=password,
                role="cliente",
            )
            ClientProfile.objects.create(
                user=user,
                first_name=name.strip(),
                last_name=surname.strip(),
            )
    except IntegrityError:
        return Response(
            {"ok": False, "message": "Ya existe una cuenta con ese correo."},
            status=status.HTTP_409_CONFLICT,
        )
    return Response(
        {
            "ok": True,
            "message": "Cuenta creada correctamente. Ya puedes iniciar sesión.",
            "user": serialized_user(user),
        },
        status=status.HTTP_201_CREATED,
    )


@api_view(["POST"])
@authentication_classes([])
@permission_classes([AllowAny])
def login(request):
    if not isinstance(request.data, dict):
        return Response(
            {"ok": False, "message": "Email y contraseña son obligatorios."},
            status=status.HTTP_400_BAD_REQUEST,
        )
    email = request.data.get("email")
    password = request.data.get("password")
    if not isinstance(email, str) or not isinstance(password, str) or not email.strip() or not password:
        return Response(
            {"ok": False, "message": "Email y contraseña son obligatorios."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    try:
        user = User.objects.get(email=email.strip().lower())
    except User.DoesNotExist:
        user = None

    authenticated = False
    if user and user.is_active:
        if ":" in user.password:
            authenticated = valid_legacy_password(password, user.password)
            if authenticated:
                user.set_password(password)
                user.save(update_fields=["password"])
        else:
            authenticated = user.check_password(password)
    if not authenticated:
        return Response(
            {"ok": False, "message": "Credenciales inválidas."},
            status=status.HTTP_401_UNAUTHORIZED,
        )

    expires_at = timezone.now() + SESSION_MAX_AGE
    return Response(
        {
            "ok": True,
            "sessionToken": create_session_token(user),
            "expiresAt": expires_at.isoformat(),
            "user": serialized_user(user),
        }
    )


class IsAccountAdministrator(BasePermission):
    def has_permission(self, request, view):
        return bool(request.user and request.user.is_active and normalize_role(request.user.role) == "admin")


@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated, IsAccountAdministrator])
def accounts(request):
    if request.method == "GET":
        users = User.objects.select_related("client_profile", "staff_profile").order_by("id")
        try:
            return Response({"ok": True, "accounts": [account_data(user) for user in users]})
        except (ClientProfile.DoesNotExist, StaffProfile.DoesNotExist):
            return Response({"ok": False, "message": "Una cuenta no tiene su perfil asociado. Revisa los datos en PostgreSQL."}, status=409)
    serializer = AccountInput(data=request.data, context={"request": request})
    serializer.is_valid(raise_exception=True)
    try:
        with transaction.atomic():
            user = serializer.save()
            return Response({"ok": True, "account": account_data(user)}, status=201)
    except IntegrityError:
        return Response({"ok": False, "message": "El correo o código de empleado ya existe."}, status=409)


@api_view(["PATCH", "DELETE"])
@permission_classes([IsAuthenticated, IsAccountAdministrator])
def account_detail(request, account_id):
    try:
        with transaction.atomic():
            if request.method == "DELETE":
                administrators = list(
                    User.objects.select_for_update()
                    .filter(is_active=True, role__in=["admin", "administrador"])
                    .order_by("pk")
                )
                if not any(admin.pk == request.user.pk for admin in administrators):
                    return Response({"ok": False, "message": "Tu cuenta ya no tiene acceso de administrador."}, status=403)
            try:
                user = User.objects.select_for_update().get(pk=account_id)
            except User.DoesNotExist:
                return Response({"ok": False, "message": "La cuenta no existe."}, status=404)
            if request.method == "DELETE":
                if user.pk == request.user.pk:
                    return Response({"ok": False, "message": "No puedes desactivar tu propia cuenta."}, status=400)
                user.is_active = False
                user.save(update_fields=["is_active"])
                return Response({"ok": True, "message": "Cuenta desactivada."})
            serializer = AccountInput(user, data=request.data, partial=True, context={"request": request})
            serializer.is_valid(raise_exception=True)
            user = serializer.save()
            return Response({"ok": True, "account": account_data(user)})
    except (ClientProfile.DoesNotExist, StaffProfile.DoesNotExist):
        return Response({"ok": False, "message": "La cuenta no tiene su perfil asociado."}, status=409)
    except IntegrityError:
        return Response({"ok": False, "message": "El correo o código de empleado ya existe."}, status=409)


@api_view(["GET", "POST", "PUT", "PATCH", "DELETE"])
@authentication_classes([])
@permission_classes([AllowAny])
def feature_unavailable(request, *args, **kwargs):
    return Response(
        {
            "ok": False,
            "message": "Tickets y mantenedores están desactivados para mantener PostgreSQL limitado a las tres tablas de autenticación.",
        },
        status=status.HTTP_410_GONE,
    )


def frontend(request, asset_path=""):
    build_dir = (settings.BASE_DIR.parent / "frontend" / "dist" / "frontend" / "browser").resolve()
    if not build_dir.is_dir():
        return HttpResponse(
            "La interfaz de Angular no está compilada. Ejecuta npm run build en frontend.",
            status=503,
            content_type="text/plain; charset=utf-8",
        )
    requested_path = (build_dir / asset_path).resolve()
    if build_dir not in requested_path.parents and requested_path != build_dir:
        raise Http404
    if requested_path.is_file():
        content_type, _ = mimetypes.guess_type(requested_path.name)
        return FileResponse(
            requested_path.open("rb"),
            content_type=content_type or "application/octet-stream",
        )
    if Path(asset_path).suffix:
        raise Http404
    index = build_dir / "index.html"
    if not index.is_file():
        raise Http404
    return FileResponse(index.open("rb"), content_type="text/html; charset=utf-8")
