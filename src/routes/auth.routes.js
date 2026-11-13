'use strict';

/**
 * Autenticación (RF-001, RF-002, RF-003).
 *   POST /api/auth/login  -> { token, user, expiresAt }
 *   GET  /api/auth/me     -> { user }
 */
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { rateLimit } = require('express-rate-limit');
const { HttpError } = require('../utils/httpError');
const { publicUser } = require('../repositories/userRepository');

const INVALID_CREDENTIALS_MESSAGE = 'Credenciales inválidas.';

function createAuthRouter({ config, users, requireAuth }) {
  const router = express.Router();

  // Hash ficticio para que el tiempo de respuesta sea similar exista o no el correo (RF-002).
  const dummyHash = bcrypt.hashSync('ecosuenos-dummy-password', config.bcryptRounds);

  // Limitación de intentos de login (sección 11 y 17). Solo cuentan los intentos fallidos.
  const loginLimiter = rateLimit({
    windowMs: config.loginRateLimit.windowMinutes * 60 * 1000,
    limit: config.loginRateLimit.max,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    skipSuccessfulRequests: true,
    handler: (req, res, next) =>
      next(
        new HttpError(
          429,
          'TOO_MANY_ATTEMPTS',
          `Demasiados intentos de inicio de sesión. Intente de nuevo en ${config.loginRateLimit.windowMinutes} minutos.`
        )
      ),
  });

  router.post('/login', loginLimiter, async (req, res, next) => {
    try {
      const body = req.body && typeof req.body === 'object' ? req.body : {};
      const { email, password } = body;

      const details = {};
      if (typeof email !== 'string' || email.trim() === '') details.email = 'El correo es obligatorio.';
      if (typeof password !== 'string' || password === '') details.password = 'La contraseña es obligatoria.';
      if (Object.keys(details).length > 0) throw HttpError.validation(details);

      const user = users.findByEmail(email);
      const passwordOk = await bcrypt.compare(password, user ? user.password_hash : dummyHash);

      // Mismo mensaje para correo inexistente, contraseña incorrecta o usuario inactivo (RF-002).
      if (!user || !passwordOk || user.activo !== 1) {
        throw HttpError.unauthorized(INVALID_CREDENTIALS_MESSAGE, 'INVALID_CREDENTIALS');
      }

      const token = jwt.sign(
        { sub: String(user.id), email: user.email, role: user.role, tv: user.token_version },
        config.jwt.secret,
        { algorithm: config.jwt.algorithm, expiresIn: config.jwt.expiresIn, issuer: config.jwt.issuer }
      );
      const { exp } = jwt.decode(token);
      users.registerLogin(user.id);

      res.status(200).json({
        token,
        user: publicUser(user),
        expiresAt: new Date(exp * 1000).toISOString(),
      });
    } catch (err) {
      next(err);
    }
  });

  router.get('/me', requireAuth, (req, res) => {
    res.json({
      user: { id: req.user.id, email: req.user.email, nombre: req.user.nombre, role: req.user.role },
      expiresAt: new Date(req.tokenPayload.exp * 1000).toISOString(),
    });
  });

  return router;
}

module.exports = { createAuthRouter };
