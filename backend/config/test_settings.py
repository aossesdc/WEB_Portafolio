from .settings import *  # noqa: F403

# These tests use an isolated in-memory database, never the configured PostgreSQL database.
DATABASES = {"default": {"ENGINE": "django.db.backends.sqlite3", "NAME": ":memory:"}}
