from datetime import timedelta

from django.core import signing
from django.utils.crypto import constant_time_compare, salted_hmac
from rest_framework.authentication import BaseAuthentication
from rest_framework.exceptions import AuthenticationFailed

from .models import User


SESSION_MAX_AGE = timedelta(hours=8)
SESSION_SALT = "api.auth.session"


def create_session_token(user):
    return signing.dumps({"id": user.pk, "version": session_version(user)}, salt=SESSION_SALT)


def session_version(user):
    return salted_hmac("api.auth.session.password", user.password).hexdigest()


class BearerSessionAuthentication(BaseAuthentication):
    def authenticate(self, request):
        authorization = request.headers.get("Authorization", "")
        parts = authorization.split()
        if not parts:
            return None
        if len(parts) != 2 or parts[0].lower() != "bearer":
            raise AuthenticationFailed({"message": "Inicia sesión para continuar."})

        try:
            payload = signing.loads(
                parts[1],
                salt=SESSION_SALT,
                max_age=SESSION_MAX_AGE.total_seconds(),
            )
            if not isinstance(payload, dict) or not isinstance(payload.get("id"), int) or not isinstance(payload.get("version"), str):
                raise ValueError("Formato de sesión inválido.")
            user = User.objects.get(pk=payload["id"], is_active=True)
            if not constant_time_compare(payload["version"], session_version(user)):
                raise ValueError("La contraseña de la cuenta cambió.")
        except (signing.BadSignature, User.DoesNotExist, TypeError, ValueError) as exc:
            raise AuthenticationFailed(
                {"message": "La sesión expiró. Inicia sesión nuevamente."}
            ) from exc
        return user, parts[1]

    def authenticate_header(self, request):
        return "Bearer"
