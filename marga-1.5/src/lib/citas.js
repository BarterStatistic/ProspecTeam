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
