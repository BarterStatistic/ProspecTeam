// supabase/functions/marga-bartersito/index.ts
// Chat con Bartersito desde Marga. Comprueba que quien escribe tenga sesión de
// ADMINISTRADOR y reenvía el mensaje a n8n con una clave que vive aquí, en el
// servidor: el navegador nunca conoce la dirección ni la clave de n8n.
//
// Desplegar con verify_jwt = false (el JWT se revisa aquí mismo, para responder
// con CORS y mensajes en español, igual que marga-usuarios).
//
// Secretos que necesita (Supabase → Edge Functions → Secrets):
//   BARTERSITO_WEBHOOK_URL     dirección del webhook de n8n para Marga
//   BARTERSITO_WEBHOOK_SECRET  clave compartida; viaja en el encabezado x-marga-secret
//
// Contrato con n8n:
//   envía   POST { texto, usuario, origen: 'marga' }  + encabezado x-marga-secret
//   recibe  { output | texto, grafica?: [{ label, value }] }
import { createClient } from 'npm:@supabase/supabase-js@2.117.3';
import { corsHeaders } from '../_shared/authLogic.js';
import { esAdmin, normalizarRespuesta, SOLO_ADMIN, USER_AGENT, validarMensaje } from '../_shared/bartersitoLogic.js';

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

type Cors = Record<string, string>;

function json(body: unknown, status: number, cors: Cors) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
}

/** La fila de marga_users de quien llama, solo si es administrador. */
async function callerAdmin(req: Request) {
  const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!token) return null;
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) return null;
  const { data: row } = await admin.from('marga_users').select('id, data').eq('auth_id', data.user.id).maybeSingle();
  return esAdmin(row) ? row : null;
}

Deno.serve(async (req) => {
  const cors = corsHeaders(req.headers.get('origin'));
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Método no permitido.' }, 405, cors);

  try {
    const quien = await callerAdmin(req);
    if (!quien) return json({ error: SOLO_ADMIN }, 403, cors);

    const cuerpo = await req.json().catch(() => ({}));
    const { texto, error } = validarMensaje(cuerpo?.texto);
    if (error) return json({ error }, 400, cors);

    const url = Deno.env.get('BARTERSITO_WEBHOOK_URL');
    const secreto = Deno.env.get('BARTERSITO_WEBHOOK_SECRET');
    if (!url || !secreto) {
      return json({ error: 'Bartersito todavía no está conectado a Marga.', sinConectar: true }, 503, cors);
    }

    // El agente puede tardar (consulta la base y Meta): hasta 100 segundos.
    const respuesta = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-marga-secret': secreto, 'User-Agent': USER_AGENT },
      body: JSON.stringify({ texto, usuario: quien.data?.username ?? quien.id, origen: 'marga' }),
      signal: AbortSignal.timeout(100_000),
    });
    if (!respuesta.ok) {
      console.error('marga-bartersito: n8n respondió', respuesta.status);
      return json({ error: 'Bartersito no pudo contestar. Intenta de nuevo.' }, 502, cors);
    }
    const salida = normalizarRespuesta(await respuesta.json().catch(() => null));
    if (!salida) return json({ error: 'Bartersito contestó vacío. Intenta de nuevo.' }, 502, cors);
    return json(salida, 200, cors);
  } catch (err) {
    const tardo = err instanceof DOMException && err.name === 'TimeoutError';
    console.error('marga-bartersito', err);
    return json(
      { error: tardo ? 'Bartersito tardó demasiado. Intenta con una pregunta más corta.' : 'Error interno.' },
      tardo ? 504 : 500,
      cors,
    );
  }
});
