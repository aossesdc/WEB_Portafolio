from rest_framework.views import exception_handler


def api_exception_handler(exc, context):
    response = exception_handler(exc, context)
    if response is None:
        return None

    detail = response.data
    if isinstance(detail, dict) and isinstance(detail.get("message"), str):
        message = detail["message"]
    elif isinstance(detail, dict):
        message = next(iter(detail.values()), "Solicitud inválida.")
        if isinstance(message, (list, tuple)):
            message = message[0] if message else "Solicitud inválida."
        if isinstance(message, dict):
            message = "Revisa los datos enviados."
    elif isinstance(detail, (list, tuple)):
        message = detail[0] if detail else "Solicitud inválida."
    else:
        message = str(detail)
    response.data = {"ok": False, "message": str(message)}
    return response
