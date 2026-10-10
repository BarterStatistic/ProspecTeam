// Performance analytics for the Panel ADMIN. Pure functions over the clients /
// citas arrays — no React, no store access — so the view stays a thin renderer.
//
// Which timestamp anchors a record to the selected range depends on the event
// being measured:
//   registro    → createdAt        (when the client was captured)
//   venta       → fechaEntrega     (when the motorcycle was delivered)
//   cancelación → fechaCancelacion (when the client was cancelled)
//   cita        → fechaCita        (when the appointment is scheduled)
//
// The stage funnel is the one exception: Marga stores no movement history, so
// it can only describe the CURRENT position of each card. The view labels it as
// such instead of pretending it is period data.

import { BOARD_COLUMNS, UNASSIGNED_LABEL } from './constants.js';

/** Sentinel used as the createdBy key for records with no seller. */
export const UNASSIGNED_KEY = '__unassigned__';

/** Display name for a createdBy value (empty → "Sin asignar"). */
export function sellerLabel(key) {
  return key === UNASSIGNED_KEY ? UNASSIGNED_LABEL : key;
}

const keyOf = (record) => record.createdBy || UNASSIGNED_KEY;

/** True when `ts` falls inside [from, to]; null bounds mean "no limit". */
export function inRange(ts, from, to) {
  if (!ts) return false;
  if (from != null && ts < from) return false;
  if (to != null && ts > to) return false;
  return true;
}

const DAY = 86_400_000;

