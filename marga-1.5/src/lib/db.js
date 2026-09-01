// Domain layer over the shared store (Firestore or demo). Section + stage
// position a card, `order` sorts it within a column. Every high-level action
// funnels through here so the auto-transition rules live in exactly one place.
// Records carry `createdBy` (who registered the client) and `updatedAt`
// ("última modificación"), stamped automatically on every write.

import { AUTO_TRANSITIONS } from './constants.js';
import { store } from './store/index.js';

const now = () => Date.now();
const uuid = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;

/** Resolve an auto-transition. Returns the effective { section, stage }. */
export function resolveTransition(section, stage) {
  return AUTO_TRANSITIONS[`${section}:${stage}`] ?? { section, stage };
}

/** Next free order value at the end of a column (from the live mirror). */
function nextOrder(section, stage) {
  const items = store.getClients().filter((c) => c.section === section && c.stage === stage);
  return items.length ? Math.max(...items.map((c) => c.order ?? 0)) + 1 : 0;
}

/**
 * Create a client from form values. Applies any auto-transition, appends to
 * the end of its column, stamps timestamps and records who registered it.
 * Returns the stored record.
 */
export async function createClient(values, actor = null) {
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
    promotorEncargado: (values.promotorEncargado ?? '').trim(),
    notes: values.notes ?? '',
    buroAutorizado: !!values.buroAutorizado,
    engancheDejado: !!values.engancheDejado,
    section: target.section,
    stage: target.stage,
    order: nextOrder(target.section, target.stage),
    createdAt: ts,
    updatedAt: ts,
    createdBy: actor?.username ?? '',
    fechaInicioProceso: target.section === 'ventas' ? ts : null,
    fechaEntrega: target.section === 'ventas' ? ts : null,
    notasPostVenta: '',
    notasRechazo: '',
    fechaCancelacion: null,
  };
  await store.setClient(record);
  return record;
}

/** Patch user-editable fields; always refreshes updatedAt ("última modificación"). */
export async function updateClient(id, patch) {
  await store.patchClient(id, { ...patch, updatedAt: now() });
}

export async function deleteClient(id) {
  await store.deleteClient(id);
}

/**
 * Move a client to a target section/stage, applying auto-transition rules and
 * appending to the end of the destination column. Stamps delivery/start dates
 * when a client first lands in "Ventas concretadas".
 */
export async function moveClient(id, toSection, toStage) {
  const target = resolveTransition(toSection, toStage);
  const current = store.getClients().find((c) => c.id === id);
  if (!current) return target;

  const patch = {
    section: target.section,
    stage: target.stage,
    order: nextOrder(target.section, target.stage),
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
  await store.patchClient(id, patch);
  return target;
}

/**
 * Persist a drag that stays inside the same board (non auto-transition).
 * Rewrites `order` for every card in the destination column so the drop index
 * sticks. Only the moved card is re-stamped, and only when its stage changed.
 */
export async function applyBoardReorder({ movedId, toStage, stageChanged, orderedIds }) {
  const ts = now();
  await store.patchClients(
    orderedIds.map((id, i) => ({
      id,
      patch:
        id === movedId && stageChanged
          ? { order: i, stage: toStage, updatedAt: ts }
          : { order: i },
    })),
  );
}

/** Move a client to "Clientes cancelados" with a rejection note, stamping the cancellation date. */
export async function cancelClient(id, notasRechazo = '') {
  const ts = now();
  await store.patchClient(id, {
    section: 'cancelados',
    stage: '',
    order: nextOrder('cancelados', ''),
    notasRechazo,
    fechaCancelacion: ts,
    updatedAt: ts,
  });
}

// ---------------------------------------------------------------------------
// Citas (appointments) — standalone records, not linked to client cards.
// ---------------------------------------------------------------------------

/** Create an appointment. Returns the stored record. */
export async function createCita(values, actor = null) {
  const ts = now();
  const record = {
    id: uuid(),
    clientName: (values.clientName ?? '').trim(),
    phone: (values.phone ?? '').trim(),
    motorcycle: (values.motorcycle ?? '').trim(),
    description: values.description ?? '',
    fechaCita: values.fechaCita,
    hasTime: !!values.hasTime,
    ineImage: values.ineImage ?? '',
    atendida: false,
    notaAtencion: '',
    fechaAtencion: null,
    createdBy: actor?.username ?? '',
    createdAt: ts,
    updatedAt: ts,
  };
  await store.setCita(record);
  return record;
}

/** Patch an appointment; always refreshes updatedAt. */
export async function updateCita(id, patch) {
  await store.patchCita(id, { ...patch, updatedAt: now() });
}

export async function deleteCita(id) {
  await store.deleteCita(id);
}

// ---------------------------------------------------------------------------
// Buró Automático — log de solo-apéndice de autorizaciones generadas. No es
// data operativa del Kanban: deliberadamente queda fuera de exportAll/importAll.
// ---------------------------------------------------------------------------

/** Registra una autorización de Buró generada (evento "fin" del llenado). */
export async function createBuroAutorizacion(values, actor = null) {
  const record = {
    id: uuid(),
    createdAt: now(),
    createdBy: actor?.username ?? '',
    nombreCompleto: (values.nombreCompleto ?? '').trim(),
    rfc: values.rfc ?? '',
    curp: values.curp ?? '',
    via: values.via === 'servicio' ? 'servicio' : 'extension',
  };
  await store.setBuroAutorizacion(record);
  return record;
}

/** Dump clients + citas for a JSON backup file (compatible with Marga v1 backups). */
export async function exportAll() {
  return {
    app: 'marga',
    version: 2,
    exportedAt: now(),
    clients: store.getClients(),
    citas: store.getCitas(),
  };
}

/**
 * Restore from a backup object. mode 'replace' wipes the collection first;
 * mode 'merge' upserts by id. Returns the number of imported records.
 */
export async function importAll(data, mode = 'merge') {
  if (!data || !Array.isArray(data.clients)) {
    throw new Error('Archivo de respaldo inválido: falta el arreglo "clients".');
  }
  // v1 backups lack the newer fields; fill them so Firestore docs stay uniform.
  const records = data.clients.map((c) => ({
    createdBy: '',
    fechaCancelacion: null,
    prospectTeamSeller: '',
    promotorEncargado: '',
    ...c,
  }));
  if (mode === 'replace') await store.clearClients();
  await store.bulkSetClients(records);
  // Older backups (v1) have no citas array; restore it when present.
  if (Array.isArray(data.citas) && data.citas.length) {
    await store.bulkSetCitas(data.citas);
  }
  return records.length;
}
