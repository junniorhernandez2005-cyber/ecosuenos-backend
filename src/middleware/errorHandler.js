'use strict';

/**
 * Manejo uniforme de errores (RF-023, sección 9.2).
 * Formato: { "error": { "status", "code", "message", "details"? } }
 */
const { HttpError } = require('../utils/httpError');

function notFoundHandler(req, res, next) {
  next(HttpError.notFound(`Endpoint no encontrado: ${req.method} ${req.originalUrl.split('?')[0]}`, 'ENDPOINT_NOT_FOUND'));
}

function createErrorHandler({ logger = console } = {}) {
  // eslint-disable-next-line no-unused-vars
  return function errorHandler(err, req, res, next) {
    let httpError;

    if (err instanceof HttpError) {
      httpError = err;
    } else if (err && err.type === 'entity.parse.failed') {
      httpError = new HttpError(400, 'INVALID_JSON', 'El cuerpo de la petición no es un JSON válido.');
    } else if (err && err.type === 'entity.too.large') {
      httpError = new HttpError(413, 'PAYLOAD_TOO_LARGE', 'El cuerpo de la petición excede el tamaño permitido.');
    } else if (err && typeof err.code === 'string' && err.code.startsWith('SQLITE_CONSTRAINT')) {
      // Defensa en profundidad: las restricciones CHECK de SQLite actúan si algo evadiera la validación.
      httpError = new HttpError(400, 'CONSTRAINT_VIOLATION', 'Los datos no cumplen las restricciones de negocio.');
    } else {
      logger.error('[error] Error no controlado:', err);
      httpError = new HttpError(500, 'INTERNAL_ERROR', 'Error interno del servidor.');
    }

    const body = { status: httpError.status, code: httpError.code, message: httpError.message };
    if (httpError.details !== undefined) body.details = httpError.details;
    res.status(httpError.status).json({ error: body });
  };
}

module.exports = { notFoundHandler, createErrorHandler };
