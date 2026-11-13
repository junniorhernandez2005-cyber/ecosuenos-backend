'use strict';

/**
 * RNF-011 — Copia de seguridad en caliente de la base SQLite.
 * Uso: npm run db:backup
 * Puede ejecutarse con el servidor encendido (usa la API de backup en línea de SQLite).
 * Conserva las últimas BACKUP_KEEP copias (por defecto 14).
 */
const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');
const { loadMaintenanceConfig } = require('../src/config');

function timestamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  const ms = String(d.getMilliseconds()).padStart(3, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}${ms}`;
}

async function main() {
  const cfg = loadMaintenanceConfig();
  if (!fs.existsSync(cfg.dbFile)) {
    console.error(`[backup] No existe la base de datos: ${cfg.dbFile}`);
    process.exit(1);
  }
  fs.mkdirSync(cfg.backupDir, { recursive: true });
  const dest = path.join(cfg.backupDir, `ecosuenos-${timestamp()}.sqlite`);

  const db = new Database(cfg.dbFile, { readonly: true, fileMustExist: true });
  try {
    await db.backup(dest);
  } finally {
    db.close();
  }

  // La copia queda como un único archivo autocontenido (sin -wal/-shm) y se verifica su integridad.
  const check = new Database(dest);
  check.pragma('journal_mode = DELETE');
  const result = check.pragma('integrity_check', { simple: true });
  check.close();
  if (result !== 'ok') {
    console.error(`[backup] La copia ${dest} no superó integrity_check: ${result}`);
    process.exit(1);
  }

  // Rotación
  const backups = fs
    .readdirSync(cfg.backupDir)
    .filter((f) => /^ecosuenos-\d{8}-\d{6,9}\.sqlite$/.test(f))
    .sort();
  const excess = backups.slice(0, Math.max(0, backups.length - cfg.backupKeep));
  for (const f of excess) fs.unlinkSync(path.join(cfg.backupDir, f));

  console.info(`[backup] Copia creada y verificada: ${dest}`);
  if (excess.length) console.info(`[backup] Copias antiguas eliminadas: ${excess.length}`);
}

main().catch((err) => {
  console.error('[backup] Error:', err.message);
  process.exit(1);
});
