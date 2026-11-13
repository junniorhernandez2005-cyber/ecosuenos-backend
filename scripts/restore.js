'use strict';

/**
 * RNF-011 — Restauración de una copia de seguridad SQLite.
 * Uso: npm run db:restore -- backups/ecosuenos-AAAAMMDD-HHMMSSmmm.sqlite --yes
 *
 * IMPORTANTE: detenga el servidor antes de restaurar.
 * Antes de sobrescribir, la base actual se guarda como backups/pre-restore-<fecha>.sqlite.
 */
const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');
const { loadMaintenanceConfig, BACKEND_ROOT } = require('../src/config');

function fail(msg) {
  console.error(`[restore] ${msg}`);
  process.exit(1);
}

function main() {
  const cfg = loadMaintenanceConfig();
  const args = process.argv.slice(2);
  const confirmed = args.includes('--yes');
  const source = args.find((a) => !a.startsWith('--'));

  if (!source) fail('Indique el archivo de respaldo. Ej.: npm run db:restore -- backups/ecosuenos-20261103-101500123.sqlite --yes');
  const sourcePath = path.isAbsolute(source) ? source : path.resolve(BACKEND_ROOT, source);
  if (!fs.existsSync(sourcePath)) fail(`No existe el archivo: ${sourcePath}`);

  if (/-(wal|shm)$/.test(sourcePath)) fail('Indique el archivo .sqlite del respaldo, no sus archivos -wal/-shm.');
  const check = new Database(sourcePath, { readonly: true, fileMustExist: true });
  const integrity = check.pragma('integrity_check', { simple: true });
  const tables = check
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('usuarios','inventario','ninos')")
    .all()
    .map((r) => r.name);
  check.close();
  if (integrity !== 'ok') fail(`El respaldo no superó integrity_check: ${integrity}`);
  if (tables.length < 3) fail('El archivo no parece un respaldo de Ecosueños (faltan tablas).');

  if (!confirmed) {
    fail(`Esto reemplazará ${cfg.dbFile}. Detenga el servidor y repita el comando agregando --yes.`);
  }

  fs.mkdirSync(cfg.backupDir, { recursive: true });
  if (fs.existsSync(cfg.dbFile)) {
    const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '').replace('T', '-');
    const safety = path.join(cfg.backupDir, `pre-restore-${stamp}.sqlite`);
    const current = new Database(cfg.dbFile);
    current.pragma('wal_checkpoint(TRUNCATE)');
    current.close();
    fs.copyFileSync(cfg.dbFile, safety);
    console.info(`[restore] Base actual guardada en: ${safety}`);
  }

  for (const suffix of ['-wal', '-shm']) {
    if (fs.existsSync(cfg.dbFile + suffix)) fs.unlinkSync(cfg.dbFile + suffix);
  }
  fs.mkdirSync(path.dirname(cfg.dbFile), { recursive: true });
  fs.copyFileSync(sourcePath, cfg.dbFile);
  console.info(`[restore] Restaurado ${sourcePath} -> ${cfg.dbFile}. Ya puede iniciar el servidor.`);
}

main();
