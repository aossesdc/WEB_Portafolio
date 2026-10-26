# WEB_Portafolio

## Base de datos y API local

El backend usa SQLite. La base `backend/data/sla-control.sqlite` se crea automáticamente al iniciar el servidor y conserva usuarios, sesiones y tickets entre reinicios. La tabla de tickets inicia vacía y solo contiene solicitudes que se creen desde la aplicación. Se conservan las cuentas de acceso de demostración para poder entrar a cada perfil.

Requisitos: Node.js 20 o superior.

En PowerShell, desde la carpeta del proyecto:

```powershell
cd backend
Copy-Item .env.example .env
npm install
npm run dev
```

Con el servidor activo en `http://localhost:4000`, abre `index.html`, inicia sesión y crea un ticket desde el dashboard cliente. El panel ejecutivo y el administrativo leerán los tickets persistidos. La API de tickets requiere sesión.

Usuarios de demostración:

| Perfil | Correo | Contraseña |
| --- | --- | --- |
| Cliente | cliente@empresa.cl | Cliente123 |
| Ejecutivo de trabajo | ejecutivo.trabajo@empresa.cl | Trabajo123 |
| Ejecutivo de soporte | ejecutivo.soporte@empresa.cl | Soporte123 |
| Administrador | admin@empresa.cl | Admin123 |

La ruta de la base puede cambiarse con `DATABASE_PATH` en `backend/.env`. El archivo SQLite local y las dependencias instaladas se excluyen de Git.