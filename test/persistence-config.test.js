'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { createContext, applyEnv, request, SAMPLES, tempDbFile } = require('./helpers');

describe('Persistencia (RF-022, CA-09)', () => {
  test('los cinco módulos conservan sus datos tras reiniciar el servidor', async () => {
    const dbFile = tempDbFile();
    const first = createContext({ dbFile });
    const h1 = { Authorization: `Bearer ${await first.login()}` };
    const ids = {};
    for (const [name, sample] of Object.entries(SAMPLES)) {
      const res = await request(first.app).post(`/api/${name}`).set(h1).send(sample);
      assert.equal(res.status, 201);
      ids[name] = res.body.id;
    }
    first.close(); // "apagado" del servidor

    const second = createContext({ dbFile }); // "reinicio" sobre el mismo archivo
    const h2 = { Authorization: `Bearer ${await second.login()}` };
    for (const [name, id] of Object.entries(ids)) {
      const res = await request(second.app).get(`/api/${name}`).set(h2);
      assert.equal(res.status, 200);
      assert.ok(res.body[id], `${name} conserva el registro ${id}`);
      assert.equal(res.body[id].nombre, SAMPLES[name].nombre);
    }
    // El administrador inicial no se duplica al reiniciar
    const total = second.db.prepare('SELECT COUNT(*) AS n FROM usuarios').get().n;
    assert.equal(total, 1);
    second.close();
  });

  test('las contraseñas se almacenan con bcrypt, nunca en texto plano (RNF-001)', () => {
    const ctx = createContext();
    const row = ctx.db.prepare('SELECT password_hash FROM usuarios WHERE id = 1').get();
    assert.match(row.password_hash, /^\$2[aby]\$\d{2}\$/);
    assert.ok(!row.password_hash.includes('Ecosuenos2026Test'));
    ctx.close();
  });

  test('restricciones CHECK de SQLite como defensa en profundidad (RNF-006)', () => {
    const ctx = createContext();
    const ts = new Date().toISOString();
    assert.throws(() =>
      ctx.db.prepare('INSERT INTO inventario VALUES (?, ?, ?, ?, ?)').run('x', 'Arroz', -1, ts, ts)
    );
    assert.throws(() =>
      ctx.db.prepare('INSERT INTO inventario VALUES (?, ?, ?, ?, ?)').run('y', 'Arroz', 1.5, ts, ts)
    );
    ctx.close();
  });
});

describe('Configuración por entorno (RNF-002, RNF-012)', () => {
  const { loadConfig, ConfigError } = require('../src/config');

  test('sin JWT_SECRET el servidor no arranca', () => {
    applyEnv({ JWT_SECRET: undefined });
    assert.throws(() => loadConfig(), ConfigError);
  });

  test('JWT_SECRET de ejemplo o corto es rechazado', () => {
    applyEnv({ JWT_SECRET: 'CAMBIAR_POR_UN_SECRETO_ALEATORIO_DE_AL_MENOS_32_CARACTERES' });
    assert.throws(() => loadConfig(), ConfigError);
    applyEnv({ JWT_SECRET: 'corto' });
    assert.throws(() => loadConfig(), ConfigError);
  });

  test('en producción CORS_ORIGIN explícito es obligatorio y no admite "*"', () => {
    applyEnv({ NODE_ENV: 'production', CORS_ORIGIN: undefined });
    assert.throws(() => loadConfig(), /CORS_ORIGIN/);
    applyEnv({ NODE_ENV: 'production', CORS_ORIGIN: '*' });
    assert.throws(() => loadConfig(), /CORS_ORIGIN/);
    applyEnv({ NODE_ENV: 'production', CORS_ORIGIN: 'https://app.ecosuenos.org', REQUIRE_HTTPS: undefined });
    assert.equal(loadConfig().requireHttps, true, 'HTTPS obligatorio por defecto en producción');
    applyEnv();
  });

  test('ADMIN_PASSWORD débil impide crear el administrador inicial', () => {
    assert.throws(() => createContext({ env: { ADMIN_PASSWORD: '12345' } }), /política de contraseñas/);
    applyEnv();
  });

  test('base vacía sin ADMIN_EMAIL no arranca', () => {
    assert.throws(() => createContext({ env: { ADMIN_EMAIL: '' } }), /ADMIN_EMAIL/);
    applyEnv();
  });
});

describe('HTTPS obligatorio en producción (RNF-004)', () => {
  test('con REQUIRE_HTTPS=true se rechaza HTTP plano y se acepta X-Forwarded-Proto=https tras proxy', async () => {
    const ctx = createContext({ env: { REQUIRE_HTTPS: 'true', TRUST_PROXY: 'true' } });
    const plain = await request(ctx.app).post('/api/auth/login').send({});
    assert.equal(plain.status, 403);
    assert.equal(plain.body.error.code, 'HTTPS_REQUIRED');

    const viaProxy = await request(ctx.app).post('/api/auth/login').set('X-Forwarded-Proto', 'https').send({});
    assert.equal(viaProxy.status, 400, 'pasa el filtro HTTPS y llega a la validación');

    const health = await request(ctx.app).get('/api/health');
    assert.equal(health.status, 200, 'health sigue disponible para sondas internas');
    ctx.close();
    applyEnv();
  });
});
