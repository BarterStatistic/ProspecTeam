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
