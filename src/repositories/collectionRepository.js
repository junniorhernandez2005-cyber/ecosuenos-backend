'use strict';

/**
 * Acceso a datos genérico para las colecciones CRUD.
 * Las sentencias se preparan una sola vez; los nombres de tabla/columna provienen
 * exclusivamente de la definición interna (nunca de la petición), y los valores
 * se envían como parámetros para evitar inyección SQL.
 */
const crypto = require('node:crypto');
const { nowIso } = require('../db/database');

function createCollectionRepository(db, collection) {
  const { table, fields } = collection;
  const columns = fields.map((f) => f.column);

  const selectList = ['id', ...columns, 'created_at', 'updated_at'].join(', ');

  const stmts = {
    list: db.prepare(`SELECT ${selectList} FROM ${table} ORDER BY created_at ASC, rowid ASC`),
    listPage: db.prepare(`SELECT ${selectList} FROM ${table} ORDER BY created_at ASC, rowid ASC LIMIT ? OFFSET ?`),
    count: db.prepare(`SELECT COUNT(*) AS total FROM ${table}`),
    get: db.prepare(`SELECT ${selectList} FROM ${table} WHERE id = ?`),
    insert: db.prepare(
      `INSERT INTO ${table} (id, ${columns.join(', ')}, created_at, updated_at)
       VALUES (@id, ${columns.map((c) => '@' + c).join(', ')}, @created_at, @updated_at)`
    ),
    update: db.prepare(
      `UPDATE ${table} SET ${columns.map((c) => `${c} = @${c}`).join(', ')}, updated_at = @updated_at WHERE id = @id`
    ),
    remove: db.prepare(`DELETE FROM ${table} WHERE id = ?`),
  };

  /** Fila SQLite -> objeto de la API (camelCase). */
  function toApi(row) {
    if (!row) return null;
    const record = { id: row.id };
    for (const f of fields) record[f.name] = row[f.column];
    record.createdAt = row.created_at;
    record.updatedAt = row.updated_at;
    return record;
  }

  /** Datos validados (camelCase) -> parámetros SQLite. */
  function toParams(data) {
    const params = {};
    for (const f of fields) params[f.column] = data[f.name];
    return params;
  }

  return {
    list({ limit, offset } = {}) {
      const rows = limit !== undefined ? stmts.listPage.all(limit, offset || 0) : stmts.list.all();
      return rows.map(toApi);
    },

    count() {
      return stmts.count.get().total;
    },

    findById(id) {
      return toApi(stmts.get.get(id));
    },

    create(data) {
      const ts = nowIso();
      const id = crypto.randomUUID();
      stmts.insert.run({ id, ...toParams(data), created_at: ts, updated_at: ts });
      return toApi(stmts.get.get(id));
    },

    /** Devuelve el registro actualizado o null si el ID no existe. */
    update(id, data) {
      const info = stmts.update.run({ id, ...toParams(data), updated_at: nowIso() });
      if (info.changes === 0) return null;
      return toApi(stmts.get.get(id));
    },

    /** Devuelve true si se eliminó, false si el ID no existía. */
    remove(id) {
      return stmts.remove.run(id).changes > 0;
    },
  };
}

module.exports = { createCollectionRepository };
