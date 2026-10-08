// Disponibilidad de motos: en qué estado está cada modelo del catálogo
// (`MODELS` de motos.js). Funciones puras; la persistencia vive en db.js y el
// estado se guarda en el documento único config/disponibilidad, con la forma
// { [nombreMoto]: { estado, updatedAt, updatedBy } }.

export const ESTADOS_DISPONIBILIDAD = [
  { id: 'disponible', label: 'Disponible', color: '#4ADE80' },
  { id: 'bajo_pedido', label: 'Bajo pedido', color: '#FACC15' },
  { id: 'no_disponible', label: 'No disponible', color: '#F87171' },
];

/** Estado que se asume para una moto a la que nadie le ha puesto uno. */
export const ESTADO_DEFAULT = 'disponible';

const IDS = new Set(ESTADOS_DISPONIBILIDAD.map((e) => e.id));

export function esEstadoValido(id) {
  return IDS.has(id);
}

/** Metadatos ({ id, label, color }) de un estado; cae al default si no lo reconoce. */
export function infoEstado(id) {
  return (
    ESTADOS_DISPONIBILIDAD.find((e) => e.id === id) ??
    ESTADOS_DISPONIBILIDAD.find((e) => e.id === ESTADO_DEFAULT)
  );
}

/** Registro guardado de una moto, o null si nunca se ha cambiado. */
export function registroDe(disponibilidad, nombre) {
  const r = disponibilidad?.[nombre];
  return r && esEstadoValido(r.estado) ? r : null;
}

/** Estado vigente de una moto (default si no tiene uno válido guardado). */
export function estadoDe(disponibilidad, nombre) {
  return registroDe(disponibilidad, nombre)?.estado ?? ESTADO_DEFAULT;
}

/** Cuántas motos hay en cada estado: { disponible, bajo_pedido, no_disponible }. */
export function conteoPorEstado(modelos, disponibilidad) {
  const conteo = Object.fromEntries(ESTADOS_DISPONIBILIDAD.map((e) => [e.id, 0]));
  for (const m of modelos) conteo[estadoDe(disponibilidad, m.nombre)] += 1;
  return conteo;
}
