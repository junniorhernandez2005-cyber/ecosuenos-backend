'use strict';

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { createContext, request, SAMPLES } = require('./helpers');

describe('Reglas de negocio y validación', () => {
  let ctx;
  let h;
  before(async () => {
    ctx = createContext();
    h = { Authorization: `Bearer ${await ctx.login()}` };
  });
  after(() => ctx.close());

  const post = (name, body) => request(ctx.app).post(`/api/${name}`).set(h).send(body);

  describe('Inventario (RF-012, CA-06)', () => {
    for (const cantidad of [-1, 2.5, '3.7', 'diez', '', null, true, [], {}, 1e20]) {
      test(`rechaza cantidad ${JSON.stringify(cantidad)}`, async () => {
        const res = await post('inventario', { nombre: 'Leche', cantidad });
        assert.equal(res.status, 400);
        assert.ok(res.body.error.details.cantidad);
      });
    }
    for (const [cantidad, esperado] of [[0, 0], [15, 15], ['7', 7]]) {
      test(`acepta cantidad ${JSON.stringify(cantidad)}`, async () => {
        const res = await post('inventario', { nombre: 'Leche', cantidad });
        assert.equal(res.status, 201);
        assert.equal(res.body.cantidad, esperado);
      });
    }
    test('rechaza nombre vacío o solo espacios', async () => {
      const res = await post('inventario', { nombre: '   ', cantidad: 1 });
      assert.equal(res.status, 400);
      assert.ok(res.body.error.details.nombre);
    });
    test('recorta espacios del nombre', async () => {
      const res = await post('inventario', { nombre: '  Panela  ', cantidad: 1 });
      assert.equal(res.body.nombre, 'Panela');
    });
    test('también valida en PUT', async () => {
      const created = await post('inventario', { nombre: 'Azúcar', cantidad: 1 });
      const res = await request(ctx.app).put(`/api/inventario/${created.body.id}`).set(h).send({ nombre: 'Azúcar', cantidad: -5 });
      assert.equal(res.status, 400);
    });
  });

  describe('Donaciones (RF-013, RF-016, sección 10)', () => {
    for (const name of ['donaciones-externas', 'donaciones-internas']) {
      test(`${name}: exige nombre, tipo, fecha y estado`, async () => {
        const res = await post(name, { contacto: 'x' });
        assert.equal(res.status, 400);
        assert.deepEqual(Object.keys(res.body.error.details).sort(), ['estado', 'fecha', 'nombre', 'tipoDonacion']);
      });

      test(`${name}: estado fuera del catálogo es rechazado`, async () => {
        const res = await post(name, { ...SAMPLES[name], estado: 'CANCELADO' });
        assert.equal(res.status, 400);
        assert.match(res.body.error.details.estado, /PENDIENTE, APROBADO, ENTREGADO, PROGRAMADO/);
      });

      test(`${name}: acepta cada estado del catálogo y lo normaliza a mayúsculas`, async () => {
        for (const estado of ['pendiente', 'APROBADO', 'Entregado', 'PROGRAMADO']) {
          const res = await post(name, { ...SAMPLES[name], estado });
          assert.equal(res.status, 201, estado);
          assert.equal(res.body.estado, estado.toUpperCase());
        }
      });

      test(`${name}: fecha debe ser ISO YYYY-MM-DD válida`, async () => {
        for (const fecha of ['03/11/2026', '2026-13-01', '2026-02-30', '2026-1-5', 20261103]) {
          const res = await post(name, { ...SAMPLES[name], fecha });
          assert.equal(res.status, 400, String(fecha));
          assert.ok(res.body.error.details.fecha);
        }
      });

      test(`${name}: CA-13 contacto con formato de correo inválido es rechazado`, async () => {
        const res = await post(name, { ...SAMPLES[name], contacto: 'donante@correo' });
        assert.equal(res.status, 400);
        assert.ok(res.body.error.details.contacto);
      });

      test(`${name}: contacto que no es correo (ej. "WhatsApp") se acepta`, async () => {
        const res = await post(name, { ...SAMPLES[name], contacto: 'WhatsApp coordinación' });
        assert.equal(res.status, 201);
      });

      test(`${name}: teléfono es opcional`, async () => {
        const { telefono, ...sinTelefono } = SAMPLES[name];
        const res = await post(name, sinTelefono);
        assert.equal(res.status, 201);
        assert.equal(res.body.telefono, '');
      });
    }
  });

  describe('Personal (RF-017, CA-13)', () => {
    test('correo mal formado es rechazado cuando se proporciona', async () => {
      for (const correo of ['ana', 'ana@', 'ana@dominio', 'ana @x.co']) {
        const res = await post('personal', { ...SAMPLES.personal, correo });
        assert.equal(res.status, 400, correo);
        assert.ok(res.body.error.details.correo);
      }
    });
    test('correo vacío es aceptado (opcional)', async () => {
      const res = await post('personal', { ...SAMPLES.personal, correo: '' });
      assert.equal(res.status, 201);
    });
    test('el teléfono se conserva como texto con prefijos y ceros', async () => {
      const res = await post('personal', { ...SAMPLES.personal, telefono: '0057 310 000 0000' });
      assert.equal(res.status, 201);
      assert.equal(res.body.telefono, '0057 310 000 0000');
      assert.equal(typeof res.body.telefono, 'string');
    });
    test('teléfono con letras es rechazado', async () => {
      const res = await post('personal', { ...SAMPLES.personal, telefono: 'llamar luego' });
      assert.equal(res.status, 400);
    });
  });

  describe('Niños (RF-019, CA-14)', () => {
    for (const edad of [-1, 19, 7.5, 'nueve', null]) {
      test(`rechaza edad ${JSON.stringify(edad)}`, async () => {
        const res = await post('ninos', { ...SAMPLES.ninos, edad });
        assert.equal(res.status, 400);
        assert.ok(res.body.error.details.edad);
      });
    }
    for (const edad of [0, 18]) {
      test(`acepta edad límite ${edad}`, async () => {
        const res = await post('ninos', { ...SAMPLES.ninos, edad });
        assert.equal(res.status, 201);
      });
    }
    test('fechaIngreso inválida es rechazada', async () => {
      const res = await post('ninos', { ...SAMPLES.ninos, fechaIngreso: '2026-02-31' });
      assert.equal(res.status, 400);
    });
    test('observaciones tienen longitud máxima (RNF-005)', async () => {
      const res = await post('ninos', { ...SAMPLES.ninos, observaciones: 'x'.repeat(501) });
      assert.equal(res.status, 400);
      assert.ok(res.body.error.details.observaciones);
    });
  });
});

