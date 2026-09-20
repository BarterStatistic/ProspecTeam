// Pure helpers for client records: normalization, duplicate detection and
// blank-form factory. No database access here so these stay easy to reason about.

import { DEFAULT_STAGE } from './constants.js';

/** Lowercase, trim, collapse inner whitespace and strip accents. */
export function normalizeName(str = '') {
  return str
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

/** Keep digits only, so "(844) 123-4567" and "8441234567" compare equal. */
export function normalizePhone(str = '') {
  return String(str).replace(/\D/g, '');
}

/** "Nombre Apellidos", trimmed. */
export function fullName(client) {
  return `${client.firstName ?? ''} ${client.lastName ?? ''}`.trim();
}

/**
 * Look for an existing client that likely matches the given draft.
 * A match is reported when the phone numbers are identical (and non-empty) or
 * the normalized full names are identical. Returns { client, reason } or null.
 */
export function findDuplicate(clients, draft, excludeId = null) {
  const phone = normalizePhone(draft.phone);
  const name = normalizeName(`${draft.firstName} ${draft.lastName}`);

  for (const c of clients) {
    if (excludeId && c.id === excludeId) continue;
    const samePhone = phone && normalizePhone(c.phone) === phone;
    const sameName = name && normalizeName(fullName(c)) === name;
    if (samePhone && sameName) return { client: c, reason: 'nombre y teléfono' };
    if (samePhone) return { client: c, reason: 'teléfono' };
    if (sameName) return { client: c, reason: 'nombre' };
  }
  return null;
}

/** Blank form values for a new client in a given section. */
export function emptyClient(section = 'prospectos') {
  return {
    firstName: '',
    lastName: '',
    phone: '',
    saleType: '',
    creditScheme: '',
    motorcycles: '',
    prospectTeamSeller: '',
    // Username of the promotor following up this proceso. Only meaningful in
    // the Procesos board; empty means "Sin promotor".
    promotorEncargado: '',
    notes: '',
    buroAutorizado: false,
    // Marca de facturación (columna "Moto Facturada") y la comisión que generó.
    fechaFacturacion: null,
    comisionId: null,
    section,
    stage: DEFAULT_STAGE[section] ?? '',
  };
}
