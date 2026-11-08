# SLA Control

Portal de soporte para registrar y gestionar tickets. La interfaz utiliza Angular; la API utiliza Django REST Framework y PostgreSQL.

## Funcionalidades

- Clientes: registro, inicio de sesión, recuperación de contraseña por correo, creación y consulta de sus tickets.
- Ejecutivos: consulta y gestión de tickets, creación para clientes, asignación de personal y evaluación de riesgo.
- Soporte: consulta de tickets asignados, actualización de estado y registro de soluciones.
- Administración: resumen de tickets y gestión de cuentas, feriados, sucursales, empresas, contratos, tipos de servicio, categorías de equipos y personal operativo.
- Reportes CSV y PDF según los permisos y filtros del panel. Los datos se actualizan al abrir el resumen o al solicitar una actualización; no hay actualización automática.
- Las rutas `/preview/client`, `/preview/executive`, `/preview/support` y `/preview/admin` son vistas públicas de demostración, no paneles con datos reales.

## Requisitos

- Python 3.12 o posterior, compatible con las dependencias instaladas.
- Node.js compatible con Angular 22: `^22.22.3`, `^24.15.0` o `>=26.0.0`, y npm.
- PostgreSQL con la base y el esquema existentes.
- Servidor SMTP para recuperación de contraseñas y notificaciones.
