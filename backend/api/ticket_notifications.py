import logging
import smtplib

from django.conf import settings
from django.core.exceptions import ImproperlyConfigured
from django.core.mail import BadHeaderError, send_mail

logger = logging.getLogger(__name__)


def notify_ticket(ticket, events):
    if not events:
        return None
    try:
        if not settings.EMAIL_HOST or not settings.EMAIL_HOST_USER or not settings.EMAIL_HOST_PASSWORD or not settings.DEFAULT_FROM_EMAIL:
            raise ImproperlyConfigured("La configuración SMTP está incompleta.")
        lines = [f"Ticket: {ticket.code or '#' + str(ticket.pk)}", f"Título: {ticket.title}", ""]
        if "created" in events:
            lines.append("Tu ticket ha sido registrado.")
        if "assigned" in events:
            lines.append(f"Personal de soporte asignado: {ticket.support_person.user.name}.")
        if "closed" in events:
            lines.append("Tu ticket ha sido cerrado.")
            if ticket.resolution:
                lines.extend(["", f"Solución: {ticket.resolution}"])
        sent = send_mail(
            "Actualización de tu ticket",
            "\n".join(lines),
            settings.DEFAULT_FROM_EMAIL,
            [ticket.client.email],
            fail_silently=False,
        )
        if sent != 1:
            raise OSError("El servicio de correo no confirmó el envío.")
    except (OSError, smtplib.SMTPException, ImproperlyConfigured, BadHeaderError):
        logger.exception("No se pudo enviar la notificación del ticket %s.", ticket.pk)
        return "El ticket se guardó, pero no se pudo enviar el correo al cliente. No se reintentará automáticamente."
    return None
