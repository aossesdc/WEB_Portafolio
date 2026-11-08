from django.contrib.auth.base_user import AbstractBaseUser, BaseUserManager
from django.db import models


ROLE_ALIASES = {
    "admin": "admin",
    "administrador": "admin",
    "client": "client",
    "cliente": "client",
    "ejecutivo": "executive",
    "ejecutivo de trabajo": "executive",
    "ejecutivo de soporte": "soporte",
    "executive": "executive",
    "soporte": "soporte",
    "support": "soporte",
    "tech": "tech",
    "técnico": "tech",
    "tecnico": "tech",
}


def normalize_role(role):
    normalized = role.strip().lower()
    return ROLE_ALIASES.get(normalized, normalized)


class UserManager(BaseUserManager):
    use_in_migrations = False

    def create_user(self, email, password=None, **extra_fields):
        if not email:
            raise ValueError("El correo es obligatorio.")
        user = self.model(email=email.strip().lower(), **extra_fields)
        user.set_password(password)
        user.save(using=self._db)
        return user


class User(AbstractBaseUser):
    last_login = None
    id = models.AutoField(primary_key=True)
    email = models.EmailField(max_length=254, unique=True)
    password = models.CharField(max_length=255, db_column="password_hash")
    role = models.CharField(max_length=20, db_column="rol")
    is_active = models.BooleanField(default=True, null=True, db_column="activo")
    created_by_admin = models.ForeignKey(
        "self", null=True, blank=True, db_column="creado_por_admin_id",
        on_delete=models.PROTECT, related_name="created_accounts",
    )

    objects = UserManager()

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS = []

    class Meta:
        db_table = "tb_usuarios"
        managed = False

    @property
    def name(self):
        try:
            if normalize_role(self.role) == "client":
                profile = self.client_profile
                return f"{profile.first_name} {profile.last_name}".strip()
            return self.staff_profile.full_name
        except (ClientProfile.DoesNotExist, StaffProfile.DoesNotExist):
            return self.email

    @property
    def profile(self):
        return {
            "admin": "Administrador",
            "client": "Cliente corporativo",
            "executive": "Ejecutivo de trabajo",
            "soporte": "Ejecutivo de soporte",
            "tech": "Técnico",
        }.get(normalize_role(self.role), self.role)

    @property
    def is_staff(self):
        return normalize_role(self.role) == "admin"

    @property
    def is_superuser(self):
        return self.is_staff

    def has_perm(self, perm, obj=None):
        return self.is_staff

    def has_module_perms(self, app_label):
        return self.is_staff


class ClientProfile(models.Model):
    user = models.OneToOneField(
        User,
        primary_key=True,
        db_column="usuario_id",
        on_delete=models.CASCADE,
        related_name="client_profile",
    )
    first_name = models.CharField(max_length=100, db_column="nombre")
    last_name = models.CharField(max_length=100, db_column="apellido")
    phone = models.CharField(max_length=20, null=True, blank=True, db_column="telefono")

    class Meta:
        db_table = "tb_perfiles_cliente"
        managed = False


class StaffProfile(models.Model):
    user = models.OneToOneField(
        User,
        primary_key=True,
        db_column="usuario_id",
        on_delete=models.CASCADE,
        related_name="staff_profile",
    )
    full_name = models.CharField(max_length=200, db_column="nombre_completo")
    employee_code = models.CharField(
        max_length=50,
        null=True,
        blank=True,
        unique=True,
        db_column="codigo_empleado",
    )

    class Meta:
        db_table = "tb_perfiles_personal"
        managed = False


class Holiday(models.Model):
    id = models.AutoField(primary_key=True)
    date = models.DateField(unique=True, db_column="fecha")
    title = models.CharField(max_length=150, db_column="nombre")
    type = models.CharField(max_length=50, db_column="tipo")
    is_irrenunciable = models.BooleanField(null=True, db_column="irrenunciable")

    class Meta:
        db_table = "tb_feriados"
        managed = False


class Branch(models.Model):
    id = models.AutoField(primary_key=True)
    name = models.CharField(max_length=150, db_column="nombre")
    address = models.CharField(max_length=255, db_column="direccion")
    commune = models.CharField(max_length=100, db_column="comuna")
    region = models.CharField(max_length=100)
    active = models.BooleanField(default=True, null=True, db_column="activa")

    class Meta:
        db_table = "tb_sucursales"
        managed = False


