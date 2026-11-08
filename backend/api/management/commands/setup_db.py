from django.core.management import BaseCommand, CommandError
from django.db import connection


AUTH_TABLES = {
    "tb_usuarios",
    "tb_perfiles_cliente",
    "tb_perfiles_personal",
}
REQUIRED_TABLES = AUTH_TABLES | {"tb_feriados", "tb_sucursales", "tb_clientes_empresa", "tb_contratos", "tb_tipos_servicio", "tb_categorias_hardware", "tb_personal_soporte", "tb_tickets"}


class Command(BaseCommand):
    help = "Verifica las tablas existentes de autenticación y mantenedores."

    def handle(self, *args, **options):
        tables = set(connection.introspection.table_names())
        missing = REQUIRED_TABLES - tables
        extra = tables - REQUIRED_TABLES
        if missing:
            raise CommandError("Faltan tablas requeridas: " + ", ".join(sorted(missing)))
        if extra:
            raise CommandError(
                "Hay tablas adicionales en PostgreSQL: "
                + ", ".join(sorted(extra))
                + ". No se eliminaron automáticamente."
            )
        self.stdout.write(
            self.style.SUCCESS("PostgreSQL contiene las tablas requeridas de autenticación y mantenedores.")
        )
