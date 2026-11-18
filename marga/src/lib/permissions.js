// Role-based permission rules, kept in one place so the UI and the data
// actions agree. `role` is 'admin', 'vendedor' or 'promotor' (see ROLES in
// constants.js); `username` is the acting user's name, compared against
// `client.createdBy`.
//
// Vendedor rules (ownership-based):
//   - Sees Prospectos, Procesos (read-only), Ventas concretadas (read-only),
//     Clientes cancelados (read-only) y Citas. In Clientes cancelados only the
//     clients they registered (createdBy) or that name them as their
//     "Vendedor Prospect Team" (prospectTeamSeller) — see canSeeClient.
//   - Adds clients only from the Prospectos view.
//   - May edit/move/cancel/delete a client only while it sits in Prospectos AND
//     the client was registered by them (createdBy). Moving into "Proceso
//     comenzado" hands the client off to Procesos, where the vendedor stops
//     acting and the promotor encargado takes over.
//   - Clients with an empty createdBy (older/imported/admin records) are
//     admin-only.
//   - Never imports backups or manages users. Citas: full shared management.
//
// Promotor rules (section-based, not ownership-based):
//   - Sees only Procesos (plus the shared Citas agenda).
//   - Acts on EVERY card sitting in Procesos, regardless of who registered it
//     or who is the assigned `promotorEncargado`: edits fields, drags between
//     columns, adds new clients, cancels, returns a card to Prospectos and
//     closes the sale via "Moto entregada". All of those except editing move
//     the card out of Procesos, so it leaves their board.
//   - Never deletes a client, imports backups, manages users or opens the
//     Panel ADMIN.
// Admin: everything.

import { ROLES, SECTION_ORDER, TOOL_IDS } from './constants.js';
import { normalizeName } from './clients.js';

export function isAdmin(role) {
  return role === ROLES.ADMIN;
}

export function isPromotor(role) {
  return role === ROLES.PROMOTOR;
}

/** Section ids (client views) this role can open. */
export function visibleSections(role) {
  if (isAdmin(role)) return SECTION_ORDER;
  if (isPromotor(role)) return ['procesos'];
  return ['prospectos', 'procesos', 'ventas', 'cancelados'];
}

/**
 * Can this user see the given client at all? The admin sees everything and the
 * promotor the whole Procesos board. A vendedor only sees HIS clients in
 * Prospectos, Procesos and Clientes cancelados (2026-11-17, Braulio: Alejandro no
 * ve los de Emmanuel ni al revés): the ones he registered or that Alex assigned to
 * him (createdBy), or that are assigned to him as "Vendedor Prospect Team"
 * (prospectTeamSeller, free text, compared ignoring case and accents). Ventas
 * stays visible to the whole team.
 */
export const SECCIONES_PROPIAS = ['prospectos', 'procesos', 'cancelados'];

export function canSeeClient(role, client, username) {
  if (!visibleSections(role).includes(client.section)) return false;
  if (isAdmin(role) || isPromotor(role)) return true;
  if (!SECCIONES_PROPIAS.includes(client.section)) return true;
  if (!username) return false;
  if (client.createdBy && client.createdBy === username) return true;
  const asignado = normalizeName(client.prospectTeamSeller ?? '');
  return !!asignado && asignado === normalizeName(username);
}

/**
 * "Mi día": la cola de prospectos de Alex por atender. La usan quienes
 * trabajan Prospectos (admin y vendedor); el promotor solo ve Procesos.
 */
export function canViewMiDia(role) {
  return isAdmin(role) || role === ROLES.VENDEDOR;
}

/**
 * Vista en la que cae cada rol al entrar. El vendedor empieza en "Mi día";
 * los demás, en su primer tablero.
 */
export function vistaInicial(role) {
  if (role === ROLES.VENDEDOR) return 'midia';
  return visibleSections(role)[0] ?? 'citas';
}

export function canViewSection(role, section) {
  if (section === 'midia') return canViewMiDia(role);
  if (section === 'usuarios' || section === 'admin') return isAdmin(role);
  if (section === 'citas') return true; // shared agenda: every role manages citas fully
  if (TOOL_IDS.includes(section)) return true; // tools: available to every role
  if (section === 'comisiones') return canViewComisiones(role);
  return visibleSections(role).includes(section);
}

