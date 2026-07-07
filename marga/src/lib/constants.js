// Domain constants for Marga: sections, board columns, select options and the
// auto-transition rules that move a client to the next section automatically.

export const SECTIONS = {
  prospectos: { id: 'prospectos', label: 'Prospectos', type: 'board' },
  procesos: { id: 'procesos', label: 'Procesos', type: 'board' },
  ventas: { id: 'ventas', label: 'Ventas concretadas', type: 'list' },
  cancelados: { id: 'cancelados', label: 'Clientes cancelados', type: 'list' },
};

// Ordered list used to render the sidebar navigation.
export const SECTION_ORDER = ['prospectos', 'procesos', 'ventas', 'cancelados'];

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

// Human-readable label for a section/stage pair (used by the global search).
export function stageLabel(section, stage) {
  const columns = BOARD_COLUMNS[section];
  if (!columns) return SECTIONS[section]?.label ?? section;
  const col = columns.find((c) => c.id === stage);
  return col ? col.label : SECTIONS[section]?.label ?? section;
}