class Company(models.Model):
    id = models.AutoField(primary_key=True)
    rut = models.CharField(max_length=12, unique=True, db_column="rut_empresa")
    name = models.CharField(max_length=200, db_column="razon_social")
    business = models.CharField(max_length=150, null=True, blank=True, db_column="giro_rubro")
    address = models.CharField(max_length=255, null=True, blank=True, db_column="direccion_corporativa")
    email = models.EmailField(max_length=255, db_column="correo_contacto")
    phone = models.CharField(max_length=20, null=True, blank=True, db_column="telefono_contacto")
    active = models.BooleanField(default=True, null=True, db_column="estado")
    user = models.ForeignKey(User, null=True, blank=True, db_column="usuario_id",
                             on_delete=models.SET_NULL, related_name="companies")

    class Meta:
        db_table = "tb_clientes_empresa"
        managed = False


class Contract(models.Model):
    id = models.AutoField(primary_key=True)
    code = models.CharField(max_length=50, unique=True, null=True, db_column="codigo_contrato")
    company = models.ForeignKey(Company, db_column="cliente_empresa_id", on_delete=models.RESTRICT,
                                related_name="contracts")
    service_type = models.ForeignKey("ServiceType", null=True, blank=True, db_column="tipo_servicio_id",
                                     on_delete=models.SET_NULL, related_name="contracts")
    description = models.TextField(null=True, blank=True, db_column="descripcion")
    start_date = models.DateField(db_column="fecha_inicio")
    end_date = models.DateField(db_column="fecha_termino")
    coverage = models.CharField(max_length=10, db_column="tipo_cobertura_horaria")
    amount = models.DecimalField(max_digits=12, decimal_places=2, default=0, db_column="monto_contrato")
    status = models.CharField(max_length=20, default="Activo", db_column="estado_contrato")

    class Meta:
        db_table = "tb_contratos"
        managed = False


class ServiceType(models.Model):
    id = models.AutoField(primary_key=True)
    name = models.CharField(max_length=100, unique=True, db_column="nombre_servicio")
    description = models.TextField(db_column="descripcion_servicio")
    priority = models.CharField(max_length=20, default="Media", db_column="nivel_prioridad_base")
    active = models.BooleanField(default=True, db_column="activo")

    class Meta:
        db_table = "tb_tipos_servicio"
        managed = False


class HardwareCategory(models.Model):
    id = models.AutoField(primary_key=True)
    name = models.CharField(max_length=100, unique=True, db_column="nombre_categoria")
    description = models.TextField(db_column="descripcion")
    service_type = models.ForeignKey(ServiceType, null=True, blank=True, db_column="tipo_servicio_id",
                                     on_delete=models.SET_NULL, related_name="hardware_categories")
    active = models.BooleanField(default=True, db_column="activo")

    class Meta:
        db_table = "tb_categorias_hardware"
        managed = False


class SupportPersonnel(models.Model):
    id = models.AutoField(primary_key=True)
    user = models.OneToOneField(User, db_column="usuario_id", on_delete=models.CASCADE,
                                related_name="support_personnel")
    branch = models.ForeignKey(Branch, db_column="sucursal_id", on_delete=models.RESTRICT,
                               related_name="support_personnel")
    category = models.ForeignKey(HardwareCategory, null=True, blank=True, db_column="categoria_hardware_id",
                                 on_delete=models.SET_NULL, related_name="support_personnel")
    availability = models.CharField(max_length=20, default="Disponible", db_column="estado_disponibilidad")
    active = models.BooleanField(default=True, db_column="activo")

    class Meta:
        db_table = "tb_personal_soporte"
        managed = False


class Ticket(models.Model):
    id = models.AutoField(primary_key=True)
    code = models.CharField(max_length=50, unique=True, null=True, db_column="codigo_ticket")
    title = models.CharField(max_length=200, db_column="titulo")
    description = models.TextField(db_column="descripcion")
    category = models.ForeignKey(HardwareCategory, null=True, blank=True, db_column="categoria_hardware_id",
                                 on_delete=models.RESTRICT, related_name="tickets")
    client = models.ForeignKey(User, db_column="cliente_usuario_id", on_delete=models.RESTRICT,
                               related_name="tickets")
    support_person = models.ForeignKey(SupportPersonnel, null=True, blank=True, db_column="personal_soporte_id",
                                       on_delete=models.SET_NULL, related_name="tickets")
    status = models.CharField(max_length=20, null=True, default="Abierto", db_column="estado")
    priority = models.CharField(max_length=20, null=True, default=None, db_column="prioridad")
    risk = models.CharField(max_length=20, null=True, default=None, db_column="riesgo")
    resolution = models.TextField(null=True, blank=True, db_column="descripcion_solucion")
    created_at = models.DateTimeField(null=True, db_column="creado_en", auto_now_add=True)
    updated_at = models.DateTimeField(null=True, db_column="actualizado_en", auto_now=True)

    class Meta:
        db_table = "tb_tickets"
        managed = False
