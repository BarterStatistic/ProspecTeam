// Reglas de comisión de Marga 2.0. Puro y determinista: recibe números y
// configuración, devuelve números. No toca React, el store ni Date.now().
//
// Fórmula, de arriba hacia abajo:
//   comisionTotal    = montoFinanciado × (0.03 motoxpress | 0.04 resto)
//   comisionVendedor = comisionTotal × racha(numeroVenta) × 0.9575
//   comisionPromotor = comisionTotal × 0.10 × 0.9575, o 0 si nadie está asignado
//   netoAdmin        = comisionTotal − comisionVendedor − comisionPromotor
//
// El 4.25% NO se descuenta de la comisión total (esa cifra es la que se
// reparte): se descuenta de cada pago individual a vendedor y promotor. El
// neto admin sale de restarle a la comisión total esos dos pagos ya con su
// propio descuento aplicado, así que absorbe el 4.25% que no se les entregó.

const DAY = 86_400_000;

/** Factor que deja neto del 4.25% el pago individual de vendedor y promotor. */
export const DESCUENTO = 0.9575;

/** Porcentaje de la comisión total que se lleva el vendedor, por nivel. */
export const NIVELES_RACHA = [0.15, 0.2, 0.25, 0.3, 0.35];

/** Porcentaje fijo del promotor sobre la comisión total. */
export const TASA_PROMOTOR = 0.1;

/** Nombre mostrado cuando un proceso no tiene promotor encargado. */
export const PROMOTOR_DEFAULT = 'Braulio Acosta';

export const CONFIG_DEFAULT = {
  diaInicioMes: 1, // 1..28 — regla de respaldo para días sin mes de venta registrado
  periodosVenta: [], // [{ id, clave: 'YYYY-MM', inicio, fin }] — meses de venta explícitos
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
  const comisionTotal = montoFinanciado * tasa;
  const nivel = nivelRacha(numeroVenta);
  const pct = NIVELES_RACHA[nivel - 1];
  const comisionVendedor = comisionTotal * pct * DESCUENTO;
  const comisionPromotor = tienePromotor ? comisionTotal * TASA_PROMOTOR * DESCUENTO : 0;

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

/** Clave `YYYY-MM` válida (mes 01..12). */
const esClaveMes = (v) => typeof v === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(v);

/** Corre una clave `YYYY-MM` `delta` meses (±). */
export function sumarMes(clave, delta) {
  const [y, m] = clave.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
}

/** "Octubre 2026" a partir de `2026-10`. */
export function etiquetaMes(clave) {
  if (!esClaveMes(clave)) return String(clave ?? '');
  const [y, m] = clave.split('-').map(Number);
  const mes = new Date(y, m - 1, 1).toLocaleDateString('es-MX', { month: 'long' });
  return `${mes.charAt(0).toUpperCase()}${mes.slice(1)} ${y}`;
}

/**
 * Meses de venta registrados por el admin que se pueden usar: clave válida,
 * fechas numéricas y fin no anterior al inicio. Ordenados por inicio.
 */
export function periodosVenta(config = CONFIG_DEFAULT) {
  const lista = Array.isArray(config?.periodosVenta) ? config.periodosVenta : [];
  return lista
    .filter(
      (p) =>
        p &&
        esClaveMes(p.clave) &&
        esFecha(p.inicio) &&
        esFecha(p.fin) &&
        startOfDay(p.fin) >= startOfDay(p.inicio),
    )
    .sort((a, b) => a.inicio - b.inicio);
}

/** El mes de venta registrado que cubre el día de `ts` (fin inclusivo), o null. */
export function periodoVentaPara(ts, config = CONFIG_DEFAULT) {
  const dia = startOfDay(ts);
  return (
    periodosVenta(config).find(
      (p) => dia >= startOfDay(p.inicio) && dia <= startOfDay(p.fin),
    ) ?? null
  );
}

/** El mes de venta registrado con esa clave, o null. */
export function periodoPorClave(clave, config = CONFIG_DEFAULT) {
  return periodosVenta(config).find((p) => p.clave === clave) ?? null;
}

/** Regla de respaldo: el periodo arranca el día `diaInicioMes` de cada mes. */
function mesVentaPorDia(ts, config) {
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

/**
 * Clave `YYYY-MM` del "mes de venta" que contiene `ts`. Define la duración de
 * la racha: todas las ventas de un vendedor con la misma clave suman a la
 * misma racha.
 *
 * 1. Si el admin registró un mes de venta cuyo rango (inicio–fin, días
 *    completos) cubre el día, manda su clave.
 * 2. Si no, la regla por día: el periodo arranca el día `diaInicioMes`. Con 26,
 *    una venta del 20 de septiembre pertenece al periodo que abrió el 26 de
 *    agosto → '2026-08'.
 *    Si esa clave ya la ocupa un mes registrado (cuyo rango no cubre el día),
 *    se recorre al mes siguiente —o al anterior, si el día cae antes de ese
 *    rango— hasta dar con una libre: un día fuera del rango de octubre no
 *    debe sumar a la racha de octubre.
 */
export function mesVenta(ts, config = CONFIG_DEFAULT) {
  const cubre = periodoVentaPara(ts, config);
  if (cubre) return cubre.clave;

  let clave = mesVentaPorDia(ts, config);
  const periodos = periodosVenta(config);
  const ocupante = periodos.find((p) => p.clave === clave);
  if (!ocupante) return clave;

  const paso = startOfDay(ts) > startOfDay(ocupante.fin) ? 1 : -1;
  const ocupadas = new Set(periodos.map((p) => p.clave));
  while (ocupadas.has(clave)) clave = sumarMes(clave, paso);
  return clave;
}

/**
 * Comisiones cuyo `mesVenta` guardado ya no coincide con el que les toca con
 * `config` (p. ej. tras registrar o editar un mes de venta).
 * Devuelve [{ id, de, a }].
 */
export function cambiosDeMesVenta(comisiones, config = CONFIG_DEFAULT) {
  const lista = Array.isArray(comisiones) ? comisiones : [];
  const cambios = [];
  for (const c of lista) {
    if (!esFecha(c?.fechaFacturacion)) continue;
    const a = mesVenta(c.fechaFacturacion, config);
    if (a !== c.mesVenta) cambios.push({ id: c.id, de: c.mesVenta, a });
  }
  return cambios;
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

/**
 * Agrupa comisiones (con su `fechaPagoTs` ya derivada) por fecha de pago, en el
 * orden en que se consultan: primero los pagos pendientes, del más cercano al
 * más lejano, y después los ya pasados, del más reciente al más viejo. Solo el
 * primer pago pendiente (el de hoy cuenta como pendiente) lleva `proximo`.
 * Devuelve [{ ts, filas, proximo }].
 */
export function agruparPorPago(comisiones, ahora) {
  const hoy = startOfDay(ahora);
  const porFecha = new Map();
  for (const c of comisiones) {
    if (!porFecha.has(c.fechaPagoTs)) porFecha.set(c.fechaPagoTs, []);
    porFecha.get(c.fechaPagoTs).push(c);
  }
  const fechas = [...porFecha.keys()];
  const pendientes = fechas.filter((ts) => ts >= hoy).sort((a, b) => a - b);
  const pasados = fechas.filter((ts) => ts < hoy).sort((a, b) => b - a);
  return [...pendientes, ...pasados].map((ts, i) => ({
    ts,
    filas: porFecha.get(ts),
    proximo: i === 0 && ts >= hoy,
  }));
}
