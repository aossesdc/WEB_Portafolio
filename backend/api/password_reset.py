import logging
import smtplib
from urllib.parse import quote

from django.conf import settings
from django.contrib.auth.password_validation import validate_password
from django.contrib.auth.tokens import default_token_generator
from django.core.exceptions import ValidationError
from django.core.mail import BadHeaderError, send_mail
from django.core.validators import validate_email
from django.db import transaction
from django.utils.encoding import force_bytes, force_str
from django.utils.http import urlsafe_base64_decode, urlsafe_base64_encode
from rest_framework.decorators import api_view, authentication_classes, permission_classes, throttle_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.throttling import SimpleRateThrottle

from .models import User, normalize_role

logger = logging.getLogger(__name__)
GENERIC_MESSAGE = "Si existe una cuenta de cliente activa con ese correo, recibirás un enlace de recuperación."


class ResetRequestThrottle(SimpleRateThrottle):
    scope = "password_reset"

    def get_cache_key(self, request, view):
        return self.cache_format % {"scope": self.scope, "ident": self.get_ident(request)}


class ResetConfirmThrottle(ResetRequestThrottle):
    scope = "password_reset_confirm"


@api_view(["POST"])
@authentication_classes([])
@permission_classes([AllowAny])
@throttle_classes([ResetRequestThrottle])
def request_password_reset(request):
    email = request.data.get("email") if isinstance(request.data, dict) else None
    try:
        if not isinstance(email, str) or len(email.strip()) > 254:
            raise ValidationError("Correo inválido.")
        email = email.strip().lower()
        validate_email(email)
    except ValidationError:
        return Response({"ok": False, "message": "Ingresa un correo electrónico válido."}, status=400)

    if not all((settings.EMAIL_HOST, settings.EMAIL_HOST_USER, settings.EMAIL_HOST_PASSWORD, settings.DEFAULT_FROM_EMAIL)):
        logger.error("La configuración SMTP para recuperación de contraseña está incompleta.")
        return Response({"ok": False, "message": "El servicio de correo no está disponible. Inténtalo más tarde."}, status=503)

    users = list(User.objects.filter(email__iexact=email, is_active=True)[:2])
    if len(users) > 1:
        logger.error("Hay cuentas activas con correo duplicado; no se envió un enlace de recuperación.")
    user = users[0] if len(users) == 1 else None
    if user and normalize_role(user.role) == "client":
        uid = urlsafe_base64_encode(force_bytes(user.pk))
        token = default_token_generator.make_token(user)
        url = f"{settings.FRONTEND_PUBLIC_URL}/reset-password#{quote(uid)}/{quote(token)}"
        try:
            sent = send_mail(
                "Recuperación de contraseña - SLA Control",
                f"Solicitaste recuperar tu contraseña. Abre este enlace para crear una nueva:\n\n{url}\n\n"
                "El enlace vence en una hora y solo puede usarse una vez. Si no solicitaste este cambio, ignora este correo.",
                settings.DEFAULT_FROM_EMAIL,
                [user.email],
                fail_silently=False,
            )
            if sent != 1:
                raise OSError("El servicio de correo no confirmó el envío.")
        except (OSError, smtplib.SMTPException, BadHeaderError):
            logger.exception("No se pudo enviar el correo de recuperación.")
    return Response({"ok": True, "message": GENERIC_MESSAGE})


@api_view(["POST"])
@authentication_classes([])
@permission_classes([AllowAny])
@throttle_classes([ResetConfirmThrottle])
def confirm_password_reset(request):
    if not isinstance(request.data, dict):
        return Response({"ok": False, "message": "Revisa los datos ingresados."}, status=400)
    uid = request.data.get("uid")
    token = request.data.get("token")
    password = request.data.get("password")
    if not isinstance(uid, str) or len(uid) > 64 or not isinstance(token, str) or len(token) > 128:
        return Response({"ok": False, "message": "El enlace es inválido o ha vencido."}, status=400)
    if not isinstance(password, str) or len(password.strip()) < 8 or len(password) > 128:
        return Response({"ok": False, "message": "La contraseña debe tener entre 8 y 128 caracteres."}, status=400)
    try:
        user_id = int(force_str(urlsafe_base64_decode(uid)))
        if not 0 < user_id <= 2147483647:
            raise ValueError("Identificador fuera de rango.")
    except (ValueError, TypeError, UnicodeDecodeError, OverflowError):
        return Response({"ok": False, "message": "El enlace es inválido o ha vencido."}, status=400)
    with transaction.atomic():
        user = User.objects.select_for_update().filter(pk=user_id, is_active=True).first()
        if not user or normalize_role(user.role) != "client" or not default_token_generator.check_token(user, token):
            return Response({"ok": False, "message": "El enlace es inválido o ha vencido."}, status=400)
        try:
            validate_password(password, user)
        except ValidationError as error:
            return Response({"ok": False, "message": " ".join(error.messages)}, status=400)
        user.set_password(password)
        user.save(update_fields=["password"])
    return Response({"ok": True, "message": "Contraseña actualizada. Ya puedes iniciar sesión."})
