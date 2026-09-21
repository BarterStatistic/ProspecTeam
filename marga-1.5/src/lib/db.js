// Domain layer over the shared store (Firestore or demo). Section + stage
// position a card, `order` sorts it within a column. Every high-level action
// funnels through here so the auto-transition rules live in exactly one place.
// Records carry `createdBy` (who registered the client) and `updatedAt`
// ("última modificación"), stamped automatically on every write.

import { AUTO_TRANSITIONS } from './constants.js';
import { store } from './store/index.js';
import { calcularFinanciamiento } from './cotizador.js';
import {
  CONFIG_DEFAULT,
  calcularComision,
  mesVenta,
  fechaPago,
} from './comisiones.js';
import { motoPorNombre } from './motos.js';
import {
  TIPOS,
  mensajeColumna,
  mensajeEntrega,
  mensajeFacturacion,
  mensajeEdicion,
} from './notificaciones.js';

const now = () => Date.now();
const uuid = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;

const MAX_NOTIFICACIONES = 100;

/** "Nombre Apellido" de un registro de cliente. */
function nombreDe(cliente) {
  return `${cliente?.firstName ?? ''} ${cliente?.lastName ?? ''}`.trim() || 'Sin nombre';
}

/**
 * Crea una notificación para el vendedor dueño de la tarjeta y poda las viejas.
 * No se autonotifica: si el actor es el propio destinatario, no escribe nada.
 */
export async function notificar({ destinatario, tipo, mensaje, clienteId, actor }) {
  if (!destinatario) return;
  if (actor && actor === destinatario) return;

  await store.setNotificacion({
    id: uuid(),
    destinatario,
    tipo,
    mensaje,
    clienteId: clienteId ?? '',
    createdAt: now(),
    leida: false,
  });

  const mias = store
    .getNotificaciones()
    .filter((n) => n.destinatario === destinatario)
    .sort((a, b) => b.createdAt - a.createdAt);
  if (mias.length > MAX_NOTIFICACIONES) {
    await store.deleteNotificaciones(mias.slice(MAX_NOTIFICACIONES).map((n) => n.id));
  }
}

/** Marca como leídas las notificaciones indicadas. */
export async function marcarNotificacionesLeidas(ids) {
  await store.patchNotificaciones(ids.map((id) => ({ id, patch: { leida: true } })));
}

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
    fechaFacturacion: null,
    comisionId: null,
  };
  await store.setClient(record);
  return record;
}

/** Patch user-editable fields; always refreshes updatedAt ("última modificación"). */
export async function updateClient(id, patch, actor = null) {
  const current = store.getClients().find((c) => c.id === id);
  await store.patchClient(id, { ...patch, updatedAt: now() });
  if (!current) return;
  await notificar({
    destinatario: current.createdBy,
    actor: actor?.username ?? '',
    tipo: TIPOS.EDICION,
    mensaje: mensajeEdicion(nombreDe(current), actor?.username ?? 'Alguien'),
    clienteId: id,
  });
}

export async function deleteClient(id) {
  await store.deleteClient(id);
}

/**
 * Move a client to a target section/stage, applying auto-transition rules and
 * appending to the end of the destination column. Stamps delivery/start dates
 * when a client first lands in "Ventas concretadas".
 */
export async function moveClient(id, toSection, toStage, actor = null) {
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

  const destinatario = current.createdBy;
  const nombre = nombreDe(current);
  const quien = actor?.username ?? '';
  if (target.section === 'ventas') {
    await notificar({
      destinatario,
      actor: quien,
      tipo: TIPOS.ENTREGA,
      mensaje: mensajeEntrega(nombre),
      clienteId: id,
    });
  } else if (target.section === 'procesos' && target.stage !== current.stage) {
    await notificar({
      destinatario,
      actor: quien,
      tipo: TIPOS.COLUMNA,
      mensaje: mensajeColumna(nombre, target.stage),
      clienteId: id,
    });
  }
  return target;
}

/**
 * Persist a drag that stays inside the same board (non auto-transition).
 * Rewrites `order` for every card in the destination column so the drop index
 * sticks. Only the moved card is re-stamped, and only when its stage changed.
 */
