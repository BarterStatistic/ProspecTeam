// Helpers puros sobre las citas (agenda compartida). Sin acceso al store.

/**
 * Cuántas citas están agendadas para el día de `now` (fecha de la cita, no de
 * captura), atendidas o no. Es el número del badge de "Citas" en el menú.
 */
export function contarCitasDeHoy(citas, now = Date.now()) {
  const d = new Date(now);
  const inicio = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const fin = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime();
  const lista = Array.isArray(citas) ? citas : [];
  return lista.filter(
    (c) => typeof c?.fechaCita === 'number' && c.fechaCita >= inicio && c.fechaCita < fin,
  ).length;
}

/**
 * Folio corto de una cita para el vale: los primeros 8 caracteres
 * alfanuméricos de su id, en mayúsculas. Sirve para validar el vale contra la
 * agenda al llegar el cliente.
 */
export function folioCita(cita) {
  const limpio = String(cita?.id ?? '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  return limpio.slice(0, 8) || 'SIN-FOLIO';
}

// ---------------------------------------------------------------------------
// Estados de una cita: confirmación (la maneja el vendedor) y asistencia (la
// registran admin y promotor). Ambos son opcionales en el registro: una cita
// vieja o manual sin ellos se lee como 'pendiente' y, si tiene `atendida`,
// como que el cliente asistió.
// ---------------------------------------------------------------------------

export const CONFIRMACION = {
  pendiente: { label: 'Por confirmar' },
  confirmada: { label: 'Confirmada' },
  no_confirmada: { label: 'No confirmada' },
  reagendada: { label: 'Reagendada' },
};

export const ASISTENCIA = {
  pendiente: { label: 'Por atender' },
  asistio: { label: 'Asistió' },
  no_asistio: { label: 'No asistió' },
};

/** Confirmación de la cita; desconocido o ausente = 'pendiente'. */
export function confirmacionDe(cita) {
  const v = cita?.confirmacion;
  return Object.hasOwn(CONFIRMACION, v) ? v : 'pendiente';
}

/**
 * Asistencia del cliente. Sin campo `asistencia`: `noAsistio` (marca vieja de
 * "Mi día") cuenta como 'no_asistio' y una cita `atendida` como 'asistio'.
 */
export function asistenciaDe(cita) {
  const v = cita?.asistencia;
  if (Object.hasOwn(ASISTENCIA, v)) return v;
  if (cita?.noAsistio) return 'no_asistio'; // marca vieja de "Mi día"
  return cita?.atendida ? 'asistio' : 'pendiente';
}

/** True si la cita la agendó Alex (origen 'alex'). */
export function esDeAlex(cita) {
  return cita?.origen === 'alex';
}

/** Cambios para guardar una confirmación. */
export function patchConfirmacion(valor) {
  if (!Object.hasOwn(CONFIRMACION, valor)) throw new Error(`Confirmación desconocida: ${valor}`);
  return { confirmacion: valor };
}

/**
 * Cambios para guardar la asistencia. Mantiene `atendida` (true solo si asistió)
 * junto con la nota y la fecha en que se registró; 'pendiente' los limpia.
 */
export function patchAsistencia(valor, nota = '', ahora = Date.now()) {
  if (!Object.hasOwn(ASISTENCIA, valor)) throw new Error(`Asistencia desconocida: ${valor}`);
  if (valor === 'pendiente') {
    return { asistencia: 'pendiente', atendida: false, notaAtencion: '', fechaAtencion: null };
  }
  return {
    asistencia: valor,
    atendida: valor === 'asistio',
    notaAtencion: nota,
    fechaAtencion: ahora,
  };
}
