// Password hashing for app-level accounts. SHA-256 via Web Crypto (available on
// localhost and any HTTPS origin). This is an internal tool: it keeps plaintext
// passwords out of the database, but it is not a substitute for real auth.

export async function hashPassword(password) {
  if (!crypto?.subtle) {
    throw new Error(
      'Este navegador requiere HTTPS (o localhost) para iniciar sesión de forma segura.',
    );
  }
  const bytes = new TextEncoder().encode(String(password));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function verifyPassword(password, passwordHash) {
  const hash = await hashPassword(password);
  return hash === passwordHash;
}

// ---------------------------------------------------------------------------
// Sesión. Lo único que se guarda en sessionStorage es { id, firma }: el nombre
// y el rol NUNCA salen de ahí, se leen siempre del registro vivo de `users`.
// Así, editar sessionStorage a mano no da un rol que la base no tiene, y un
// cambio de rol, de contraseña o un borrado hecho por el admin se aplica al
// instante en las sesiones abiertas.
//
// La firma depende del passwordHash: cambiar la contraseña invalida las
// sesiones abiertas de esa cuenta. Mientras las reglas de Firestore sigan
// abiertas los hashes se pueden leer desde la base, así que esto sube la
// barrera pero no sustituye a Firebase Auth.
// ---------------------------------------------------------------------------

/** Firma de sesión de un registro de usuario (no guarda el hash en crudo). */
export function firmaSesion(record) {
  return hashPassword(`marga-sesion:${record.id}:${record.passwordHash ?? ''}`);
}

/**
 * Valida una sesión guardada contra la lista viva de usuarios.
 * - `undefined`: la lista todavía no llega (nunca está vacía: se siembra al
 *   arrancar), hay que esperar.
 * - `null`: la sesión no es válida (usuario borrado, contraseña cambiada o
 *   sesión alterada / de una versión anterior).
 * - `{ id, username, role }`: el usuario, con nombre y rol tomados de la base.
 */
export async function verificarSesion(session, users) {
  if (!session?.id || !session?.firma) return null;
  if (!Array.isArray(users) || users.length === 0) return undefined;
  const record = users.find((u) => u.id === session.id);
  if (!record) return null;
  if ((await firmaSesion(record)) !== session.firma) return null;
  return { id: record.id, username: record.username, role: record.role };
}
