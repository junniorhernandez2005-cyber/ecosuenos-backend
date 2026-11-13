'use strict';

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const { createContext, request, ADMIN_EMAIL, ADMIN_PASSWORD, TEST_SECRET } = require('./helpers');
const { createUserRepository } = require('../src/repositories/userRepository');

describe('Autenticación', () => {
  let ctx;
  before(() => {
    ctx = createContext();
  });
  after(() => ctx.close());

  test('CA-01 / RF-001 / RF-003: credenciales válidas devuelven token con id, correo y rol', async () => {
    const res = await request(ctx.app).post('/api/auth/login').send({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
    assert.equal(res.status, 200);
    assert.ok(res.body.token);
    assert.deepEqual(res.body.user, { id: 1, email: ADMIN_EMAIL, nombre: 'Administrador', role: 'ADMIN' });
    assert.equal(res.body.user.password_hash, undefined);

    const payload = jwt.verify(res.body.token, TEST_SECRET);
    assert.equal(payload.sub, '1');
    assert.equal(payload.email, ADMIN_EMAIL);
    assert.equal(payload.role, 'ADMIN');
    assert.equal(payload.exp - payload.iat, 3600, 'vigencia configurable (JWT_EXPIRES_IN=1h)');
  });

  test('el correo no distingue mayúsculas ni espacios', async () => {
    const res = await request(ctx.app)
      .post('/api/auth/login')
      .send({ email: '  ADMIN@Ecosuenos.org ', password: ADMIN_PASSWORD });
    assert.equal(res.status, 200);
  });

  test('CA-02 / RF-002: contraseña incorrecta y correo inexistente -> 401 con el mismo mensaje y sin token', async () => {
    const wrongPass = await request(ctx.app).post('/api/auth/login').send({ email: ADMIN_EMAIL, password: 'otra' });
    const wrongMail = await request(ctx.app)
      .post('/api/auth/login')
      .send({ email: 'nadie@ecosuenos.org', password: ADMIN_PASSWORD });
    for (const res of [wrongPass, wrongMail]) {
      assert.equal(res.status, 401);
      assert.equal(res.body.token, undefined);
      assert.equal(res.body.error.code, 'INVALID_CREDENTIALS');
    }
    assert.equal(wrongPass.body.error.message, wrongMail.body.error.message);
  });

  test('login sin campos -> 400 con detalle por campo', async () => {
    const res = await request(ctx.app).post('/api/auth/login').send({});
    assert.equal(res.status, 400);
    assert.ok(res.body.error.details.email);
    assert.ok(res.body.error.details.password);
  });

  test('GET /api/auth/me devuelve identidad y rol del token', async () => {
    const token = await ctx.login();
    const res = await request(ctx.app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.user.email, ADMIN_EMAIL);
    assert.equal(res.body.user.role, 'ADMIN');
  });

  test('GET /api/auth/me sin token -> 401', async () => {
    const res = await request(ctx.app).get('/api/auth/me');
    assert.equal(res.status, 401);
  });

  test('CA-12: JWT manipulado es rechazado', async () => {
    const token = await ctx.login();
    const [h, p, s] = token.split('.');
    const payload = JSON.parse(Buffer.from(p, 'base64url').toString());
    payload.role = 'SUPERADMIN';
    const tampered = `${h}.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.${s}`;

    const otherSecret = jwt.sign({ sub: '1', email: ADMIN_EMAIL, role: 'ADMIN', tv: 0 }, 'x'.repeat(40), {
      issuer: 'ecosuenos-api',
    });
    const algNone = `${Buffer.from('{"alg":"none","typ":"JWT"}').toString('base64url')}.${p}.`;

    for (const bad of [tampered, otherSecret, algNone, 'no-es-un-jwt']) {
      const res = await request(ctx.app).get('/api/inventario').set('Authorization', `Bearer ${bad}`);
      assert.equal(res.status, 401, `debe rechazar: ${bad.slice(0, 20)}...`);
      assert.equal(res.body.error.code, 'TOKEN_INVALID');
    }
  });

  test('CA-12: JWT vencido es rechazado', async () => {
    const expired = jwt.sign(
      { sub: '1', email: ADMIN_EMAIL, role: 'ADMIN', tv: 0, iat: Math.floor(Date.now() / 1000) - 7200 },
      TEST_SECRET,
      { expiresIn: '1h', issuer: 'ecosuenos-api' }
    );
    const res = await request(ctx.app).get('/api/inventario').set('Authorization', `Bearer ${expired}`);
    assert.equal(res.status, 401);
    assert.equal(res.body.error.code, 'TOKEN_EXPIRED');
  });

  test('esquema distinto de Bearer es rechazado', async () => {
    const token = await ctx.login();
    const res = await request(ctx.app).get('/api/inventario').set('Authorization', `Basic ${token}`);
    assert.equal(res.status, 401);
    assert.equal(res.body.error.code, 'TOKEN_MISSING');
  });
});

describe('Usuarios inactivos y revocación (sección 10)', () => {
  let ctx;
  let users;
  before(() => {
    ctx = createContext();
    users = createUserRepository(ctx.db);
    users.create({ email: 'operador@ecosuenos.org', nombre: 'Op', password: 'Operador2026x', role: 'OPERADOR' }, 4);
  });
  after(() => ctx.close());

  test('un usuario desactivado no puede usar un token aún vigente ni iniciar sesión', async () => {
    const token = await ctx.login('operador@ecosuenos.org', 'Operador2026x');
    let res = await request(ctx.app).get('/api/inventario').set('Authorization', `Bearer ${token}`);
    assert.equal(res.status, 200);

    users.setActive('operador@ecosuenos.org', false);
    res = await request(ctx.app).get('/api/inventario').set('Authorization', `Bearer ${token}`);
    assert.equal(res.status, 401);
    assert.equal(res.body.error.code, 'USER_INACTIVE');

    const loginRes = await request(ctx.app)
      .post('/api/auth/login')
      .send({ email: 'operador@ecosuenos.org', password: 'Operador2026x' });
    assert.equal(loginRes.status, 401);
    assert.equal(loginRes.body.error.code, 'INVALID_CREDENTIALS');
  });

  test('revocar sesiones invalida los tokens emitidos', async () => {
    const token = await ctx.login();
    users.revokeSessions(ADMIN_EMAIL);
    const res = await request(ctx.app).get('/api/inventario').set('Authorization', `Bearer ${token}`);
    assert.equal(res.status, 401);
    assert.equal(res.body.error.code, 'TOKEN_REVOKED');
    const fresh = await ctx.login();
    const ok = await request(ctx.app).get('/api/inventario').set('Authorization', `Bearer ${fresh}`);
    assert.equal(ok.status, 200);
  });
});

describe('Limitación de intentos de login', () => {
  let ctx;
  before(() => {
    ctx = createContext({ env: { LOGIN_RATE_LIMIT_MAX: '3' } });
  });
  after(() => ctx.close());

  test('tras superar el máximo de intentos fallidos responde 429', async () => {
    for (let i = 0; i < 3; i++) {
      const res = await request(ctx.app).post('/api/auth/login').send({ email: ADMIN_EMAIL, password: 'mala' });
      assert.equal(res.status, 401);
    }
    const blocked = await request(ctx.app).post('/api/auth/login').send({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
    assert.equal(blocked.status, 429);
    assert.equal(blocked.body.error.code, 'TOO_MANY_ATTEMPTS');
  });
});