/** Start-of-day timestamp for `ts` in local time. */
function startOfDay(ts) {
  const d = new Date(ts);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** Monday 00:00 of the week containing `ts` (es-MX weeks run Mon–Sun). */
function startOfWeek(ts) {
  const d = new Date(startOfDay(ts));
  const dow = (d.getDay() + 6) % 7; // 0 = Monday
  return d.getTime() - dow * DAY;
}

/** Lunes 00:00 de la semana que contiene `now`. */
export function startOfThisWeek(now = Date.now()) {
  return startOfWeek(now);
}

/**
 * Domingo 00:00 de la semana que contiene `now` (último día de la semana
 * lunes–domingo). Se arma con el calendario, no sumando 6 × 24 h, para que un
 * cambio de horario no lo corra al sábado.
 */
export function endOfThisWeek(now = Date.now()) {
  const lunes = new Date(startOfWeek(now));
  return new Date(lunes.getFullYear(), lunes.getMonth(), lunes.getDate() + 6).getTime();
}

/**
 * Límites para los KPIs de dinero, que filtran por fecha de PAGO. A diferencia
 * de `resolveRange`, no se derivan de los datos ni se cortan en "hoy": sin
 * fecha final, cuentan también los pagos futuros. `null` = sin límite
 * (mismo contrato que `inRange`). `hasta` incluye el día completo.
 */
export function rangoPagos(desde, hasta) {
  return {
    from: desde ?? null,
    to: hasta != null ? hasta + (DAY - 1) : null,
  };
}

function startOfMonth(ts) {
  const d = new Date(ts);
  return new Date(d.getFullYear(), d.getMonth(), 1).getTime();
}

/**
 * Bucket size for the time series, picked from the span so the chart never
 * renders hundreds of points: ≤45 days → daily, ≤52 weeks → weekly, else monthly.
 */
export function pickBucket(from, to) {
  const days = Math.max(1, Math.round((to - from) / DAY) + 1);
  if (days <= 45) return 'dia';
  if (days <= 370) return 'semana';
  return 'mes';
}

const BUCKET_START = { dia: startOfDay, semana: startOfWeek, mes: startOfMonth };

/** Advance one bucket forward from a bucket-start timestamp. */
function nextBucket(ts, bucket) {
  if (bucket === 'dia') return ts + DAY;
  if (bucket === 'semana') return ts + 7 * DAY;
  const d = new Date(ts);
  return new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime();
}

/**
 * Effective bounds for the filter. `desde`/`hasta` are ms at local midnight
 * (from fromDateInput) or null. The upper bound extends to the end of that day
 * so "hasta" is inclusive. When a bound is missing, it is derived from the data
 * so charts still have a finite axis.
 */
export function resolveRange(desde, hasta, clients, citas) {
  const stamps = [];
  for (const c of clients) {
    for (const ts of [c.createdAt, c.fechaEntrega, c.fechaCancelacion]) if (ts) stamps.push(ts);
  }
  for (const c of citas) if (c.fechaCita) stamps.push(c.fechaCita);

  const now = Date.now();
  const from = desde ?? (stamps.length ? Math.min(...stamps) : now - 29 * DAY);
  const to = hasta != null ? hasta + (DAY - 1) : Math.max(now, ...(stamps.length ? stamps : [now]));
  return { from, to: Math.max(from, to) };
}

/**
 * Per-seller totals inside the range.
 * `sellers` restricts the result (and its order); when empty, every seller
 * present in the data is included.
 * Returns [{ key, label, registros, ventas, cancelados, citas, citasAtendidas,
 *            enProceso, conversion, cancelacion }].
 */
export function sellerStats(clients, citas, from, to, sellers = []) {
  const rows = new Map();
  const want = new Set(sellers);
  const include = (key) => want.size === 0 || want.has(key);

  const row = (key) => {
    if (!rows.has(key)) {
      rows.set(key, {
        key,
        label: sellerLabel(key),
        registros: 0,
        ventas: 0,
        cancelados: 0,
        citas: 0,
        citasAtendidas: 0,
        enProceso: 0,
      });
    }
    return rows.get(key);
  };

  // Seed the requested sellers so someone with zero activity still shows up.
  for (const s of sellers) row(s);

  for (const c of clients) {
    const key = keyOf(c);
    if (!include(key)) continue;
    if (inRange(c.createdAt, from, to)) row(key).registros++;
    if (c.section === 'ventas' && inRange(c.fechaEntrega ?? c.updatedAt, from, to)) row(key).ventas++;
    if (c.section === 'cancelados' && inRange(c.fechaCancelacion ?? c.updatedAt, from, to))
      row(key).cancelados++;
    // Current pipeline load — not a period metric, shown as context.
    if (c.section === 'prospectos' || c.section === 'procesos') row(key).enProceso++;
  }

  for (const c of citas) {
    const key = keyOf(c);
    if (!include(key)) continue;
    if (!inRange(c.fechaCita, from, to)) continue;
    row(key).citas++;
    if (c.atendida) row(key).citasAtendidas++;
  }

  return [...rows.values()]
    .map((r) => ({
      ...r,
      // Conversion compares deliveries against captures in the same window: an
      // approximation, since a sale closed today may come from an older prospect.
      conversion: r.registros ? (r.ventas / r.registros) * 100 : 0,
      cancelacion: r.registros ? (r.cancelados / r.registros) * 100 : 0,
    }))
    .sort((a, b) => b.ventas - a.ventas || b.registros - a.registros);
}

/** Totals across every selected seller (same shape as a stats row). */
export function totals(rows) {
  const sum = (field) => rows.reduce((acc, r) => acc + r[field], 0);
  const registros = sum('registros');
  const ventas = sum('ventas');
  const cancelados = sum('cancelados');
  return {
    registros,
    ventas,
    cancelados,
    enProceso: sum('enProceso'),
    citas: sum('citas'),
    citasAtendidas: sum('citasAtendidas'),
    conversion: registros ? (ventas / registros) * 100 : 0,
    cancelacion: registros ? (cancelados / registros) * 100 : 0,
  };
}

/**
 * Time series of registros / ventas / cancelados, bucketed by day, week or month.
 * Returns [{ start, label, registros, ventas, cancelados }] covering the whole
 * range (including empty buckets, so gaps read as gaps).
 */
export function timeSeries(clients, from, to, sellers = []) {
  const bucket = pickBucket(from, to);
  const startFn = BUCKET_START[bucket];
  const want = new Set(sellers);
  const include = (key) => want.size === 0 || want.has(key);

  const buckets = new Map();
  for (let t = startFn(from); t <= to; t = nextBucket(t, bucket)) {
    buckets.set(t, { start: t, registros: 0, ventas: 0, cancelados: 0 });
  }

  const add = (ts, field) => {
    if (!inRange(ts, from, to)) return;
    const b = buckets.get(startFn(ts));
    if (b) b[field]++;
  };

  for (const c of clients) {
    if (!include(keyOf(c))) continue;
    add(c.createdAt, 'registros');
    if (c.section === 'ventas') add(c.fechaEntrega ?? c.updatedAt, 'ventas');
    if (c.section === 'cancelados') add(c.fechaCancelacion ?? c.updatedAt, 'cancelados');
  }

  return { bucket, points: [...buckets.values()].sort((a, b) => a.start - b.start) };
}

const dayFmt = new Intl.DateTimeFormat('es-MX', { day: '2-digit', month: 'short' });
const monthFmt = new Intl.DateTimeFormat('es-MX', { month: 'short', year: '2-digit' });

/** Axis label for a bucket start. */
export function bucketLabel(start, bucket) {
  if (bucket === 'mes') return monthFmt.format(new Date(start));
  return dayFmt.format(new Date(start));
}

/**
 * Current distribution of the selected sellers' cards across board columns.
 * Snapshot of where the pipeline stands today — no date filtering applies.
 * Returns [{ section, id, label, count }] for both boards.
 */
export function stageFunnel(clients, sellers = []) {
  const want = new Set(sellers);
  const include = (key) => want.size === 0 || want.has(key);
  const out = [];
  for (const section of ['prospectos', 'procesos']) {
    for (const col of BOARD_COLUMNS[section]) {
      out.push({
        section,
        id: `${section}:${col.id}`,
        label: col.label,
        count: clients.filter(
          (c) => c.section === section && c.stage === col.id && include(keyOf(c)),
        ).length,
      });
    }
  }
  return out;
}

/** Cancelled clients in the range that carry a rejection note, newest first. */
export function rejectionNotes(clients, from, to, sellers = [], limit = 12) {
  const want = new Set(sellers);
  const include = (key) => want.size === 0 || want.has(key);
  return clients
    .filter(
      (c) =>
        c.section === 'cancelados' &&
        include(keyOf(c)) &&
        (c.notasRechazo ?? '').trim() &&
        inRange(c.fechaCancelacion ?? c.updatedAt, from, to),
    )
    .sort((a, b) => (b.fechaCancelacion ?? b.updatedAt ?? 0) - (a.fechaCancelacion ?? a.updatedAt ?? 0))
    .slice(0, limit);
}

/**
 * Conteo de autorizaciones de Buró generadas por vendedor, dentro del rango.
 * `sellers` restringe el resultado; vacío = todo el equipo presente en los datos.
 * A diferencia de `sellerStats`, aquí solo hace falta un conteo (no una fila
 * completa) y no se siembran vendedores en cero: la vista consumidora usa `?? 0`.
 * Returns Map<sellerKey, count>.
 */
export function authorizationStats(autorizaciones, from, to, sellers = []) {
  const want = new Set(sellers);
  const include = (key) => want.size === 0 || want.has(key);
  const counts = new Map();
  for (const a of autorizaciones) {
    const key = keyOf(a);
    if (!include(key)) continue;
    if (!inRange(a.createdAt, from, to)) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

/**
 * Cotizaciones generadas por vendedor dentro del rango.
 * `sellers` vacío incluye a todos. Misma forma que authorizationStats.
 */
export function cotizacionStats(cotizaciones, from, to, sellers = []) {
  const want = new Set(sellers);
  const counts = new Map();
  for (const c of cotizaciones) {
    const key = c.createdBy || UNASSIGNED_KEY;
    if (want.size && !want.has(key)) continue;
    if (!inRange(c.createdAt, from, to)) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

/**
 * Every createdBy value present in the data, plus the unassigned bucket
 * (omitted when `incluirSinAsignar` is false).
 */
export function presentSellers(clients, citas, { incluirSinAsignar = true } = {}) {
  const set = new Set();
  let unassigned = false;
  for (const list of [clients, citas]) {
    for (const r of list) {
      if (r.createdBy) set.add(r.createdBy);
      else unassigned = true;
    }
  }
  const names = [...set].sort((a, b) => a.localeCompare(b));
  return unassigned && incluirSinAsignar ? [...names, UNASSIGNED_KEY] : names;
}
