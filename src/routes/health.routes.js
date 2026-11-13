'use strict';

/** RNF-007: GET /api/health — estado del servicio y de la base de datos. */
const express = require('express');

function createHealthRouter({ db }) {
  const router = express.Router();
  const ping = db.prepare('SELECT 1 AS ok');

  router.get('/', (req, res) => {
    let database = 'ok';
    try {
      ping.get();
    } catch {
      database = 'error';
    }
    const healthy = database === 'ok';
    res.status(healthy ? 200 : 503).json({
      status: healthy ? 'ok' : 'error',
      service: 'ecosuenos-api',
      database,
      uptimeSeconds: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    });
  });

  return router;
}

module.exports = { createHealthRouter };
