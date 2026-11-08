-- Run this script while connected to the PostgreSQL database used by the app.
-- Passwords are stored as Django hashes in password_hash, never as plain text.

BEGIN;

CREATE TABLE IF NOT EXISTS public.tb_usuarios (
    id SERIAL PRIMARY KEY,
    email VARCHAR(254) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    rol VARCHAR(20) NOT NULL DEFAULT 'cliente',
    creado_por_admin_id INTEGER NULL REFERENCES public.tb_usuarios (id),
    activo BOOLEAN DEFAULT TRUE,
    creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS public.tb_perfiles_cliente (
    usuario_id INTEGER PRIMARY KEY REFERENCES public.tb_usuarios (id) ON DELETE CASCADE,
    nombre VARCHAR(100) NOT NULL,
    apellido VARCHAR(100) NOT NULL,
    telefono VARCHAR(20) NULL
);

CREATE TABLE IF NOT EXISTS public.tb_perfiles_personal (
    usuario_id INTEGER PRIMARY KEY REFERENCES public.tb_usuarios (id) ON DELETE CASCADE,
    nombre_completo VARCHAR(200) NOT NULL,
    codigo_empleado VARCHAR(50) UNIQUE
);

COMMIT;
