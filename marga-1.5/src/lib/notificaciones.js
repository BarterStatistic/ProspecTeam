// Textos de las notificaciones: las que recibe el vendedor dueño de una
// tarjeta y las que recibe el admin cuando un vendedor pasa un prospecto a
// Procesos o agenda una cita. Funciones puras: el disparo y la persistencia
// viven en db.js.

import { BOARD_COLUMNS } from './constants.js';
import { formatDate, formatDateTime, formatMXN } from './format.js';

// Re-exportado por comodidad: los mensajes de comisión ya lo usan y así los
// consumidores de este módulo no necesitan dos importaciones.
export { formatMXN };

export const TIPOS = {
  COLUMNA: 'columna',
  ENTREGA: 'entrega',
  FACTURACION: 'facturacion',
  EDICION: 'edicion',
  // Para el admin:
  PROCESO_NUEVO: 'proceso_nuevo',
  CITA_NUEVA: 'cita_nueva',
};

/** Etiqueta legible de una columna de Procesos; cae al id si no la reconoce. */
function labelDeColumna(stage) {
  return BOARD_COLUMNS.procesos.find((c) => c.id === stage)?.label ?? stage;
}

export function mensajeColumna(nombreCliente, stage) {
  return `${nombreCliente} ya pasó a ${labelDeColumna(stage)}`;
}

export function mensajeEntrega(nombreCliente) {
  return `La moto de ${nombreCliente} ya ha sido entregada`;
}

export function mensajeFacturacion(nombreCliente, comisionVendedor, fechaPagoTs) {
  return (
    `Se facturó la moto de ${nombreCliente} — tu comisión es ` +
    `${formatMXN(comisionVendedor)}, se paga el ${formatDate(fechaPagoTs)}`
  );
}

export function mensajeEdicion(nombreCliente, actor) {
  return `${actor} actualizó los datos de ${nombreCliente}`;
}

export function mensajeProcesoNuevo(vendedor, nombreCliente) {
  return `${vendedor} pasó a ${nombreCliente} a Procesos`;
}

export function mensajeCitaNueva(vendedor, nombreCliente, fechaCita, conHora) {
  const cuando = conHora ? formatDateTime(fechaCita) : formatDate(fechaCita);
  return `${vendedor} agendó una cita con ${nombreCliente} para el ${cuando}`;
}
