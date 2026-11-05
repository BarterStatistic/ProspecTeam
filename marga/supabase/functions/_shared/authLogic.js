// Lógica pura del login de Marga con Supabase Auth. JS plano, sin
// dependencias: la importan las Edge Functions (Deno), la app (Vite) y las
// pruebas (Vitest). Puerto del patrón de InstaTech CRM (2026-10-09).

export const GENERIC_LOGIN_ERROR = 'Usuario o contraseña incorrectos.';
export const ROLES = ['admin', 'vendedor', 'promotor'];
export const MIN_PASSWORD = 6;
// Freno por nombre de usuario: tras 5 fallos seguidos, 15 minutos sin intentar.
export const MAX_LOGIN_FAILURES = 5;
export const LOCKOUT_MINUTES = 15;
// Un nombre más largo no es de nadie y no debe escribir filas en el freno.
export const MAX_USERNAME_KEY = 64;
export const LOCKOUT_ERROR = 'Demasiados intentos fallidos. Espera 15 minutos e intenta de nuevo.';

const INTERNAL_EMAIL_DOMAIN = 'marga.local';

/**
 * Correo de la cuenta de Auth. Sale del id del usuario de Marga (no del nombre)
 * para que renombrar a alguien no rompa su cuenta. Nadie lo ve ni lo escribe.
 */
export function internalEmail(userId) {
  if (!userId) throw new Error('Falta el id del usuario.');
  return `${String(userId).toLowerCase()}@${INTERNAL_EMAIL_DOMAIN}`;
}

/** El id de Marga a partir del correo interno de la sesión (o null). */
export function userIdFromEmail(email) {
  const m = String(email ?? '').match(/^(.+)@marga\.local$/i);
  return m ? m[1] : null;
}

/** SHA-256 en hexadecimal, igual que `hashPassword` de la versión anterior. */
export async function sha256Hex(text) {
  const bytes = new TextEncoder().encode(String(text));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// Producción (Firebase Hosting), sus canales de vista previa y el dev local.
const ORIGENES = [
  /^https:\/\/marga-6bb72\.(web\.app|firebaseapp\.com)$/,
  /^https:\/\/marga-6bb72--[a-z0-9-]+\.web\.app$/,
  /^http:\/\/localhost:517\d$/,
];

/** El origen si puede llamar a las funciones; si no, null. */
export function allowedOrigin(origin) {
  if (!origin) return null;
  return ORIGENES.some((re) => re.test(origin)) ? origin : null;
}

export function corsHeaders(origin) {
  const allowed = allowedOrigin(origin);
  if (!allowed) return { Vary: 'Origin' };
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  };
}

/** Clave del freno: el nombre sin espacios a los lados y en minúsculas. */
export function loginKey(username) {
  return String(username ?? '').trim().toLowerCase();
}

/** Busca por nombre (sin distinguir mayúsculas) entre filas `{ id, data }`. */
export function findByUsername(rows, username) {
  const key = loginKey(username);
  if (!key) return null;
  const exact = (rows ?? []).filter((r) => loginKey(r.data?.username) === key);
  return exact.length === 1 ? exact[0] : null;
}

const LOCKOUT_MS = LOCKOUT_MINUTES * 60000;

/** Bloqueado si hay 5 o más fallos y el último cae dentro de la ventana. */
export function isLockedOut(row, nowMs) {
  return Boolean(row && row.failures >= MAX_LOGIN_FAILURES && nowMs - Date.parse(row.last_failure) < LOCKOUT_MS);
}

/** Fallos después de uno más: si la ventana ya venció, vuelve a empezar en 1. */
export function nextFailureCount(row, nowMs) {
  if (row && nowMs - Date.parse(row.last_failure) < LOCKOUT_MS) return row.failures + 1;
  return 1;
}
