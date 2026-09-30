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
