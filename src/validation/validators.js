'use strict';

/**
 * Validación en servidor (RF-021, RNF-006).
 * Cada colección declara sus campos; `validatePayload` devuelve los datos
 * normalizados o lanza un HttpError 400 con el detalle por campo.
 */
const { HttpError } = require('../utils/httpError');

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const ISO_DATE_REGEX = /^(\d{4})-(\d{2})-(\d{2})$/;
const INTEGER_STRING_REGEX = /^[+-]?\d+$/;

function isValidEmail(value) {
  return typeof value === 'string' && value.length <= 254 && EMAIL_REGEX.test(value);
}

function isValidIsoDate(value) {
  if (typeof value !== 'string') return false;
  const match = ISO_DATE_REGEX.exec(value);
  if (!match) return false;
  const [, y, m, d] = match.map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

function isEmpty(value) {
  return value === undefined || value === null || (typeof value === 'string' && value.trim() === '');
}

/** Valida un campo. Devuelve { value } o { error }. */
function validateField(spec, raw) {
  const label = spec.label || spec.name;

  if (isEmpty(raw)) {
    if (spec.required) return { error: `El campo ${label} es obligatorio.` };
    return { value: spec.type === 'integer' ? null : '' };
  }

  switch (spec.type) {
    case 'string':
    case 'email':
    case 'contacto':
    case 'date':
    case 'enum': {
      if (typeof raw !== 'string') return { error: `El campo ${label} debe ser texto.` };
      const value = raw.trim();
      if (spec.maxLength && value.length > spec.maxLength) {
        return { error: `El campo ${label} admite máximo ${spec.maxLength} caracteres.` };
      }
      if (spec.type === 'email' && !isValidEmail(value)) {
        return { error: `El campo ${label} no tiene un formato de correo válido.` };
      }
      // El contacto puede ser correo u otro medio; si parece correo, se valida su formato.
      if (spec.type === 'contacto' && value.includes('@') && !isValidEmail(value)) {
        return { error: `El campo ${label} parece un correo pero su formato no es válido.` };
      }
      if (spec.type === 'date' && !isValidIsoDate(value)) {
        return { error: `El campo ${label} debe ser una fecha válida con formato YYYY-MM-DD.` };
      }
      if (spec.type === 'enum') {
        const allowed = typeof spec.values === 'function' ? spec.values() : spec.values;
        const normalized = value.toUpperCase();
        if (!allowed.includes(normalized)) {
          return { error: `El campo ${label} debe ser uno de: ${allowed.join(', ')}.` };
        }
        return { value: normalized };
      }
      return { value };
    }

    case 'phone': {
      // Se almacena siempre como texto para conservar prefijos y ceros a la izquierda.
      if (typeof raw !== 'string' && typeof raw !== 'number') {
        return { error: `El campo ${label} debe ser texto.` };
      }
      const value = String(raw).trim();
      if (value.length > (spec.maxLength || 30)) {
        return { error: `El campo ${label} admite máximo ${spec.maxLength || 30} caracteres.` };
      }
      if (!/^[0-9+()\-.\s#]*(ext\.?\s*\d+)?$/i.test(value)) {
        return { error: `El campo ${label} solo admite números, espacios y los símbolos + ( ) - . #` };
      }
      return { value };
    }

    case 'integer': {
      let num;
      if (typeof raw === 'number') {
        num = raw;
      } else if (typeof raw === 'string' && INTEGER_STRING_REGEX.test(raw.trim())) {
        num = Number(raw.trim());
      } else {
        return { error: `El campo ${label} debe ser un número entero.` };
      }
      if (!Number.isFinite(num) || !Number.isInteger(num) || !Number.isSafeInteger(num)) {
        return { error: `El campo ${label} debe ser un número entero.` };
      }
      const min = typeof spec.min === 'function' ? spec.min() : spec.min;
      const max = typeof spec.max === 'function' ? spec.max() : spec.max;
      if (min !== undefined && max !== undefined && (num < min || num > max)) {
        return { error: `El campo ${label} debe estar entre ${min} y ${max}.` };
      }
      if (min !== undefined && num < min) return { error: `El campo ${label} debe ser mayor o igual a ${min}.` };
      if (max !== undefined && num > max) return { error: `El campo ${label} debe ser menor o igual a ${max}.` };
      return { value: num };
    }

    default:
      throw new Error(`Tipo de campo no soportado: ${spec.type}`);
  }
}

/**
 * Valida el cuerpo completo de una petición contra la definición de campos.
 * - Ignora campos desconocidos y el `id` enviado por el cliente (el ID lo genera el backend).
 * - Lanza HttpError 400 con `details` por campo si algo no es válido.
 */
function validatePayload(fields, body) {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    throw HttpError.badRequest('El cuerpo de la petición debe ser un objeto JSON.');
  }
  const data = {};
  const details = {};
  for (const spec of fields) {
    const result = validateField(spec, body[spec.name]);
    if (result.error) details[spec.name] = result.error;
    else data[spec.name] = result.value;
  }
  if (Object.keys(details).length > 0) throw HttpError.validation(details);
  return data;
}

module.exports = { validatePayload, validateField, isValidEmail, isValidIsoDate };
