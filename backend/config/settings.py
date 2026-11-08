import os
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlsplit

from django.core.exceptions import ImproperlyConfigured
from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / ".env")

DEBUG = os.getenv("DJANGO_DEBUG", "true").lower() == "true"
SECRET_KEY = os.getenv("DJANGO_SECRET_KEY")
if not SECRET_KEY:
    if not DEBUG:
        raise ImproperlyConfigured("Configura DJANGO_SECRET_KEY cuando DJANGO_DEBUG=false.")
    SECRET_KEY = "local-development-key-change-before-deploying"
ALLOWED_HOSTS = [
    host.strip()
    for host in os.getenv("DJANGO_ALLOWED_HOSTS", "localhost,127.0.0.1").split(",")
    if host.strip()
]

INSTALLED_APPS = [
    "corsheaders",
    "rest_framework",
    "api.apps.ApiConfig",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "config.urls"
TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": ["django.template.context_processors.request"],
        },
    },
]
WSGI_APPLICATION = "config.wsgi.application"
ASGI_APPLICATION = "config.asgi.application"

def postgres_database():
    database_url = os.getenv("DATABASE_URL")
    if database_url:
        parsed = urlsplit(database_url)
        if parsed.scheme not in ("postgres", "postgresql") or not parsed.path.strip("/"):
            raise ImproperlyConfigured("DATABASE_URL debe ser una URL PostgreSQL válida.")
        query_options = {key: values[-1] for key, values in parse_qs(parsed.query).items()}
        query_options.setdefault("connect_timeout", 5)
        return {
            "ENGINE": "django.db.backends.postgresql",
            "NAME": unquote(parsed.path.lstrip("/")),
            "USER": unquote(parsed.username or ""),
            "PASSWORD": unquote(parsed.password or ""),
            "HOST": parsed.hostname or "localhost",
            "PORT": str(parsed.port or 5432),
            "CONN_MAX_AGE": 60,
            "OPTIONS": query_options,
        }
    return {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": os.getenv("PGDATABASE", "SLA_DB"),
        "USER": os.getenv("PGUSER", "postgres"),
        "PASSWORD": os.getenv("PGPASSWORD", ""),
        "HOST": os.getenv("PGHOST", "localhost"),
        "PORT": os.getenv("PGPORT", "5432"),
        "CONN_MAX_AGE": 60,
        "OPTIONS": {"connect_timeout": 5},
    }


DATABASES = {"default": postgres_database()}

EMAIL_BACKEND = "django.core.mail.backends.smtp.EmailBackend"
EMAIL_HOST = os.getenv("EMAIL_HOST", "")
EMAIL_PORT = int(os.getenv("EMAIL_PORT", "587"))
EMAIL_HOST_USER = os.getenv("EMAIL_HOST_USER", "")
EMAIL_HOST_PASSWORD = os.getenv("EMAIL_HOST_PASSWORD", "")
EMAIL_USE_TLS = os.getenv("EMAIL_USE_TLS", "true").lower() == "true"
EMAIL_USE_SSL = os.getenv("EMAIL_USE_SSL", "false").lower() == "true"
EMAIL_TIMEOUT = 10
DEFAULT_FROM_EMAIL = os.getenv("DEFAULT_FROM_EMAIL", "")
FRONTEND_PUBLIC_URL = os.getenv("FRONTEND_PUBLIC_URL", "http://127.0.0.1:4000" if DEBUG else "").rstrip("/")
_frontend_url = urlsplit(FRONTEND_PUBLIC_URL)
if (
    not _frontend_url.netloc
    or _frontend_url.scheme not in (("http", "https") if DEBUG else ("https",))
    or _frontend_url.username
    or _frontend_url.password
    or _frontend_url.query
    or _frontend_url.fragment
):
    raise ImproperlyConfigured("Configura FRONTEND_PUBLIC_URL con la dirección pública del frontend; usa HTTPS fuera de desarrollo.")
PASSWORD_RESET_TIMEOUT = 3600

AUTH_USER_MODEL = "api.User"
MIGRATION_MODULES = {"api": None}
AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]
PASSWORD_HASHERS = [
    "django.contrib.auth.hashers.PBKDF2PasswordHasher",
    "django.contrib.auth.hashers.PBKDF2SHA1PasswordHasher",
]
LANGUAGE_CODE = "es-cl"
TIME_ZONE = "America/Santiago"
USE_I18N = True
USE_TZ = True

APPEND_SLASH = False
SECURE_CONTENT_TYPE_NOSNIFF = True
X_FRAME_OPTIONS = "DENY"

CORS_ALLOWED_ORIGINS = [
    origin.strip()
    for origin in os.getenv("CORS_ALLOWED_ORIGINS", "http://localhost:4200,http://127.0.0.1:4200").split(",")
    if origin.strip()
]

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": ["api.authentication.BearerSessionAuthentication"],
    "DEFAULT_PERMISSION_CLASSES": ["rest_framework.permissions.AllowAny"],
    "EXCEPTION_HANDLER": "api.exceptions.api_exception_handler",
    "UNAUTHENTICATED_USER": None,
    "DEFAULT_THROTTLE_RATES": {"password_reset": "5/hour", "password_reset_confirm": "20/hour"},
}
