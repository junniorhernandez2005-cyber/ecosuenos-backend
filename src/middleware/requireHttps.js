'use strict';

/**
 * RNF-004: en producción el servicio debe ejecutarse sobre HTTPS.
 * Si REQUIRE_HTTPS=true (por defecto en producción) se rechazan las peticiones HTTP planas.
 * Detrás de un proxy/balanceador que termina TLS, configure TRUST_PROXY=true para que
 * Express lea X-Forwarded-Proto.
 */
const { HttpError } = require('../utils/httpError');

function createRequireHttps({ config }) {
  return function requireHttps(req, res, next) {
    if (!config.requireHttps || req.secure) return next();
    // El chequeo de salud se mantiene disponible para sondas internas del orquestador.
    if (req.path === '/api/health') return next();
    return next(HttpError.forbidden('Este servicio solo acepta conexiones HTTPS.', 'HTTPS_REQUIRED'));
  };
}

module.exports = { createRequireHttps };
