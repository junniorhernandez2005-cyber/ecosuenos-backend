'use strict';

/**
 * Error HTTP controlado. El manejador central lo convierte en una respuesta
 * JSON con formato consistente (RF-023):
 *   { "error": { "status": 400, "code": "VALIDATION_ERROR", "message": "...", "details": { campo: "mensaje" } } }
 */
class HttpError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.code = code;
    if (details !== undefined) this.details = details;
  }

  static badRequest(message, details) {
    return new HttpError(400, 'BAD_REQUEST', message, details);
  }

  static validation(details) {
    return new HttpError(400, 'VALIDATION_ERROR', 'Los datos enviados no son válidos.', details);
  }

  static unauthorized(message = 'No autorizado.', code = 'UNAUTHORIZED') {
    return new HttpError(401, code, message);
  }

  static forbidden(message = 'Acceso denegado.', code = 'FORBIDDEN') {
    return new HttpError(403, code, message);
  }

  static notFound(message = 'Recurso no encontrado.', code = 'NOT_FOUND') {
    return new HttpError(404, code, message);
  }
}

module.exports = { HttpError };
