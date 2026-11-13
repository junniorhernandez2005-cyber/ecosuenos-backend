'use strict';

/**
 * Definición de las cinco colecciones (sección 7 del documento de requerimientos).
 * `name`   = nombre del campo en la API (camelCase, igual que el frontend).
 * `column` = columna en SQLite.
 */

function donacionFields(config) {
  return [
    { name: 'nombre', column: 'nombre', label: 'nombre', type: 'string', required: true, maxLength: 150 },
    { name: 'contacto', column: 'contacto', label: 'contacto', type: 'contacto', maxLength: 254 },
    { name: 'telefono', column: 'telefono', label: 'teléfono', type: 'phone', maxLength: 30 },
    { name: 'tipoDonacion', column: 'tipo_donacion', label: 'tipo de donación', type: 'string', required: true, maxLength: 80 },
    { name: 'descripcion', column: 'descripcion', label: 'descripción', type: 'string', maxLength: 1000 },
    { name: 'fecha', column: 'fecha', label: 'fecha', type: 'date', required: true },
    {
      name: 'estado',
      column: 'estado',
      label: 'estado',
      type: 'enum',
      required: true,
      values: config.estadosDonacion,
    },
  ];
}

function buildCollections(config) {
  return [
    {
      route: 'inventario',
      table: 'inventario',
      label: 'producto',
      fields: [
        { name: 'nombre', column: 'nombre', label: 'nombre', type: 'string', required: true, maxLength: 150 },
        { name: 'cantidad', column: 'cantidad', label: 'cantidad', type: 'integer', required: true, min: 0 },
      ],
    },
    {
      route: 'donaciones-externas',
      table: 'donaciones_externas',
      label: 'donación externa',
      fields: donacionFields(config),
    },
    {
      route: 'donaciones-internas',
      table: 'donaciones_internas',
      label: 'donación interna',
      fields: donacionFields(config),
    },
    {
      route: 'personal',
      table: 'personal',
      label: 'integrante del personal',
      fields: [
        { name: 'nombre', column: 'nombre', label: 'nombre', type: 'string', required: true, maxLength: 150 },
        { name: 'cargo', column: 'cargo', label: 'cargo', type: 'string', maxLength: 100 },
        { name: 'correo', column: 'correo', label: 'correo', type: 'email', maxLength: 254 },
        { name: 'telefono', column: 'telefono', label: 'teléfono', type: 'phone', maxLength: 30 },
      ],
    },
    {
      route: 'ninos',
      table: 'ninos',
      label: 'registro de niño',
      fields: [
        { name: 'nombre', column: 'nombre', label: 'nombre', type: 'string', required: true, maxLength: 150 },
        {
          name: 'edad',
          column: 'edad',
          label: 'edad',
          type: 'integer',
          required: true,
          min: config.ninoEdad.min,
          max: config.ninoEdad.max,
        },
        { name: 'curso', column: 'curso', label: 'curso', type: 'string', maxLength: 50 },
        { name: 'fechaIngreso', column: 'fecha_ingreso', label: 'fecha de ingreso', type: 'date' },
        // RNF-005: campo libre acotado; no debe usarse para datos sensibles.
        { name: 'observaciones', column: 'observaciones', label: 'observaciones', type: 'string', maxLength: 500 },
      ],
    },
  ];
}

module.exports = { buildCollections };
