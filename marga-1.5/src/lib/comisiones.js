// Reglas de comisión de Marga 2.0. Puro y determinista: recibe números y
// configuración, devuelve números. No toca React, el store ni Date.now().
//
// Fórmula, de arriba hacia abajo:
//   comisionTotal    = montoFinanciado × 0.9575 × (0.03 motoxpress | 0.04 resto)
//   comisionVendedor = comisionTotal × racha(numeroVenta)
//   comisionPromotor = comisionTotal × 0.10, o 0 si nadie está asignado
//   netoAdmin        = comisionTotal − comisionVendedor − comisionPromotor
//
// El 4.25% se descuenta del monto financiado ANTES de la tasa, así que la
// comisión total que se muestra ya es neta y tanto el promotor como el neto
// admin cuelgan de esa cifra.

const DAY = 86_400_000;

/** Factor que deja el monto financiado neto del 4.25%. */
export const DESCUENTO = 0.9575;

/** Porcentaje de la comisión total que se lleva el vendedor, por nivel. */
export const NIVELES_RACHA = [0.15, 0.2, 0.25, 0.3, 0.35];

/** Porcentaje fijo del promotor sobre la comisión total. */
export const TASA_PROMOTOR = 0.1;

/** Nombre mostrado cuando un proceso no tiene promotor encargado. */
export const PROMOTOR_DEFAULT = 'Braulio Acosta';

export const CONFIG_DEFAULT = {
  diaInicioMes: 1, // 1..28
  diaCorte: 1, // 1 = lunes … 7 = domingo (ISO)
  diaPago: 5, // 5 = viernes
  notaVendedores: '',
  excepciones: [], // [{ id, desde, hasta, fechaPago, nota }]
};

/** 3% para cualquier variante de motoxpress, 4% para el resto. */
export function tasaPara(esquemaId) {
  return String(esquemaId).startsWith('motoxpress') ? 0.03 : 0.04;
}

/** Nivel de racha 1..5, con tope en 5. */
export function nivelRacha(numeroVenta) {
  return Math.min(Math.max(numeroVenta, 1), NIVELES_RACHA.length);
}

export function porcentajeRacha(numeroVenta) {
  return NIVELES_RACHA[nivelRacha(numeroVenta) - 1];
}

/** Desglose completo de una comisión. */
export function calcularComision({
  montoFinanciado,
  esquemaId,
  numeroVenta,
  tienePromotor,
}) {
  const tasa = tasaPara(esquemaId);
  const comisionTotal = montoFinanciado * DESCUENTO * tasa;
  const nivel = nivelRacha(numeroVenta);
  const pct = NIVELES_RACHA[nivel - 1];
  const comisionVendedor = comisionTotal * pct;
  const comisionPromotor = tienePromotor ? comisionTotal * TASA_PROMOTOR : 0;

  return {
    tasa,
    comisionTotal,
    nivelRacha: nivel,
    porcentajeRacha: pct,
    comisionVendedor,
    comisionPromotor,
    netoAdmin: comisionTotal - comisionVendedor - comisionPromotor,
  };
}

/** Medianoche local del día que contiene `ts`. */
function startOfDay(ts) {
  const d = new Date(ts);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** Día de la semana ISO: 1 = lunes … 7 = domingo. */
function isoDow(ts) {
  return ((new Date(ts).getDay() + 6) % 7) + 1;
}

/** Medianoche del lunes de la semana que contiene `ts`. */
function startOfWeek(ts) {
  return startOfDay(ts) - (isoDow(ts) - 1) * DAY;
}

/** Dos dígitos con cero a la izquierda. */
const pad2 = (n) => String(n).padStart(2, '0');

/**
 * Clave `YYYY-MM` del "mes de venta" que contiene `ts`.
 * El periodo arranca el día `diaInicioMes`: con 26, una venta del 20 de
 * septiembre pertenece al periodo que abrió el 26 de agosto → '2026-08'.
 */
export function mesVenta(ts, config = CONFIG_DEFAULT) {
  const inicio = config.diaInicioMes ?? 1;
  const d = new Date(ts);
  let year = d.getFullYear();
  let month = d.getMonth(); // 0-based
  if (d.getDate() < inicio) {
    month -= 1;
    if (month < 0) {
      month = 11;
      year -= 1;
    }
  }
  return `${year}-${pad2(month + 1)}`;
}

/** Timestamp utilizable: número finito (no null, string, NaN ni Infinity). */
const esFecha = (v) => typeof v === 'number' && Number.isFinite(v);

/** Día ISO de la semana válido: entero de 1 (lunes) a 7 (domingo). */
const esDiaSemana = (v) => Number.isInteger(v) && v >= 1 && v <= 7;

/**
 * La excepción que cubre `ts`, o null. `hasta` se toma como día completo.
 * Se ignora cualquier excepción con `desde`, `hasta` o `fechaPago` que no sea
 * un número finito: `startOfDay(null)` es 1970, así que una excepción con
 * `desde: null` cubriría todo el histórico.
 */
function excepcionPara(ts, config) {
  const dia = startOfDay(ts);
  const lista = Array.isArray(config.excepciones) ? config.excepciones : [];
  return (
    lista.find(
      (e) =>
        e &&
        esFecha(e.desde) &&
        esFecha(e.hasta) &&
        esFecha(e.fechaPago) &&
        dia >= startOfDay(e.desde) &&
        dia <= startOfDay(e.hasta),
    ) ?? null
  );
}

/**
 * Fecha en que se paga una venta facturada en `ts`.
 * 1. Si una excepción cubre el día, manda su `fechaPago`.
 * 2. Si no: facturar en o antes del día de corte se paga el día de pago de esa
 *    misma semana; después del corte se recorre a la semana siguiente.
 * Cuando el día de pago no va después del día de corte, se corre una semana
 * más, porque no se puede pagar antes de cerrar.
 */
export function fechaPago(ts, config = CONFIG_DEFAULT) {
  const excepcion = excepcionPara(ts, config);
  if (excepcion) return startOfDay(excepcion.fechaPago);

  // Fuera de 1..7 (0, 8, '1', null, 2.5…) se usa el default.
  const diaCorte = esDiaSemana(config.diaCorte) ? config.diaCorte : CONFIG_DEFAULT.diaCorte;
  const diaPago = esDiaSemana(config.diaPago) ? config.diaPago : CONFIG_DEFAULT.diaPago;

  let semana = startOfWeek(ts);
  if (isoDow(ts) > diaCorte) semana += 7 * DAY;
  if (diaPago <= diaCorte) semana += 7 * DAY;

  return semana + (diaPago - 1) * DAY;
}

/**
 * Número de venta (posición en la racha) que le toca a una comisión nueva o
 * movida de mes: las comisiones que ya lleva `vendedor` en el mes de venta
 * `clave`, más uno. `excluirId` deja fuera la propia comisión cuando se edita,
 * para que no se cuente a sí misma. Fuente única para db.js, el modal de
 * facturación y la racha del panel de Comisiones.
 */
export function numeroVentaPara(comisiones, { vendedor, clave, excluirId = null }) {
  const lista = Array.isArray(comisiones) ? comisiones : [];
  const previas = lista.filter(
    (c) =>
      c.vendedor === vendedor && c.mesVenta === clave && (excluirId == null || c.id !== excluirId),
  );
  return previas.length + 1;
}
