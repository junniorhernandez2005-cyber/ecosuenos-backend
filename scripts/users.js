'use strict';

/**
 * Administración de usuarios por consola (la administración visual no está incluida en esta versión).
 *
 *   npm run user -- list
 *   npm run user -- create <correo> [--nombre "Nombre"] [--role ADMIN|OPERADOR|CONSULTA]
 *   npm run user -- reset-password <correo>
 *   npm run user -- deactivate <correo>      (invalida sus tokens de inmediato)
 *   npm run user -- activate <correo>
 *   npm run user -- revoke-sessions <correo> (cierra todas sus sesiones activas)
 *
 * La contraseña se solicita por consola o se toma de la variable USER_PASSWORD.
 * Nota: los roles OPERADOR/CONSULTA se almacenan, pero la autorización granular por rol
 * es un requerimiento de evolución y no se aplica todavía en los endpoints.
 */
const readline = require('node:readline');
const { loadMaintenanceConfig, passwordPolicyErrors } = require('../src/config');
const { openDatabase } = require('../src/db/database');
const { createUserRepository } = require('../src/repositories/userRepository');
const { isValidEmail } = require('../src/validation/validators');

const ROLES = ['ADMIN', 'OPERADOR', 'CONSULTA'];

function fail(msg) {
  console.error(`[user] ${msg}`);
  process.exit(1);
}

function getFlag(args, name) {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
}

function askHidden(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl.stdoutMuted = false;
    rl._writeToOutput = function write(str) {
      if (rl.stdoutMuted && str !== '\r\n' && str !== '\n') rl.output.write('*');
      else rl.output.write(str);
    };
    rl.question(question, (answer) => {
      rl.close();
      process.stdout.write('\n');
      resolve(answer);
    });
    rl.stdoutMuted = true;
  });
}

async function readPassword() {
  let password = process.env.USER_PASSWORD;
  if (!password) {
    if (!process.stdin.isTTY) fail('Defina USER_PASSWORD o ejecute el comando en una terminal interactiva.');
    password = await askHidden('Contraseña: ');
    const confirm = await askHidden('Confirmar contraseña: ');
    if (password !== confirm) fail('Las contraseñas no coinciden.');
  }
  const errors = passwordPolicyErrors(password);
  if (errors.length) fail(`La contraseña debe contener: ${errors.join(', ')}.`);
  return password;
}

async function main() {
  const [command, emailArg, ...rest] = process.argv.slice(2);
  const cfg = loadMaintenanceConfig();
  const db = openDatabase(cfg.dbFile);
  const users = createUserRepository(db);
  const email = (emailArg || '').trim().toLowerCase();
  const requireEmail = () => {
    if (!isValidEmail(email)) fail('Indique un correo válido.');
  };
  const requireExisting = () => {
    requireEmail();
    if (!users.findByEmail(email)) fail(`No existe el usuario ${email}.`);
  };

  switch (command) {
    case 'list': {
      const rows = users.list().map((u) => ({
        id: u.id,
        email: u.email,
        nombre: u.nombre,
        rol: u.role,
        activo: u.activo === 1 ? 'sí' : 'no',
        ultimoIngreso: u.last_login_at || '-',
      }));
      console.table(rows);
      break;
    }
    case 'create': {
      requireEmail();
      if (users.findByEmail(email)) fail(`Ya existe el usuario ${email}.`);
      const role = (getFlag(rest, 'role') || 'ADMIN').toUpperCase();
      if (!ROLES.includes(role)) fail(`Rol inválido. Use: ${ROLES.join(', ')}.`);
      const nombre = getFlag(rest, 'nombre') || '';
      const password = await readPassword();
      const id = users.create({ email, nombre, password, role }, cfg.bcryptRounds);
      console.info(`[user] Usuario creado (id ${id}): ${email} [${role}]`);
      break;
    }
    case 'reset-password': {
      requireExisting();
      const password = await readPassword();
      users.setPassword(email, password, cfg.bcryptRounds);
      console.info(`[user] Contraseña actualizada y sesiones revocadas: ${email}`);
      break;
    }
    case 'deactivate':
      requireExisting();
      users.setActive(email, false);
      console.info(`[user] Usuario desactivado; sus tokens dejan de ser válidos: ${email}`);
      break;
    case 'activate':
      requireExisting();
      users.setActive(email, true);
      console.info(`[user] Usuario activado: ${email}`);
      break;
    case 'revoke-sessions':
      requireExisting();
      users.revokeSessions(email);
      console.info(`[user] Todas las sesiones de ${email} fueron revocadas.`);
      break;
    default:
      console.info(
        'Comandos: list | create <correo> [--nombre N] [--role R] | reset-password <correo> | deactivate <correo> | activate <correo> | revoke-sessions <correo>'
      );
      process.exitCode = command ? 1 : 0;
  }
  db.close();
}

main().catch((err) => fail(err.message));
