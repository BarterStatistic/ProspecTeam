// Role-based permission rules, kept in one place so the UI and the data
// actions agree. `role` is 'admin' or 'vendedor' (see ROLES in constants.js);
// `username` is the acting user's name, compared against `client.createdBy`.
//
// Vendedor rules (ownership-based):
//   - Sees Prospectos, Procesos (read-only), Ventas concretadas (read-only) y Citas.
//   - Adds clients only from the Prospectos view.
//   - May edit/move/cancel/delete a client only while it sits in Prospectos AND
//     the client was registered by them (createdBy). Moving into "Proceso
//     comenzado" hands the client off to Procesos, where only the admin acts.
//   - Clients with an empty createdBy (older/imported/admin records) are
//     admin-only.
//   - Never imports backups or manages users. Citas: full shared management.
// Admin: everything.

import { ROLES, SECTION_ORDER } from './constants.js';

export function isAdmin(role) {
  return role === ROLES.ADMIN;
}

/** Section ids (client views) this role can open. */
export function visibleSections(role) {
  return isAdmin(role) ? SECTION_ORDER : ['prospectos', 'procesos', 'ventas'];
}

export function canViewSection(role, section) {
  if (section === 'usuarios' || section === 'admin') return isAdmin(role);
  if (section === 'citas') return true; // shared agenda: both roles manage citas fully
  return visibleSections(role).includes(section);
}

/** Can this role open the "Agregar cliente" form from the given board view? */
export function canAddClient(role, section) {
  if (isAdmin(role)) return section === 'prospectos' || section === 'procesos';
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
  return ownsProspect(client, username);
}

/** Can this user permanently delete the given client? */
export function canDeleteClient(role, client, username) {
  if (isAdmin(role)) return true;
  return ownsProspect(client, username);
}

/** Can this role drop a card into section/stage? (drag target check) */
export function canDropTo(role, section) {
  if (isAdmin(role)) return true;
  // Any Prospectos column — including "Proceso comenzado" (the hand-off).
  return section === 'prospectos';
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
