'use strict';

/**
 * Router CRUD genérico para cada colección (sección 9).
 *   GET    /api/<coleccion>        -> 200 objeto indexado por ID  { "<id>": { id, ... } }
 *   GET    /api/<coleccion>/:id    -> 200 registro
 *   POST   /api/<coleccion>        -> 201 registro creado
 *   PUT    /api/<coleccion>/:id    -> 200 registro actualizado (mismo ID)
 *   DELETE /api/<coleccion>/:id    -> 204 sin contenido
 *
 * GET admite paginación opcional (?limit=&offset=) según RNF-010; sin parámetros devuelve todo.
 * El total de registros se informa en la cabecera X-Total-Count.
 */
const express = require('express');
const { HttpError } = require('../utils/httpError');
const { validatePayload } = require('../validation/validators');

function parsePagination(query, maxPageSize) {
  const { limit, offset } = query;
  if (limit === undefined && offset === undefined) return {};
  const details = {};
  const lim = limit === undefined ? maxPageSize : Number(limit);
  const off = offset === undefined ? 0 : Number(offset);
  if (!Number.isInteger(lim) || lim < 1 || lim > maxPageSize) details.limit = `limit debe ser un entero entre 1 y ${maxPageSize}.`;
  if (!Number.isInteger(off) || off < 0) details.offset = 'offset debe ser un entero mayor o igual a 0.';
  if (Object.keys(details).length > 0) throw HttpError.validation(details);
  return { limit: lim, offset: off };
}

function createCollectionRouter({ collection, repository, config }) {
  const router = express.Router();
  const notFound = () => HttpError.notFound(`No existe el ${collection.label} solicitado.`, 'RECORD_NOT_FOUND');

  router.get('/', (req, res, next) => {
    try {
      const page = parsePagination(req.query, config.maxPageSize);
      const records = repository.list(page);
      const indexed = {};
      for (const record of records) indexed[record.id] = record;
      res.set('X-Total-Count', String(repository.count()));
      res.status(200).json(indexed);
    } catch (err) {
      next(err);
    }
  });

  router.get('/:id', (req, res, next) => {
    const record = repository.findById(req.params.id);
    if (!record) return next(notFound());
    return res.status(200).json(record);
  });

  router.post('/', (req, res, next) => {
    try {
      const data = validatePayload(collection.fields, req.body);
      const created = repository.create(data);
      res.location(`${req.baseUrl}/${created.id}`).status(201).json(created);
    } catch (err) {
      next(err);
    }
  });

  router.put('/:id', (req, res, next) => {
    try {
      const data = validatePayload(collection.fields, req.body);
      // El ID de la URL es el único que se usa; cualquier `id` del cuerpo se ignora.
      const updated = repository.update(req.params.id, data);
      if (!updated) throw notFound();
      res.status(200).json(updated);
    } catch (err) {
      next(err);
    }
  });

  router.delete('/:id', (req, res, next) => {
    // El servidor comprueba que el registro exista antes de eliminar (sección 10).
    const removed = repository.remove(req.params.id);
    if (!removed) return next(notFound());
    return res.status(204).end();
  });

  return router;
}

module.exports = { createCollectionRouter };