describe('Rango de edad configurable (CA-14)', () => {
  test('NINO_EDAD_MAX=12 rechaza 13', async () => {
    const ctx = createContext({ env: { NINO_EDAD_MAX: '12' } });
    const h = { Authorization: `Bearer ${await ctx.login()}` };
    const res = await request(ctx.app).post('/api/ninos').set(h).send({ ...SAMPLES.ninos, edad: 13 });
    assert.equal(res.status, 400);
    assert.match(res.body.error.details.edad, /entre 0 y 12/);
    ctx.close();
  });
});

describe('Catálogo de estados configurable (RF-016)', () => {
  test('DONACION_ESTADOS personalizado', async () => {
    const ctx = createContext({ env: { DONACION_ESTADOS: 'PENDIENTE,RECIBIDO' } });
    const h = { Authorization: `Bearer ${await ctx.login()}` };
    const ok = await request(ctx.app).post('/api/donaciones-externas').set(h).send({ ...SAMPLES['donaciones-externas'], estado: 'recibido' });
    assert.equal(ok.status, 201);
    const bad = await request(ctx.app).post('/api/donaciones-externas').set(h).send({ ...SAMPLES['donaciones-externas'], estado: 'APROBADO' });
    assert.equal(bad.status, 400);
    ctx.close();
  });
});
