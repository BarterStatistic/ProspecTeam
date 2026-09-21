// Small formatting helpers shared across views.

const dateTimeFmt = new Intl.DateTimeFormat('es-MX', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

const dateFmt = new Intl.DateTimeFormat('es-MX', {
  day: '2-digit',
  month: 'long',
  year: 'numeric',
});

/** Timestamp (ms) → "12 feb 2026, 14:30". Empty string for falsy input. */
export function formatDateTime(ts) {
  if (!ts) return '';
  return dateTimeFmt.format(new Date(ts));
}

/** Timestamp (ms) → "12 de febrero de 2026". Empty string for falsy input. */
export function formatDate(ts) {
  if (!ts) return '';
  return dateFmt.format(new Date(ts));
}

/** Timestamp (ms) → value for an <input type="date"> (YYYY-MM-DD), local time. */
export function toDateInput(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  const off = d.getTimezoneOffset() * 60000;
  return new Date(ts - off).toISOString().slice(0, 10);
}

/** "YYYY-MM-DD" from an <input type="date"> → timestamp (ms) at local midnight. */
export function fromDateInput(value) {
  if (!value) return null;
  const [y, m, d] = value.split('-').map(Number);
  return new Date(y, m - 1, d).getTime();
}

const mxn = new Intl.NumberFormat('es-MX', {
  style: 'currency',
  currency: 'MXN',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** 1386.55 → "$1,386.55". Intl añade el prefijo "MX$"; aquí sobra. */
export function formatMXN(n) {
  return mxn.format(n ?? 0).replace(/^MX\$\s*/, '$');
}

const mxn0 = new Intl.NumberFormat('es-MX', {
  style: 'currency',
  currency: 'MXN',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

/**
 * 1386.55 → "$1,387" (sin decimales). Mismo tratamiento del prefijo "MX$" que
 * formatMXN. Usada donde el dinero debe verse en pesos enteros — p. ej. el
 * cotizador, que reproduce al peso las cifras del cotizador original.
 */
export function formatMXN0(n) {
  return mxn0.format(n ?? 0).replace(/^MX\$\s*/, '$');
}