/** Can this role open the "Agregar cliente" form from the given board view? */
export function canAddClient(role, section) {
  if (isAdmin(role)) return section === 'prospectos' || section === 'procesos';
  if (isPromotor(role)) return section === 'procesos';
  return section === 'prospectos';
}

/** True when the client belongs to this vendedor and is still a prospect. */
function ownsProspect(client, username) {
  return (
    client.section === 'prospectos' && !!client.createdBy && client.createdBy === username
  );
}

/** Can this user edit fields / toggle buró / drag / cancel the given client? */
export function canEditClient(role, client, username) {
  if (isAdmin(role)) return true;
  // A promotor owns the Procesos board as a whole, not individual cards.
  if (isPromotor(role)) return client.section === 'procesos';
  return ownsProspect(client, username);
}

/**
 * Can this user permanently delete the given client? A client that already
 * has a comisión (e.g. returned to Prospectos after being facturado) is
 * admin-only: deleting it also deletes the comisión.
 */
export function canDeleteClient(role, client, username) {
  if (isAdmin(role)) return true;
  if (isPromotor(role)) return false;
  return ownsProspect(client, username) && !client.comisionId;
}

/** Can this role drop a card into section/stage? (drag target check) */
export function canDropTo(role, section) {
  if (isAdmin(role)) return true;
  // Every Procesos column, including "Moto entregada" (which closes the sale).
  if (isPromotor(role)) return section === 'procesos';
  // Any Prospectos column — including "Proceso comenzado" (the hand-off).
  return section === 'prospectos';
}

/**
 * Can this role set the "Promotor encargado" of a proceso? Admins assign work,
 * promotores hand cards over between themselves. Vendedores never do.
 */
export function canAssignPromotor(role) {
  return isAdmin(role) || isPromotor(role);
}

/** Disponibilidad de motos: todos la consultan, solo el admin cambia estados. */
export function canEditDisponibilidad(role) {
  return isAdmin(role);
}

export function canImportBackup(role) {
  return isAdmin(role);
}

export function canManageUsers(role) {
  return isAdmin(role);
}

/** Can this role open the Panel ADMIN (team performance monitoring)? */
export function canViewAdminPanel(role) {
  return isAdmin(role);
}

/**
 * Panel de Comisiones. El admin ve todo el equipo; el vendedor solo las suyas
 * (el filtro por nombre se aplica en la vista). El promotor no entra: su
 * comisión no se gestiona desde Marga.
 */
export function canViewComisiones(role) {
  return isAdmin(role) || role === ROLES.VENDEDOR;
}

/** Reglas de corte, mes de venta, nota y renumeración: solo el admin. */
export function canConfigurarComisiones(role) {
  return isAdmin(role);
}

/**
 * Quién captura una facturación. Coincide con quién puede mover tarjetas en
 * Procesos (canDropTo), que es donde vive la columna "Moto Facturada".
 */
export function canRegistrarFacturacion(role) {
  return isAdmin(role) || isPromotor(role);
}

/**
 * Publicidad y agencia (gasto en anuncios, costo de la agencia, embudo de
 * anuncio a venta): información del negocio, solo del administrador.
 */
export function canViewPublicidad(role) {
  return isAdmin(role);
}

/**
 * Chat con Bartersito: es el asistente personal del administrador (ve ventas,
 * gasto y puede proponer cambios en la publicidad). Ni vendedores ni
 * promotores lo ven; ellos tendrán después su propio chatbot de consulta.
 */
export function canUsarBartersito(role) {
  return isAdmin(role);
}

/** Solo admin y promotor registran si el cliente fue a la cita. */
export function canMarkAsistencia(role) {
  return isAdmin(role) || isPromotor(role);
}

/**
 * ¿Puede este usuario confirmar / reagendar la cita? El admin cualquiera; el
 * vendedor solo las suyas (su nombre en `vendedor` o `createdBy`, sin importar
 * acentos ni mayúsculas); el promotor no.
 */
export function canConfirmCita(role, cita, username) {
  if (isAdmin(role)) return true;
  if (isPromotor(role) || !username) return false;
  const yo = normalizeName(username);
  return [cita?.vendedor, cita?.createdBy].some((n) => !!n && normalizeName(n) === yo);
}
