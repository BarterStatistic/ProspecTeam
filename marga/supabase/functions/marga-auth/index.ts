// supabase/functions/marga-auth/index.ts
// Login de Marga. Se entra con nombre de usuario; la cuenta de Supabase Auth
// usa un correo interno derivado del id. Quien aún no migra se verifica contra
// su hash SHA-256 viejo (marga_legacy_passwords) y se le crea la cuenta de Auth
// con la misma contraseña en ese momento (migración perezosa).
// Desplegar con verify_jwt = false (se llama antes de tener sesión).
import { createClient } from 'npm:@supabase/supabase-js@2.117.3';
import {
  corsHeaders,
  findByUsername,
  GENERIC_LOGIN_ERROR,
  internalEmail,
  isLockedOut,
  LOCKOUT_ERROR,
  loginKey,
  MAX_USERNAME_KEY,
  nextFailureCount,
  sha256Hex,
} from '../_shared/authLogic.js';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const NO_SESSION = { auth: { persistSession: false, autoRefreshToken: false } };

const admin = createClient(SUPABASE_URL, SERVICE_KEY, NO_SESSION);

type Row = { id: string; data: { username: string; role: string }; auth_id: string | null };

function json(body: unknown, status: number, cors: Record<string, string>) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
}

const publicUser = (u: Row) => ({ id: u.id, username: u.data.username, role: u.data.role });

async function findUser(username: unknown): Promise<Row | null> {
  // Son pocos usuarios: se leen todos y se compara el nombre aquí.
  const { data, error } = await admin.from('marga_users').select('id, data, auth_id');
  if (error) throw error;
  return findByUsername(data as Row[], username) as Row | null;
}

function isInvalidCredentials(error: { code?: string; status?: number; message?: string }) {
  return (
    error.code === 'invalid_credentials' ||
    (error.status === 400 && /invalid login credentials/i.test(error.message ?? ''))
  );
}

/** null SOLO si la contraseña es inválida; cualquier otro error se lanza (500). */
async function signIn(userId: string, password: string) {
  const client = createClient(SUPABASE_URL, SERVICE_KEY, NO_SESSION);
  const { data, error } = await client.auth.signInWithPassword({ email: internalEmail(userId), password });
  if (error) {
    if (isInvalidCredentials(error)) return null;
    throw error;
  }
  if (!data.session) throw new Error('Auth no devolvió sesión.');
  return { access_token: data.session.access_token, refresh_token: data.session.refresh_token };
}

class WeakPasswordError extends Error {}
const WEAK_PASSWORD_ERROR =
  'Tu contraseña ya no cumple la política de seguridad. Pide al administrador que la restablezca.';

async function migrate(u: Row, password: string) {
  const { data: legacy, error } = await admin
    .from('marga_legacy_passwords')
    .select('password_hash')
    .eq('user_id', u.id)
    .maybeSingle();
  if (error) throw error;
  if (!legacy || legacy.password_hash !== (await sha256Hex(password))) return false;

  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email: internalEmail(u.id),
    password,
    email_confirm: true,
  });
  if (createErr) {
    if (createErr.code === 'weak_password') throw new WeakPasswordError(createErr.message);
    throw createErr;
  }
  const { error: linkErr } = await admin.from('marga_users').update({ auth_id: created.user.id }).eq('id', u.id);
  if (linkErr) {
    await admin.auth.admin.deleteUser(created.user.id);
    throw linkErr;
  }
  await admin.from('marga_legacy_passwords').delete().eq('user_id', u.id);
  return true;
}

async function login(username: unknown, password: unknown) {
  if (typeof password !== 'string' || !password) return null;
  const u = await findUser(username);
  if (!u) return null;
  if (!u.auth_id && !(await migrate(u, password))) return null;
  const session = await signIn(u.id, password);
  return session ? { session, user: publicUser(u) } : null;
}

async function loginWithThrottle(body: Record<string, unknown>, cors: Record<string, string>) {
  const key = loginKey(body.username);
  if (key.length > MAX_USERNAME_KEY) return json({ error: GENERIC_LOGIN_ERROR }, 401, cors);
  const { data: row, error } = await admin
    .from('marga_login_failures')
    .select('username_key, failures, last_failure')
    .eq('username_key', key)
    .maybeSingle();
  if (error) throw error;
  if (isLockedOut(row, Date.now())) return json({ error: LOCKOUT_ERROR }, 429, cors);

  let result;
  try {
    result = await login(body.username, body.password);
  } catch (err) {
    if (err instanceof WeakPasswordError) return json({ error: WEAK_PASSWORD_ERROR }, 409, cors);
    throw err;
  }
  if (!result) {
    const { error: upErr } = await admin.from('marga_login_failures').upsert({
      username_key: key,
      failures: nextFailureCount(row, Date.now()),
      last_failure: new Date().toISOString(),
    });
    if (upErr) throw upErr;
    return json({ error: GENERIC_LOGIN_ERROR }, 401, cors);
  }
  await admin.from('marga_login_failures').delete().eq('username_key', key);
  return json(result, 200, cors);
}

Deno.serve(async (req) => {
  const cors = corsHeaders(req.headers.get('origin'));
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Método no permitido.' }, 405, cors);

  const body: unknown = await req.json().catch(() => null);
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return json({ error: 'Solicitud inválida.' }, 400, cors);
  }
  try {
    if ((body as Record<string, unknown>).action === 'login') {
      return await loginWithThrottle(body as Record<string, unknown>, cors);
    }
    return json({ error: 'Acción desconocida.' }, 400, cors);
  } catch (err) {
    console.error(err);
    return json({ error: 'No se pudo completar la solicitud. Intenta de nuevo.' }, 500, cors);
  }
});