export async function applyBoardReorder(
  { movedId, toStage, stageChanged, orderedIds },
  actor = null,
) {
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

  if (!stageChanged) return;
  const movido = store.getClients().find((c) => c.id === movedId);
  if (!movido) return;
  await notificar({
    destinatario: movido.createdBy,
    actor: actor?.username ?? '',
    tipo: TIPOS.COLUMNA,
    mensaje: mensajeColumna(nombreDe(movido), toStage),
    clienteId: movedId,
  });
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

// ---------------------------------------------------------------------------
// Comisiones — una por venta facturada. Los importes se congelan al crearlas
// (dependen de precios y factores que cambian); la fecha de pago se deriva
// siempre de la configuración vigente, para que una excepción de corte se
// refleje sin reescribir documentos.
// ---------------------------------------------------------------------------

/** Configuración vigente, con los defaults rellenados. */
export function configComisiones() {
  return { ...CONFIG_DEFAULT, ...(store.getConfig() ?? {}) };
}

export function guardarConfigComisiones(patch) {
  return store.setConfig(patch);
}

/** Cuántas comisiones lleva un vendedor en un mes de venta. */
function ventasDelMes(vendedor, clave, excluirId = null) {
  return store
    .getComisiones()
    .filter((c) => c.vendedor === vendedor && c.mesVenta === clave && c.id !== excluirId);
}

/** Arma el objeto de comisión a partir de los datos capturados al facturar. */
function construirComision({ cliente, values, config, numeroVenta, id, actor }) {
  const moto = motoPorNombre(values.motoNombre);
  if (!moto) throw new Error(`La moto "${values.motoNombre}" no está en el catálogo.`);

  const fin = calcularFinanciamiento({
    motoNombre: values.motoNombre,
    incluyeServicio: values.incluyeServicio,
    esquemaId: values.esquemaId,
    enganche: values.enganche,
  });
  const promotor = cliente.promotorEncargado ?? '';
  const com = calcularComision({
    montoFinanciado: fin.montoFinanciado,
    esquemaId: values.esquemaId,
    numeroVenta,
    tienePromotor: !!promotor,
  });

  return {
    id,
    clienteId: cliente.id,
    clienteNombre: nombreDe(cliente),
    vendedor: cliente.createdBy ?? '',
    promotor,
    moto: values.motoNombre,
    precioLista: moto.precio,
    incluyeServicio: !!values.incluyeServicio,
    servicioPreventivo: values.incluyeServicio ? moto.servicio : 0,
    esquemaId: values.esquemaId,
    enganche: values.enganche,
    enganchePct: fin.enganchePct,
    plazoMax: fin.plazoMax,
    parcialidad: fin.parcialidad,
    montoFinanciado: fin.montoFinanciado,
    tasa: com.tasa,
    comisionTotal: com.comisionTotal,
    numeroVenta,
    nivelRacha: com.nivelRacha,
    porcentajeRacha: com.porcentajeRacha,
    comisionVendedor: com.comisionVendedor,
    comisionPromotor: com.comisionPromotor,
    netoAdmin: com.netoAdmin,
    fechaFacturacion: values.fechaFacturacion,
    mesVenta: mesVenta(values.fechaFacturacion, config),
    createdAt: now(),
    createdBy: actor?.username ?? '',
  };
}

/**
 * Registra la facturación de una venta: crea la comisión, estampa la tarjeta y
 * notifica al vendedor con el monto y la fecha de pago.
 *
 * Idempotente por cliente. Las tres escrituras (comisión, tarjeta,
 * notificación) no son atómicas — si una llamada anterior alcanzó a crear la
 * comisión pero se cortó antes de estampar la tarjeta (p. ej. se cayó la
 * conexión entre el `setComision` y el `patchClient`), un reintento con el
 * mismo `clienteId` NO debe crear una segunda comisión: `ventasDelMes` la
 * contaría, e infla el `numeroVenta` —y por tanto la racha— tanto de esta
 * venta como, vía `renumerarMes`, de TODAS las ventas de ese vendedor en el
 * mes. La comisión huérfana además nunca se limpiaría sola.
 * Por eso, si ya existe una comisión para este cliente, el reintento
 * actualiza esa misma comisión (vía `actualizarFacturacion`, que conserva su
 * `id` y ya deja la tarjeta estampada) en vez de crear otra, y el aviso al
 * vendedor solo se manda si todavía no existe una notificación de
 * facturación para este cliente — así una llamada duplicada (tras éxito
 * total, o tras un reintento que ya notificó) no lo duplica, pero el
 * reintento que nunca llegó a notificar sí lo hace.
 */
export async function registrarFacturacion(clienteId, values, actor = null) {
  const cliente = store.getClients().find((c) => c.id === clienteId);
  if (!cliente) throw new Error('El cliente ya no existe.');

  const config = configComisiones();
  const existente = store.getComisiones().find((c) => c.clienteId === clienteId);
  let comision;
  if (existente) {
    comision = await actualizarFacturacion(existente.id, values, actor);
  } else {
    const clave = mesVenta(values.fechaFacturacion, config);
    const numeroVenta = ventasDelMes(cliente.createdBy ?? '', clave).length + 1;
    comision = construirComision({
      cliente,
      values,
      config,
      numeroVenta,
      id: uuid(),
      actor,
    });

    await store.setComision(comision);
    // Solo se estampa la marca de facturación. `motorcycles` y `creditScheme`
    // de la tarjeta NO se tocan: `motorcycles` es multivaluado (lo que el
    // cliente andaba viendo) y sobrescribirlo con el modelo vendido perdería
    // datos. La comisión es la autoridad sobre qué se vendió.
    await store.patchClient(clienteId, {
      fechaFacturacion: values.fechaFacturacion,
      comisionId: comision.id,
      updatedAt: now(),
    });
  }

  const yaNotificado = store
    .getNotificaciones()
    .some((n) => n.clienteId === clienteId && n.tipo === TIPOS.FACTURACION);
  if (!yaNotificado) {
    await notificar({
      destinatario: comision.vendedor,
      actor: actor?.username ?? '',
      tipo: TIPOS.FACTURACION,
      mensaje: mensajeFacturacion(
        comision.clienteNombre,
        comision.comisionVendedor,
        fechaPago(comision.fechaFacturacion, config),
      ),
      clienteId,
    });
  }
  return comision;
}

/**
 * Recalcula una comisión ya existente con datos corregidos. Conserva
 * `numeroVenta` salvo que la facturación cambie de mes de venta, en cuyo caso
 * la manda al final del periodo nuevo.
 */
export async function actualizarFacturacion(comisionId, values, actor = null) {
  const previa = store.getComisiones().find((c) => c.id === comisionId);
  if (!previa) throw new Error('La comisión ya no existe.');
  const cliente = store.getClients().find((c) => c.id === previa.clienteId);
  if (!cliente) throw new Error('El cliente ya no existe.');

  const config = configComisiones();
  const claveNueva = mesVenta(values.fechaFacturacion, config);
  const numeroVenta =
    claveNueva === previa.mesVenta
      ? previa.numeroVenta
      : ventasDelMes(previa.vendedor, claveNueva, comisionId).length + 1;

  const comision = construirComision({
    cliente,
    values,
    config,
    numeroVenta,
    id: comisionId,
    actor,
  });
  comision.createdAt = previa.createdAt;

  await store.setComision(comision);
  // También estampa `comisionId`: es inofensivo cuando ya estaba puesto (caso
  // normal de editar una facturación existente), y necesario cuando
  // `registrarFacturacion` delega aquí para completar un reintento tras una
  // escritura parcial previa (ver comentario en `registrarFacturacion`).
  await store.patchClient(cliente.id, {
    fechaFacturacion: values.fechaFacturacion,
    comisionId: comision.id,
    updatedAt: now(),
  });
  return comision;
}

/** Elimina una comisión y limpia la marca de facturación de su tarjeta. */
export async function eliminarComision(id) {
  const comision = store.getComisiones().find((c) => c.id === id);
  await store.deleteComision(id);
  if (!comision) return;
  const cliente = store.getClients().find((c) => c.id === comision.clienteId);
  if (cliente?.comisionId === id) {
    await store.patchClient(cliente.id, {
      comisionId: null,
      fechaFacturacion: null,
      updatedAt: now(),
    });
  }
}

/**
 * Renumera las comisiones de un mes de venta por orden de facturación, por
 * vendedor, y recalcula los importes que dependen de la racha. Acción manual
 * del admin — nunca se dispara sola.
 */
export async function renumerarMes(claveMes) {
  const delMes = store.getComisiones().filter((c) => c.mesVenta === claveMes);
  const porVendedor = new Map();
  for (const c of delMes) {
    if (!porVendedor.has(c.vendedor)) porVendedor.set(c.vendedor, []);
    porVendedor.get(c.vendedor).push(c);
  }

  const patches = [];
  for (const lista of porVendedor.values()) {
    lista.sort((a, b) => a.fechaFacturacion - b.fechaFacturacion);
    lista.forEach((c, i) => {
      const numeroVenta = i + 1;
      const recalc = calcularComision({
        montoFinanciado: c.montoFinanciado,
        esquemaId: c.esquemaId,
        numeroVenta,
        tienePromotor: !!c.promotor,
      });
      if (c.numeroVenta === numeroVenta) return;
      patches.push({
        id: c.id,
        patch: {
          numeroVenta,
          nivelRacha: recalc.nivelRacha,
          porcentajeRacha: recalc.porcentajeRacha,
          comisionVendedor: recalc.comisionVendedor,
          comisionPromotor: recalc.comisionPromotor,
          netoAdmin: recalc.netoAdmin,
        },
      });
    });
  }
  await store.patchComisiones(patches);
  return patches.length;
}

// ---------------------------------------------------------------------------
// Cotizaciones — log de solo-apéndice, para contar por vendedor en el ADMIN.
// ---------------------------------------------------------------------------

export async function registrarCotizacion(values, actor = null) {
  const record = {
    id: uuid(),
    createdAt: now(),
    createdBy: actor?.username ?? '',
    moto: values.moto ?? '',
    esquemaId: values.esquemaId ?? '',
    precioEfectivo: values.precioEfectivo ?? 0,
    enganchePct: values.enganchePct ?? 0,
    plazo: values.plazo ?? 0,
    parcialidad: values.parcialidad ?? 0,
  };
  await store.setCotizacion(record);
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
    fechaFacturacion: null,
    comisionId: null,
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
