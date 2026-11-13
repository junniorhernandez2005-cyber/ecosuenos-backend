'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const request = require('supertest');

const ADMIN_EMAIL = 'admin@ecosuenos.org';
const ADMIN_PASSWORD = 'Ecosuenos2026Test';
const TEST_SECRET = 'test-secret-0123456789abcdefghijklmnopqrstuvwxyz';

const BASE_ENV = {
  NODE_ENV: 'test',
  JWT_SECRET: TEST_SECRET,
  JWT_EXPIRES_IN: '1h',
  ADMIN_EMAIL,
  ADMIN_PASSWORD,
  BCRYPT_ROUNDS: '4',
  CORS_ORIGIN: 'http://localhost:4200',
  LOGIN_RATE_LIMIT_MAX: '1000',
  LOGIN_RATE_LIMIT_WINDOW_MINUTES: '15',
  DONACION_ESTADOS: 'PENDIENTE,APROBADO,ENTREGADO,PROGRAMADO',
  NINO_EDAD_MIN: '0',
  NINO_EDAD_MAX: '18',
  REQUIRE_HTTPS: 'false',
};

const silentLogger = { info() {}, warn() {}, error() {} };

function applyEnv(overrides = {}) {
  for (const [k, v] of Object.entries({ ...BASE_ENV, ...overrides })) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
}

function tempDbFile() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ecosuenos-test-'));
  return path.join(dir, 'ecosuenos.sqlite');
}

/** Construye app + base temporal. Reutiliza `dbFile` para simular reinicios. */
function createContext({ env = {}, dbFile = tempDbFile() } = {}) {
  applyEnv(env);
  // Se requiere en cada llamada para leer la configuración actual del entorno.
  const { loadConfig } = require('../src/config');
  const { openDatabase, seedInitialAdmin } = require('../src/db/database');
  const { createApp } = require('../src/app');

  const config = loadConfig();
  const db = openDatabase(dbFile);
  seedInitialAdmin(db, config);
  const app = createApp({ config, db, logger: silentLogger, logRequests: false });

  async function login(email = ADMIN_EMAIL, password = ADMIN_PASSWORD) {
    const res = await request(app).post('/api/auth/login').send({ email, password });
    return res.body.token;
  }

  function close() {
    if (db.open) db.close();
  }

  return { app, db, config, dbFile, login, close };
}

const SAMPLES = {
  inventario: { nombre: 'Arroz', cantidad: 25 },
  'donaciones-externas': {
    nombre: 'Supermercado La Economía',
    contacto: 'donaciones@laeconomia.co',
    telefono: '0316011234',
    tipoDonacion: 'alimentos',
    descripcion: '20 mercados',
    fecha: '2026-11-03',
    estado: 'PENDIENTE',
  },
  'donaciones-internas': {
    nombre: 'Voluntariado interno',
    contacto: 'Llamar a coordinación',
    telefono: '+57 300 123 4567',
    tipoDonacion: 'ropa',
    descripcion: 'Ropa de invierno',
    fecha: '2026-10-15',
    estado: 'aprobado',
  },
  personal: { nombre: 'Ana Pérez', cargo: 'Coordinadora', correo: 'ana@ecosuenos.org', telefono: '0057 310 000 0000' },
  ninos: { nombre: 'Niño de prueba', edad: 9, curso: '4°', fechaIngreso: '2026-02-01', observaciones: '' },
};

module.exports = { createContext, applyEnv, tempDbFile, SAMPLES, ADMIN_EMAIL, ADMIN_PASSWORD, TEST_SECRET, request };
