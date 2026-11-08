from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import serializers

from .models import ClientProfile, StaffProfile, User, normalize_role


class AccountInput(serializers.Serializer):
    email = serializers.EmailField(max_length=254)
    role = serializers.ChoiceField(choices=["admin", "ejecutivo", "soporte"], required=False)
    password = serializers.CharField(min_length=8, max_length=128, write_only=True, required=False, trim_whitespace=False)
    first_name = serializers.CharField(max_length=100, required=False)
    last_name = serializers.CharField(max_length=100, required=False)
    phone = serializers.CharField(max_length=20, required=False, allow_blank=True, allow_null=True)
    full_name = serializers.CharField(max_length=200, required=False)
    employee_code = serializers.CharField(max_length=50, required=False, allow_blank=True, allow_null=True)
    active = serializers.BooleanField(required=False)

    def validate_email(self, value):
        value = value.strip().lower()
        existing = User.objects.filter(email__iexact=value)
        if self.instance:
            existing = existing.exclude(pk=self.instance.pk)
        if existing.exists():
            raise serializers.ValidationError("Ya existe una cuenta con ese correo.")
        return value

    def validate(self, attrs):
        unknown = set(self.initial_data) - set(self.fields)
        if unknown:
            raise serializers.ValidationError("Hay campos no permitidos.")
        creating = self.instance is None
        if creating:
            for field in ("email", "role", "password", "full_name"):
                if field not in attrs:
                    raise serializers.ValidationError({field: "Este campo es obligatorio."})
            if "active" in attrs or any(field in attrs for field in ("first_name", "last_name", "phone")):
                raise serializers.ValidationError("No se puede crear un cliente desde este módulo.")
        else:
            if "role" in attrs:
                raise serializers.ValidationError({"role": "El rol no se puede modificar."})
            client = normalize_role(self.instance.role) == "client"
            forbidden = ("full_name", "employee_code") if client else ("first_name", "last_name", "phone")
            if any(field in attrs for field in forbidden):
                raise serializers.ValidationError("Los campos no corresponden al tipo de cuenta.")
            if attrs.get("active") is False:
                raise serializers.ValidationError("Usa la acción de desactivar para eliminar una cuenta.")
        if "password" in attrs:
            if len(attrs["password"].strip()) < 8:
                raise serializers.ValidationError({"password": "La contraseña debe tener al menos 8 caracteres que no sean espacios."})
            try:
                validate_password(attrs["password"], self.instance)
            except DjangoValidationError as exc:
                raise serializers.ValidationError({"password": exc.messages}) from exc
        return attrs

    def create(self, validated_data):
        full_name = validated_data.pop("full_name")
        code = validated_data.pop("employee_code", None) or None
        user = User.objects.create_user(
            created_by_admin=self.context["request"].user, **validated_data
        )
        StaffProfile.objects.create(user=user, full_name=full_name, employee_code=code)
        return user

    def update(self, instance, validated_data):
        profile_fields = ("first_name", "last_name", "phone") if normalize_role(instance.role) == "client" else ("full_name", "employee_code")
        profile = instance.client_profile if normalize_role(instance.role) == "client" else instance.staff_profile
        for field in profile_fields:
            if field in validated_data:
                value = validated_data.pop(field)
                setattr(profile, field, (value or None) if field in ("phone", "employee_code") else value)
        profile.save()
        if "password" in validated_data:
            instance.set_password(validated_data.pop("password"))
        if "active" in validated_data:
            instance.is_active = validated_data.pop("active")
        for field, value in validated_data.items():
            setattr(instance, field, value)
        instance.save()
        return instance


def account_data(user):
    result = {
        "id": user.pk,
        "email": user.email,
        "role": normalize_role(user.role),
        "active": bool(user.is_active),
    }
    if result["role"] == "client":
        profile = user.client_profile
        result.update(first_name=profile.first_name, last_name=profile.last_name, phone=profile.phone or "")
    else:
        profile = user.staff_profile
        result.update(full_name=profile.full_name, employee_code=profile.employee_code or "")
    return result
