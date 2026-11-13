'use strict';

/**
 * Configuración centralizada por entorno (RNF-012).
 * Todos los valores sensibles (JWT_SECRET, credenciales del administrador inicial)
 * se leen de variables de entorno y nunca se escriben en el repositorio (RNF-002).
 */
const path = require('node:path');

const BACKEND_ROOT = path.resolve(__dirname, '..');

// Carga backend/.env si existe. Las variables ya definidas en el proceso tienen prioridad.
require('dotenv').config({ path: path.join(BACKEND_ROOT, '.env'), quiet: true });

const PLACEHOLDER_SECRETS = new Set([
  'cambia-este-secreto',
  'CAMBIAR_POR_UN_SECRETO_ALEATORIO_DE_AL_MENOS_32_CARACTERES',
  'secret',
  'changeme',
]);

const DEFAULT_ESTADOS_DONACION = ['PENDIENTE', 'APROBADO', 'ENTREGADO', 'PROGRAMADO'];

class ConfigError extends Error {}

function readInt(name, defaultValue, { min = -Infinity, max = Infinity } = {}) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return defaultValue;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new ConfigError(`La variable ${name} debe ser un entero entre ${min} y ${max}. Valor recibido: "${raw}".`);
  }
  return value;
}

function readBool(name, defaultValue) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return defaultValue;
  return ['1', 'true', 'yes', 'si', 'sí'].includes(String(raw).trim().toLowerCase());
}

function readList(name, defaultValue) {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === '') return defaultValue;
  return raw
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function resolveFromBackend(p) {
  return path.isAbsolute(p) ? p : path.resolve(BACKEND_ROOT, p);
}

/**
 * Política mínima de contraseña robusta (sección 11):
 * al menos 10 caracteres, con mayúscula, minúscula y número.
 */
function passwordPolicyErrors(password) {
  const errors = [];
  if (typeof password !== 'string' || password.length < 10) errors.push('al menos 10 caracteres');
  if (!/[a-z]/.test(password || '')) errors.push('una letra minúscula');
  if (!/[A-Z]/.test(password || '')) errors.push('una letra mayúscula');
  if (!/[0-9]/.test(password || '')) errors.push('un número');
  return errors;
}

function loadConfig() {
  const nodeEnv = process.env.NODE_ENV || 'development';
  const isProduction = nodeEnv === 'production';

  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret || jwtSecret.length < 32 || PLACEHOLDER_SECRETS.has(jwtSecret)) {
    throw new ConfigError(
      'JWT_SECRET no está configurado o es inseguro. Defina en backend/.env un valor aleatorio de al menos 32 caracteres ' +
        '(por ejemplo: node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'hex\'))").'
    );
  }

  const corsOrigins = readList('CORS_ORIGIN', isProduction ? [] : ['http://localhost:4200']);
  if (isProduction && (corsOrigins.length === 0 || corsOrigins.includes('*'))) {
    throw new ConfigError('En producción CORS_ORIGIN debe indicar uno o más orígenes explícitos (sin "*").');
  }

  const estadosDonacion = readList('DONACION_ESTADOS', DEFAULT_ESTADOS_DONACION).map((e) => e.toUpperCase());

  const ninoEdadMin = readInt('NINO_EDAD_MIN', 0, { min: 0, max: 120 });
  const ninoEdadMax = readInt('NINO_EDAD_MAX', 18, { min: 0, max: 120 });
  if (ninoEdadMin > ninoEdadMax) {
    throw new ConfigError('NINO_EDAD_MIN no puede ser mayor que NINO_EDAD_MAX.');
  }

  const tlsCertPath = process.env.TLS_CERT_PATH ? resolveFromBackend(process.env.TLS_CERT_PATH) : null;
  const tlsKeyPath = process.env.TLS_KEY_PATH ? resolveFromBackend(process.env.TLS_KEY_PATH) : null;
  if ((tlsCertPath && !tlsKeyPath) || (!tlsCertPath && tlsKeyPath)) {
    throw new ConfigError('Para HTTPS nativo deben definirse TLS_CERT_PATH y TLS_KEY_PATH juntos.');
  }

  return Object.freeze({
    nodeEnv,
    isProduction,
    port: readInt('PORT', 3000, { min: 1, max: 65535 }),
    host: process.env.HOST || '0.0.0.0',

    jwt: Object.freeze({
      secret: jwtSecret,
      expiresIn: process.env.JWT_EXPIRES_IN || '8h',
      issuer: process.env.JWT_ISSUER || 'ecosuenos-api',
      algorithm: 'HS256',
    }),

    bcryptRounds: readInt('BCRYPT_ROUNDS', 12, { min: 4, max: 15 }),

    admin: Object.freeze({
      email: (process.env.ADMIN_EMAIL || '').trim().toLowerCase(),
      password: process.env.ADMIN_PASSWORD || '',
      nombre: process.env.ADMIN_NOMBRE || 'Administrador',
    }),

    dbFile: resolveFromBackend(process.env.DB_FILE || './data/ecosuenos.sqlite'),
    backupDir: resolveFromBackend(process.env.BACKUP_DIR || './backups'),

    corsOrigins,

    loginRateLimit: Object.freeze({
      windowMinutes: readInt('LOGIN_RATE_LIMIT_WINDOW_MINUTES', 15, { min: 1, max: 1440 }),
      max: readInt('LOGIN_RATE_LIMIT_MAX', 10, { min: 1, max: 10000 }),
    }),

    trustProxy: readBool('TRUST_PROXY', false),
    requireHttps: readBool('REQUIRE_HTTPS', isProduction),
    tls: tlsCertPath ? Object.freeze({ certPath: tlsCertPath, keyPath: tlsKeyPath }) : null,

    jsonBodyLimit: process.env.JSON_BODY_LIMIT || '100kb',
    maxPageSize: readInt('MAX_PAGE_SIZE', 500, { min: 1, max: 10000 }),

    estadosDonacion: Object.freeze(estadosDonacion),
    ninoEdad: Object.freeze({ min: ninoEdadMin, max: ninoEdadMax }),
  });
}

/**
 * Configuración mínima para los scripts de mantenimiento (respaldos, usuarios),
 * que no necesitan JWT_SECRET ni CORS.
 */
function loadMaintenanceConfig() {
  return Object.freeze({
    dbFile: resolveFromBackend(process.env.DB_FILE || './data/ecosuenos.sqlite'),
    backupDir: resolveFromBackend(process.env.BACKUP_DIR || './backups'),
    backupKeep: readInt('BACKUP_KEEP', 14, { min: 1, max: 10000 }),
    bcryptRounds: readInt('BCRYPT_ROUNDS', 12, { min: 4, max: 15 }),
  });
}

module.exports = { loadConfig, loadMaintenanceConfig, ConfigError, passwordPolicyErrors, BACKEND_ROOT };
