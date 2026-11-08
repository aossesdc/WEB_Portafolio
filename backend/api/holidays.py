import json
import logging
from datetime import date
from urllib.error import URLError
from urllib.request import Request, urlopen

from django.db import DatabaseError, transaction
from rest_framework.decorators import api_view, authentication_classes, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response

from .models import Holiday
from .views import IsAccountAdministrator

logger = logging.getLogger(__name__)
HOLIDAYS_URL = "https://api.roison.cl/feriados.json"
MAX_RESPONSE_BYTES = 1024 * 1024
ALLOWED_TYPES = {"Religioso", "Civil", "Irrenunciable", "Especial"}


def fetch_national_weekday_holidays():
    upstream_request = Request(HOLIDAYS_URL, headers={"Accept": "application/json"})
    with urlopen(upstream_request, timeout=8) as response:
        body = response.read(MAX_RESPONSE_BYTES + 1)
    if len(body) > MAX_RESPONSE_BYTES:
        raise ValueError("La respuesta supera el tamaño permitido.")
    payload = json.loads(body)
    if not isinstance(payload, dict) or not isinstance(payload.get("data"), list):
        raise ValueError("La respuesta no contiene una lista de feriados.")
    result = []
    seen_dates = set()
    for item in payload["data"]:
        if not isinstance(item, dict) or item.get("scope") not in ("Nacional", "Regional"):
            raise ValueError("El ámbito de un feriado es inválido.")
        if item["scope"] != "Nacional":
            continue
        value = item.get("date")
        if not isinstance(value, str):
            raise ValueError("La fecha de un feriado es inválida.")
        day = date.fromisoformat(value)
        if day.isoformat() != value:
            raise ValueError("La fecha de un feriado es inválida.")
        if day.weekday() >= 5:
            continue
        title, kind, irrenunciable = item.get("title"), item.get("type"), item.get("is_irrenunciable")
        if (not isinstance(title, str) or not title.strip() or len(title) > 150
                or not isinstance(kind, str) or kind not in ALLOWED_TYPES
                or not isinstance(irrenunciable, bool)):
            raise ValueError("Los datos de un feriado son inválidos.")
        if day in seen_dates:
            raise ValueError("La API contiene más de un feriado nacional para la misma fecha.")
        seen_dates.add(day)
        result.append((day, title.strip(), kind, irrenunciable))
    return result


@api_view(["GET"])
@authentication_classes([])
@permission_classes([AllowAny])
def holidays(request):
    try:
        records = Holiday.objects.order_by("date", "id")
        return Response({"data": [
            {"id": h.id, "date": h.date.isoformat(), "title": h.title,
             "type": h.type, "is_irrenunciable": bool(h.is_irrenunciable)}
            for h in records
        ]})
    except DatabaseError:
        logger.exception("No fue posible consultar la tabla de feriados.")
        return Response({"ok": False, "message": "No fue posible consultar los feriados guardados."}, status=503)


@api_view(["POST"])
@permission_classes([IsAuthenticated, IsAccountAdministrator])
def sync_holidays(request):
    try:
        source = fetch_national_weekday_holidays()
    except (URLError, TimeoutError, OSError, UnicodeDecodeError, json.JSONDecodeError, ValueError):
        logger.exception("No fue posible obtener los feriados desde la API externa.")
        return Response({"ok": False, "message": "No fue posible sincronizar la API de feriados; los datos guardados no se modificaron."}, status=502)
    try:
        inserted = 0
        with transaction.atomic():
            for day, title, kind, irrenunciable in source:
                _, created = Holiday.objects.get_or_create(
                    date=day, defaults={"title": title, "type": kind, "is_irrenunciable": irrenunciable}
                )
                inserted += int(created)
        return Response({"ok": True, "inserted": inserted})
    except DatabaseError:
        logger.exception("No fue posible guardar los feriados.")
        return Response({"ok": False, "message": "No fue posible guardar los feriados en PostgreSQL."}, status=503)
