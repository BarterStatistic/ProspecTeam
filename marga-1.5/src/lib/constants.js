// Domain constants for Marga 1.5: sections, board columns, select options,
// auto-transition rules, roles and the seed accounts for the shared database.

export const SECTIONS = {
  prospectos: { id: 'prospectos', label: 'Prospectos', type: 'board' },
  procesos: { id: 'procesos', label: 'Procesos', type: 'board' },
  ventas: { id: 'ventas', label: 'Ventas concretadas', type: 'list' },
  cancelados: { id: 'cancelados', label: 'Clientes cancelados', type: 'list' },
};

// Ordered list used to render the sidebar navigation (client sections only;
// the admin-only "usuarios" view is rendered separately).
export const SECTION_ORDER = ['prospectos', 'procesos', 'ventas', 'cancelados'];

// Metadata for every navigable view, including non-client views.
export const VIEW_META = {
  ...SECTIONS,
  citas: { id: 'citas', label: 'Citas', type: 'citas' },
  usuarios: { id: 'usuarios', label: 'Gestor de usuarios', type: 'users' },
  admin: { id: 'admin', label: 'Panel ADMIN', type: 'admin' },
};

// Columns for each Kanban board section, in display order.
export const BOARD_COLUMNS = {
  prospectos: [
    { id: 'primer_contacto', label: 'Primer contacto' },
    { id: 'preguntas', label: 'Preguntas' },
    { id: 'interesado_proceso', label: 'Interesado en proceso' },
    { id: 'envio_docs_cita', label: 'Envío de docs / Cita agendada' },
    { id: 'proceso_comenzado', label: 'Proceso comenzado' },
  ],
  procesos: [
    { id: 'credito_por_subir', label: 'Crédito por subir' },
    { id: 'bnc', label: 'BNC' },
    { id: 'vfs_call_center', label: 'VFS / Call center' },
    { id: 'ec', label: 'EC' },
    { id: 'entrega_agendada', label: 'Entrega agendada' },
    { id: 'moto_entregada', label: 'Moto entregada' },
  ],
};

// First column of a board — where newly added clients land.
export const DEFAULT_STAGE = {
  prospectos: 'primer_contacto',
  procesos: 'credito_por_subir',
};

// Auto-transition rules. Key = `${section}:${stage}`. When a client is moved
// into one of these stages, it jumps to the mapped section/stage instead.
export const AUTO_TRANSITIONS = {
  'prospectos:proceso_comenzado': { section: 'procesos', stage: 'credito_por_subir' },
  'procesos:moto_entregada': { section: 'ventas', stage: '' },
};

export const SALE_TYPES = ['Crédito', 'Contado', 'MSI'];
export const CREDIT_SCHEMES = ['Motonómina', 'Credinamo', 'Motoxpress'];

// ---------------------------------------------------------------------------
// Roles & seed accounts
// ---------------------------------------------------------------------------

export const ROLES = { ADMIN: 'admin', VENDEDOR: 'vendedor' };

export const ROLE_LABELS = {
  admin: 'Administrador',
  vendedor: 'Vendedor',
};

// Accounts created automatically the first time the app runs against an empty
// database. Passwords are hashed before being stored; they can be changed
// later from the "Gestor de usuarios" view.
export const SEED_USERS = [
  { id: 'braulio-acosta', username: 'Braulio Acosta', role: ROLES.ADMIN, password: 'xbox2015', color: '#22C55E' },
  { id: 'alejandro-acosta', username: 'Alejandro Acosta', role: ROLES.VENDEDOR, password: 'prospect2007', color: '#EF4444' },
  { id: 'emmanuel-bernal', username: 'Emmanuel Bernal', role: ROLES.VENDEDOR, password: 'brisasponiente394', color: '#3B82F6' },
];

// ---------------------------------------------------------------------------
// Seller colours — a per-vendedor accent based on who captured the client
// (the `createdBy` field). Used to tint cards, drive the board filter and
// colour the Panel ADMIN charts.
//
// The colour lives in the user's document (field `color`), editable from the
// "Gestor de usuarios" view. The maps below are only the fallback for users
// created before that field existed.
// ---------------------------------------------------------------------------

export const SELLER_COLORS = {
  'Emmanuel Bernal': '#3B82F6', // azul
  'Alejandro Acosta': '#EF4444', // rojo
  'Braulio Acosta': '#22C55E', // verde fuerte
};

export const UNASSIGNED_COLOR = '#64748B'; // gris para clientes sin `createdBy`
export const UNASSIGNED_LABEL = 'Sin asignar';

// Swatches offered in the colour picker. All of them read clearly against the
// dark navy background and stay distinguishable from each other.
export const COLOR_PALETTE = [
  '#22C55E', // verde
  '#3B82F6', // azul
  '#EF4444', // rojo
  '#FFD11A', // dorado
  '#A855F7', // morado
  '#F97316', // naranja
  '#14B8A6', // turquesa
  '#EC4899', // rosa
  '#84CC16', // lima
  '#38BDF8', // cielo
  '#F59E0B', // ámbar
  '#94A3B8', // gris
];

// Fallback palette for any other (future) vendedor without a stored colour,
// chosen deterministically from the name so each one keeps a stable, distinct
// colour until an admin picks one.
const EXTRA_PALETTE = ['#A855F7', '#F59E0B', '#14B8A6', '#EC4899', '#84CC16', '#F97316'];

/**
 * Accent colour for a client's creator (empty → grey).
 * `colors` is the live `username → color` map from the users collection; when a
 * name isn't in it, fall back to the seed colours and then to a hash of the name.
 */
export function sellerColor(name, colors = null) {
  if (!name) return UNASSIGNED_COLOR;
  if (colors && colors[name]) return colors[name];
  if (SELLER_COLORS[name]) return SELLER_COLORS[name];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return EXTRA_PALETTE[h % EXTRA_PALETTE.length];
}

/** Colour assigned to a user record, falling back to the name-based default. */
export function userColor(user) {
  return user?.color || sellerColor(user?.username);
}

// Human-readable label for a section/stage pair (used by the global search).
export function stageLabel(section, stage) {
  const columns = BOARD_COLUMNS[section];
  if (!columns) return SECTIONS[section]?.label ?? section;
  const col = columns.find((c) => c.id === stage);
  return col ? col.label : SECTIONS[section]?.label ?? section;
}
