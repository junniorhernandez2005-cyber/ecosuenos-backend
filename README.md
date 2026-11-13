# Ecosueños — Backend (API REST)

Node.js 20+ · Express · SQLite (better-sqlite3) · JWT · bcrypt

## Instalación y ejecución local

```bash
cd backend
cp .env.example .env          # en Windows: copy .env.example .env
npm run gen:secret            # copie el valor generado en JWT_SECRET del .env
# edite .env: JWT_SECRET, ADMIN_EMAIL y ADMIN_PASSWORD
npm install
npm run dev                   # desarrollo (se reinicia al guardar cambios)
# o: npm start                # sin recarga automática
```

Verifique: <http://localhost:3000/api/health> → `{"status":"ok","database":"ok",...}`

La base `data/ecosuenos.sqlite` y sus tablas se crean automáticamente al iniciar, junto con el
usuario administrador inicial (rol `ADMIN`) definido en `ADMIN_EMAIL` / `ADMIN_PASSWORD`.

> **Contraseña del administrador:** mínimo 10 caracteres, con mayúscula, minúscula y número.
> Si el usuario ya existe, cambiar `ADMIN_PASSWORD` en `.env` **no** cambia su clave; use
> `npm run user -- reset-password <correo>`.

## Scripts

| Comando | Descripción |
|---|---|
| `npm run dev` | Servidor con recarga automática (`node --watch`). |
| `npm start` | Servidor en modo normal. |
| `npm test` | Pruebas automáticas (105 casos, incluye los criterios CA-02 a CA-14). |
| `npm run gen:secret` | Genera un `JWT_SECRET` aleatorio. |
| `npm run db:backup` | Copia de seguridad en caliente a `backups/` con verificación de integridad y rotación. |
| `npm run db:restore -- <archivo> --yes` | Restaura una copia (detenga antes el servidor). |
| `npm run user -- <comando>` | Administración de usuarios por consola (ver abajo). |

### Usuarios (consola)

La administración visual de usuarios no está incluida en esta versión. Para gestionarlos:

```bash
npm run user -- list
npm run user -- create operador@ecosuenos.org --nombre "Operador" --role OPERADOR
npm run user -- reset-password admin@ecosuenos.org
npm run user -- deactivate operador@ecosuenos.org     # sus tokens dejan de servir de inmediato
npm run user -- activate operador@ecosuenos.org
npm run user -- revoke-sessions admin@ecosuenos.org   # cierra todas sus sesiones
```

La contraseña se pide por consola (oculta) o se toma de la variable `USER_PASSWORD`.
Los roles `OPERADOR` y `CONSULTA` se pueden almacenar, pero **la autorización granular por rol
aún no se aplica**: cualquier usuario autenticado y activo opera todos los módulos (sección 4 del
documento de requerimientos).

## Respaldo y restauración (RNF-011)

Rutina recomendada:

1. Programar `npm run db:backup` diariamente (Programador de tareas de Windows o `cron`):
   ```cron
   0 2 * * *  cd /ruta/ecosuenos/backend && npm run db:backup >> backups/backup.log 2>&1
   ```
2. Copiar periódicamente la carpeta `backups/` fuera del servidor (otro disco o nube privada).
3. Probar la restauración al menos una vez al mes en un entorno de prueba:
   ```bash
   # con el servidor detenido
   npm run db:restore -- backups/ecosuenos-20261103-020000123.sqlite --yes
   ```
   Antes de sobrescribir, la base actual se guarda como `backups/pre-restore-<fecha>.sqlite`.

`BACKUP_KEEP` (por defecto 14) define cuántas copias se conservan.

## Variables de entorno

Todas están documentadas en [`.env.example`](.env.example). Las principales:

| Variable | Por defecto | Uso |
|---|---|---|
| `PORT` | `3000` | Puerto HTTP. |
| `JWT_SECRET` | — (obligatoria) | Secreto de firma; ≥ 32 caracteres, distinto por entorno. |
| `JWT_EXPIRES_IN` | `8h` | Vigencia del token. |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | — | Administrador inicial. |
| `DB_FILE` | `./data/ecosuenos.sqlite` | Archivo SQLite. |
| `CORS_ORIGIN` | `http://localhost:4200` | Orígenes permitidos (obligatorio y explícito en producción). |
| `LOGIN_RATE_LIMIT_MAX` / `..._WINDOW_MINUTES` | `10` / `15` | Intentos fallidos de login permitidos por IP. |
| `DONACION_ESTADOS` | `PENDIENTE,APROBADO,ENTREGADO,PROGRAMADO` | Catálogo de estados. |
| `NINO_EDAD_MIN` / `NINO_EDAD_MAX` | `0` / `18` | Rango de edad admitido. |
| `REQUIRE_HTTPS` | `true` en producción | Rechaza HTTP plano. |
| `TRUST_PROXY` | `false` | `true` si un proxy/balanceador termina TLS. |
| `TLS_CERT_PATH` / `TLS_KEY_PATH` | — | HTTPS nativo opcional. |

## Producción (resumen)

- `NODE_ENV=production`, `JWT_SECRET` nuevo y exclusivo, `CORS_ORIGIN=https://su-frontend`.
- Servir sobre HTTPS: detrás de Nginx/balanceador con `TRUST_PROXY=true`, o con `TLS_CERT_PATH`/`TLS_KEY_PATH`.
- En producción el servidor rechaza peticiones HTTP planas (`403 HTTPS_REQUIRED`), excepto `/api/health`.
- Programar respaldos y probar restauraciones.

## Estructura

```
backend/
├── src/
│   ├── server.js                 # arranque (HTTP/HTTPS, cierre ordenado)
│   ├── app.js                    # middlewares y rutas
│   ├── config.js                 # configuración por entorno y validaciones de arranque
│   ├── collections/index.js      # definición de campos y reglas de las 5 colecciones
│   ├── db/database.js            # esquema SQLite y usuario administrador inicial
│   ├── middleware/               # requireAuth, requireHttps, errorHandler
│   ├── repositories/             # acceso a datos (colecciones y usuarios)
│   ├── routes/                   # auth, health y CRUD genérico
│   ├── validation/validators.js  # validación en servidor
│   └── utils/httpError.js
├── scripts/                      # backup, restore, users
├── test/                         # pruebas (node:test + supertest)
├── data/                         # base SQLite (excluida de git)
└── backups/                      # copias de seguridad (excluidas de git)
```

La documentación completa de endpoints está en [`../docs/API.md`](../docs/API.md).
