'use strict';

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { createContext, request, SAMPLES } = require('./helpers');

const COLLECTIONS = Object.keys(SAMPLES);

describe('CRUD de las cinco colecciones', () => {
  let ctx;
  let token;
  const auth = () => ({ Authorization: `Bearer ${token}` });

  before(async () => {
    ctx = createContext();
    token = await ctx.login();
  });
  after(() => ctx.close());

  for (const name of COLLECTIONS) {
    describe(`/api/${name}`, () => {
      test('CA-03 / RF-006: sin token GET, POST, PUT y DELETE responden 401', async () => {
        const responses = await Promise.all([
          request(ctx.app).get(`/api/${name}`),
          request(ctx.app).post(`/api/${name}`).send(SAMPLES[name]),
          request(ctx.app).put(`/api/${name}/x`).send(SAMPLES[name]),
          request(ctx.app).delete(`/api/${name}/x`),
        ]);
        for (const res of responses) assert.equal(res.status, 401);
      });

      test('CA-04 / CA-05: con token se crea un registro (201) y aparece al volver a consultar', async () => {
        const created = await request(ctx.app).post(`/api/${name}`).set(auth()).send(SAMPLES[name]);
        assert.equal(created.status, 201);
        assert.match(created.body.id, /^[0-9a-f-]{36}$/);
        assert.equal(created.headers.location, `/api/${name}/${created.body.id}`);

        const list = await request(ctx.app).get(`/api/${name}`).set(auth());
        assert.equal(list.status, 200);
        assert.equal(typeof list.body, 'object');
        assert.ok(!Array.isArray(list.body), 'la colección se devuelve como objeto indexado por ID');
        assert.ok(list.body[created.body.id], 'el registro creado aparece en el listado');
        assert.equal(list.body[created.body.id].nombre, SAMPLES[name].nombre);
        assert.equal(list.headers['x-total-count'], String(Object.keys(list.body).length));

        const one = await request(ctx.app).get(`/api/${name}/${created.body.id}`).set(auth());
        assert.equal(one.status, 200);
        assert.equal(one.body.id, created.body.id);
      });

      test('CA-07: editar conserva el mismo ID y no duplica; el ID del cuerpo se ignora', async () => {
        const created = await request(ctx.app).post(`/api/${name}`).set(auth()).send(SAMPLES[name]);
        const before = await request(ctx.app).get(`/api/${name}`).set(auth());
        const countBefore = Object.keys(before.body).length;

        const changes = { ...SAMPLES[name], nombre: 'Nombre editado', id: 'id-forzado-por-cliente' };
        const updated = await request(ctx.app).put(`/api/${name}/${created.body.id}`).set(auth()).send(changes);
        assert.equal(updated.status, 200);
        assert.equal(updated.body.id, created.body.id);
        assert.equal(updated.body.nombre, 'Nombre editado');

        const afterList = await request(ctx.app).get(`/api/${name}`).set(auth());
        assert.equal(Object.keys(afterList.body).length, countBefore, 'no se duplica el registro');
        assert.equal(afterList.body[created.body.id].nombre, 'Nombre editado');
        assert.equal(afterList.body['id-forzado-por-cliente'], undefined);
      });

      test('CA-08: eliminar un ID existente devuelve 204 y deja de aparecer; repetir -> 404', async () => {
        const created = await request(ctx.app).post(`/api/${name}`).set(auth()).send(SAMPLES[name]);
        const del = await request(ctx.app).delete(`/api/${name}/${created.body.id}`).set(auth());
        assert.equal(del.status, 204);
        assert.equal(del.text, '');

        const list = await request(ctx.app).get(`/api/${name}`).set(auth());
        assert.equal(list.body[created.body.id], undefined);

        const again = await request(ctx.app).delete(`/api/${name}/${created.body.id}`).set(auth());
        assert.equal(again.status, 404);
        assert.equal(again.body.error.code, 'RECORD_NOT_FOUND');
      });

      test('PUT y GET sobre un ID inexistente -> 404', async () => {
        const put = await request(ctx.app).put(`/api/${name}/no-existe`).set(auth()).send(SAMPLES[name]);
        assert.equal(put.status, 404);
        const get = await request(ctx.app).get(`/api/${name}/no-existe`).set(auth());
        assert.equal(get.status, 404);
      });

      test('RF-021: cuerpo vacío -> 400 con detalle de campos obligatorios', async () => {
        const res = await request(ctx.app).post(`/api/${name}`).set(auth()).send({});
        assert.equal(res.status, 400);
        assert.equal(res.body.error.code, 'VALIDATION_ERROR');
        assert.ok(res.body.error.details.nombre);
      });
    });
  }

  test('los campos desconocidos no se persisten', async () => {
    const res = await request(ctx.app)
      .post('/api/inventario')
      .set(auth())
      .send({ nombre: 'Frijol', cantidad: 3, admin: true, createdAt: '1999-01-01' });
    assert.equal(res.status, 201);
    assert.equal(res.body.admin, undefined);
    assert.notEqual(res.body.createdAt, '1999-01-01');
  });

  test('RF-023: JSON mal formado -> 400 INVALID_JSON', async () => {
    const res = await request(ctx.app)
      .post('/api/inventario')
      .set(auth())
      .set('Content-Type', 'application/json')
      .send('{"nombre": "x", ');
    assert.equal(res.status, 400);
    assert.equal(res.body.error.code, 'INVALID_JSON');
  });

  test('RF-023: colección o endpoint inexistente -> 404', async () => {
    const res = await request(ctx.app).get('/api/no-existe').set(auth());
    assert.equal(res.status, 404);
    assert.equal(res.body.error.code, 'ENDPOINT_NOT_FOUND');
  });

  test('RNF-010: paginación opcional con limit/offset', async () => {
    const fresh = createContext();
    const t = await fresh.login();
    for (let i = 0; i < 5; i++) {
      await request(fresh.app).post('/api/inventario').set('Authorization', `Bearer ${t}`).send({ nombre: `P${i}`, cantidad: i });
    }
    const page = await request(fresh.app).get('/api/inventario?limit=2&offset=2').set('Authorization', `Bearer ${t}`);
    assert.equal(page.status, 200);
    assert.deepEqual(Object.values(page.body).map((r) => r.nombre), ['P2', 'P3']);
    assert.equal(page.headers['x-total-count'], '5');

    const bad = await request(fresh.app).get('/api/inventario?limit=0').set('Authorization', `Bearer ${t}`);
    assert.equal(bad.status, 400);
    fresh.close();
  });

  test('RF-007 / CA-10: los conteos del dashboard reflejan los registros actuales', async () => {
    const fresh = createContext();
    const t = await fresh.login();
    const h = { Authorization: `Bearer ${t}` };
    await request(fresh.app).post('/api/inventario').set(h).send(SAMPLES.inventario);
    await request(fresh.app).post('/api/inventario').set(h).send(SAMPLES.inventario);
    await request(fresh.app).post('/api/donaciones-externas').set(h).send(SAMPLES['donaciones-externas']);
    const counts = {};
    for (const name of ['inventario', 'donaciones-externas', 'donaciones-internas']) {
      const res = await request(fresh.app).get(`/api/${name}`).set(h);
      counts[name] = Object.keys(res.body).length;
    }
    assert.deepEqual(counts, { inventario: 2, 'donaciones-externas': 1, 'donaciones-internas': 0 });
    fresh.close();
  });
});

