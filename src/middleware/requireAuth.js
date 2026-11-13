'use strict';

/**
 * Middleware requireAuth (RF-006, RNF-003, sección 10).
 * - Exige `Authorization: Bearer <JWT>`.
 * - Verifica firma, algoritmo, emisor y vigencia del token.
 * - Verifica que el usuario exista, siga activo y que el token no haya sido revocado.
 */
const jwt = require('jsonwebtoken');
const { HttpError } = require('../utils/httpError');

function createRequireAuth({ config, users }) {
  return function requireAuth(req, res, next) {
    const header = req.get('authorization') || '';
    const match = /^Bearer\s+(\S+)$/i.exec(header);
    if (!match) {
      res.set('WWW-Authenticate', 'Bearer');
      return next(HttpError.unauthorized('Se requiere un token de acceso (Authorization: Bearer).', 'TOKEN_MISSING'));
    }

    let payload;
    try {
      payload = jwt.verify(match[1], config.jwt.secret, {
        algorithms: [config.jwt.algorithm],
        issuer: config.jwt.issuer,
      });
    } catch (err) {
      res.set('WWW-Authenticate', 'Bearer error="invalid_token"');
      if (err && err.name === 'TokenExpiredError') {
        return next(HttpError.unauthorized('La sesión ha expirado. Inicie sesión nuevamente.', 'TOKEN_EXPIRED'));
      }
      return next(HttpError.unauthorized('Token inválido.', 'TOKEN_INVALID'));
    }

    const userId = Number(payload.sub);
    const user = Number.isInteger(userId) ? users.findById(userId) : null;
    if (!user || user.activo !== 1) {
      return next(HttpError.unauthorized('El usuario no existe o está inactivo.', 'USER_INACTIVE'));
    }
    if (payload.tv !== user.token_version) {
      return next(HttpError.unauthorized('La sesión fue revocada. Inicie sesión nuevamente.', 'TOKEN_REVOKED'));
    }

    req.user = { id: user.id, email: user.email, role: user.role, nombre: user.nombre };
    req.tokenPayload = payload;
    return next();
  };
}

/**
 * Autorización por rol — preparada para la evolución RBAC (sección 4 y 16).
 * En esta versión NO se aplica a las rutas CRUD: cualquier usuario autenticado y activo puede operar.
 */
function requireRole(...roles) {
  return function roleGuard(req, res, next) {
    if (!req.user || !roles.includes(req.user.role)) {
      return next(HttpError.forbidden('No tiene permisos para esta operación.'));
    }
    return next();
  };
}

module.exports = { createRequireAuth, requireRole };
