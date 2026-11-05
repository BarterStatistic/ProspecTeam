// supabase/functions/marga-usuarios/index.ts
// Gestor de usuarios de Marga. Crear, cambiar contraseña y borrar cuentas
// exige la llave de servicio (Auth admin), así que pasa por aquí y solo lo puede
// pedir un admin con sesión. Desplegar con verify_jwt = false (el JWT se revisa
// aquí mismo, para responder con CORS y mensajes en español).
import { createClient } from 'npm:@supabase/supabase-js@2.117.3';
import { corsHeaders, findByUsername, internalEmail, MIN_PASSWORD, ROLES, sha256Hex } from '../_shared/authLogic.js';

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

type Cors = Record<string, string>;
type Row = { id: string; data: Record<string, unknown>; auth_id: string | null };

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

function json(body: unknown, status: number, cors: Cors) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
}

async function allUsers(): Promise<Row[]> {
  const { data, error } = await admin.from('marga_users').select('id, data, auth_id');
  if (error) throw error;
  return data as Row[];
}

async function callerAdmin(req: Request) {
  const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!token) return null;
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) return null;
  const { data: row } = await admin.from('marga_users').select('id, data').eq('auth_id', data.user.id).maybeSingle();
  return row?.data?.role === 'admin' ? row : null;
}

function cleanName(value: unknown) {
  const name = String(value ?? '').trim();
  if (!name) throw new HttpError(400, 'Escribe un nombre de usuario.');
  return name;
}

function checkRole(role: unknown) {
  if (!ROLES.includes(String(role))) throw new HttpError(400, 'Rol inválido.');
  return String(role);
}

function checkPassword(password: unknown) {
  if (typeof password !== 'string' || password.length < MIN_PASSWORD) {
    throw new HttpError(400, `La contraseña debe tener al menos ${MIN_PASSWORD} caracteres.`);
  }
  return password;
}

function assertNameFree(users: Row[], name: string, exceptId: string | null) {
  const igual = findByUsername(users, name);
  if (igual && igual.id !== exceptId) throw new HttpError(409, 'Ya existe un usuario con ese nombre.');
}

const admins = (users: Row[]) => users.filter((u) => u.data?.role === 'admin').length;

async function create(body: Record<string, unknown>) {
  const users = await allUsers();
  const username = cleanName(body.username);
  const role = checkRole(body.role);
  const password = checkPassword(body.password);
  assertNameFree(users, username, null);

  const id = crypto.randomUUID();
  const { data: created, error } = await admin.auth.admin.createUser({
    email: internalEmail(id),
    password,
    email_confirm: true,
  });
  if (error) throw error;
  const data = { id, username, role, color: String(body.color ?? ''), photo: '', createdAt: Date.now() };
  const { error: insertErr } = await admin.from('marga_users').insert({ id, data, auth_id: created.user.id });
  if (insertErr) {
    await admin.auth.admin.deleteUser(created.user.id);
    throw insertErr;
  }
  return { ok: true, id };
}

async function update(body: Record<string, unknown>) {
  const users = await allUsers();
  const target = users.find((u) => u.id === String(body.id ?? ''));
  if (!target) throw new HttpError(404, 'El usuario ya no existe.');
  const username = cleanName(body.username);
  const role = checkRole(body.role);
  assertNameFree(users, username, target.id);
  if (target.data?.role === 'admin' && role !== 'admin' && admins(users) <= 1) {
    throw new HttpError(409, 'Debe existir al menos un administrador.');
  }
  const password = body.password ? checkPassword(body.password) : null;

  // `photo` no se toca: la pone cada quien en su perfil.
  const data = { ...target.data, username, role, color: String(body.color ?? '') };
  const { error } = await admin.from('marga_users').update({ data }).eq('id', target.id);
  if (error) throw error;

  if (password) {
    if (target.auth_id) {
      const { error: pwErr } = await admin.auth.admin.updateUserById(target.auth_id, { password });
      if (pwErr) throw pwErr;
    } else {
      // Aún no migra: su próximo login usará este hash y lo migrará.
      const { error: pwErr } = await admin
        .from('marga_legacy_passwords')
        .upsert({ user_id: target.id, password_hash: await sha256Hex(password) });
      if (pwErr) throw pwErr;
    }
  }
  return { ok: true };
}

async function remove(body: Record<string, unknown>, callerId: string) {
  const users = await allUsers();
  const target = users.find((u) => u.id === String(body.id ?? ''));
  if (!target) throw new HttpError(404, 'El usuario ya no existe.');
  if (target.id === callerId) throw new HttpError(400, 'No puedes eliminar tu propia cuenta.');
  if (target.data?.role === 'admin' && admins(users) <= 1) {
    throw new HttpError(409, 'Debe existir al menos un administrador.');
  }
  const { error } = await admin.from('marga_users').delete().eq('id', target.id);
  if (error) throw error;
  if (target.auth_id) {
    const { error: delErr } = await admin.auth.admin.deleteUser(target.auth_id);
    if (delErr) console.error('No se pudo borrar la cuenta de Auth', target.auth_id, delErr);
  }
  return { ok: true };
}

Deno.serve(async (req) => {
  const cors = corsHeaders(req.headers.get('origin'));
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Método no permitido.' }, 405, cors);

  try {
    const caller = await callerAdmin(req);
    if (!caller) return json({ error: 'No tienes permiso para esta acción.' }, 403, cors);
    const body: unknown = await req.json().catch(() => null);
    if (typeof body !== 'object' || body === null || Array.isArray(body)) {
      return json({ error: 'Solicitud inválida.' }, 400, cors);
    }
    const b = body as Record<string, unknown>;
    switch (b.action) {
      case 'create':
        return json(await create(b), 200, cors);
      case 'update':
        return json(await update(b), 200, cors);
      case 'delete':
        return json(await remove(b, caller.id), 200, cors);
      default:
        return json({ error: 'Acción desconocida.' }, 400, cors);
    }
  } catch (err) {
    if (err instanceof HttpError) return json({ error: err.message }, err.status, cors);
    console.error(err);
    return json({ error: 'No se pudo completar la solicitud. Intenta de nuevo.' }, 500, cors);
  }
});