describe('Salud y cabeceras de seguridad', () => {
  let ctx;
  before(() => {
    ctx = createContext();
  });
  after(() => ctx.close());

  test('RNF-007: GET /api/health es público y reporta la base de datos', async () => {
    const res = await request(ctx.app).get('/api/health');
    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'ok');
    assert.equal(res.body.database, 'ok');
  });

  test('Helmet, no-store y CORS para el origen configurado', async () => {
    const res = await request(ctx.app).get('/api/health').set('Origin', 'http://localhost:4200');
    assert.equal(res.headers['x-content-type-options'], 'nosniff');
    assert.equal(res.headers['cache-control'], 'no-store');
    assert.equal(res.headers['access-control-allow-origin'], 'http://localhost:4200');
    assert.equal(res.headers['x-powered-by'], undefined);

    const other = await request(ctx.app).get('/api/health').set('Origin', 'https://malicioso.example');
    assert.equal(other.headers['access-control-allow-origin'], undefined);
  });

  test('preflight CORS permite Authorization', async () => {
    const res = await request(ctx.app)
      .options('/api/inventario')
      .set('Origin', 'http://localhost:4200')
      .set('Access-Control-Request-Method', 'PUT')
      .set('Access-Control-Request-Headers', 'authorization,content-type');
    assert.equal(res.status, 204);
    assert.match(res.headers['access-control-allow-headers'], /Authorization/i);
  });
});
