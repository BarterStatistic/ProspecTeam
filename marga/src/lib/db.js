// IndexedDB persistence via Dexie. Single `clients` table; section + stage
// position a card, `order` sorts it within a column. All writes bump the record
// where appropriate and every high-level action funnels through here so the
// auto-transition rules live in exactly one place.

import Dexie from 'dexie';
import { AUTO_TRANSITIONS } from './constants.js';

export const db = new Dexie('marga');

// Note: stage is stored as '' (never null) for list sections so it stays a
// valid, indexable string. Indexes chosen for the live queries we run.
db.version(1).stores({
  clients: 'id, section, phone, updatedAt',
});

const now = () => Date.now();
const uuid = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;

/** Resolve an auto-transition. Returns the effective { section, stage }. */
export function resolveTransition(section, stage) {
  return AUTO_TRANSITIONS[`${section}:${stage}`] ?? { section, stage };
}

/** Next free order value at the end of a column. */
async function nextOrder(section, stage) {
  const items = await db.clients
    .where('section')
    .equals(section)
    .and((c) => c.stage === stage)
    .toArray();
  return items.length ? Math.max(...items.map((c) => c.order ?? 0)) + 1 : 0;
}

/**
 * Create a client from form values. Applies any auto-transition (e.g. adding
 * directly into "Proceso comenzado"), appends to the end of its column and
 * stamps timestamps. Returns the stored record.
 */
export async function createClient(values) {
  const target = resolveTransition(values.section, values.stage);
  const ts = now();
  const record = {
    id: uuid(),
    firstName: (values.firstName ?? '').trim(),
    lastName: (values.lastName ?? '').trim(),
    phone: (values.phone ?? '').trim(),
    saleType: values.saleType || '',
    creditScheme: values.creditScheme || '',
    motorcycles: (values.motorcycles ?? '').trim(),
    prospectTeamSeller: (values.prospectTeamSeller ?? '').trim(),
    notes: values.notes ?? '',
    buroAutorizado: !!values.buroAutorizado,
    section: target.section,
    stage: target.stage,
    order: await nextOrder(target.section, target.stage),
    createdAt: ts,
    updatedAt: ts,
    fechaInicioProceso: target.section === 'ventas' ? ts : null,
    fechaEntrega: target.section === 'ventas' ? ts : null,
    notasPostVenta: '',
    notasRechazo: '',
    fechaCancelacion: null,
  };
  await db.clients.add(record);
  return record;
}

/** Patch user-editable fields; always refreshes updatedAt ("última modificación"). */
export async function updateClient(id, patch) {
  await db.clients.update(id, { ...patch, updatedAt: now() });
}

export async function deleteClient(id) {
  await db.clients.delete(id);
}

/**
 * Move a client to a target section/stage, applying auto-transition rules and
 * appending to the end of the destination column. Used by list actions and by
 * cross-column drags that trigger a section jump. Stamps delivery/start dates
 * when a client first lands in "Ventas concretadas".
 */
export async function moveClient(id, toSection, toStage) {
  const target = resolveTransition(toSection, toStage);
  const current = await db.clients.get(id);
  if (!current) return target;

  const patch = {
    section: target.section,
    stage: target.stage,
    order: await nextOrder(target.section, target.stage),
    updatedAt: now(),
  };
  if (target.section === 'ventas') {
    if (!current.fechaInicioProceso) patch.fechaInicioProceso = current.createdAt ?? now();
    if (!current.fechaEntrega) patch.fechaEntrega = now();
  }
  // Leaving "cancelados" (e.g. "Restablecer crédito") clears the cancellation stamp.
  if (current.section === 'cancelados' && target.section !== 'cancelados') {
    patch.fechaCancelacion = null;
  }
  await db.clients.update(id, patch);
  return target;
}

/**
 * Persist a drag that stays inside the same board (non auto-transition). Rewrites
 * `order` for every card in the destination column so the drop index sticks. Only
 * the moved card is re-stamped, and only when its stage actually changed.
 */
export async function applyBoardReorder({ movedId, toStage, stageChanged, orderedIds }) {
  const ts = now();
  await db.transaction('rw', db.clients, async () => {
    for (let i = 0; i < orderedIds.length; i++) {
      const patch = { order: i };
      if (orderedIds[i] === movedId && stageChanged) {
        patch.stage = toStage;
        patch.updatedAt = ts;
      }
      await db.clients.update(orderedIds[i], patch);
    }
  });
}

/** Move a client to "Clientes cancelados" with a rejection note, stamping the cancellation date. */
export async function cancelClient(id, notasRechazo = '') {
  const ts = now();
  await db.clients.update(id, {
    section: 'cancelados',
    stage: '',
    order: await nextOrder('cancelados', ''),
    notasRechazo,
    fechaCancelacion: ts,
    updatedAt: ts,
  });
}

/** Dump the whole database for a JSON backup file. */
export async function exportAll() {
  const clients = await db.clients.toArray();
  return {
    app: 'marga',
    version: 1,
    exportedAt: now(),
    clients,
  };
}

/**
 * Restore from a backup object. mode 'replace' wipes the table first; mode
 * 'merge' upserts by id. Returns the number of imported records.
 */
export async function importAll(data, mode = 'merge') {
  if (!data || !Array.isArray(data.clients)) {
    throw new Error('Archivo de respaldo inválido: falta el arreglo "clients".');
  }
  await db.transaction('rw', db.clients, async () => {
    if (mode === 'replace') await db.clients.clear();
    await db.clients.bulkPut(data.clients);
  });
  return data.clients.length;
}
