// supabase/functions/marga-agencia/index.ts
// Decidir lo de la agencia desde Marga (Fase C, 2026-11-15): ideas, piezas, propuestas de Meta,
// campañas, cuentas y comentarios. Mismo patrón que marga-bartersito: solo ADMINISTRADOR, el JWT
// se revisa aquí y el navegador nunca ve los tokens de los botones.
//
// No decide por su cuenta: busca el token de la fila (llave de servicio) y llama al MISMO webhook
// de n8n que el botón de Telegram, con origen=marga. n8n llama a public.decidir_* (una sola
// puerta, sql/043), hace lo externo (Meta, Productor, aprendizaje) y edita el mensaje de Telegram.
// Si la fila ya no está pendiente, no llama a n8n y contesta "ya se decidió desde X".
//
// Desplegar con verify_jwt = false (como marga-usuarios y marga-bartersito).
// Secreto opcional: AGENCIA_WEBHOOK_BASE (por defecto el n8n de ProspecTeam).
//
// Contrato:
//   recibe  POST { tipo, id, accion, motivo?, texto?, cuando? }
//   regresa { ok, cambio, estado, desde, yaDecidida?, mensaje? } | { error }
import { createClient } from 'npm:@supabase/supabase-js@2.117.3';
import { corsHeaders } from '../_shared/authLogic.js';
import { esAdmin } from '../_shared/bartersitoLogic.js';
import {
  armarLlamada, resultado, SOLO_ADMIN, sigueSinDecidir, TIPOS, USER_AGENT, validarPedido, WEBHOOK_BASE, yaDecidida,
} from '../_shared/agenciaLogic.js';

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

type Cors = Record<string, string>;

function json(body: unknown, status: number, cors: Cors) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
}

async function callerAdmin(req: Request) {
  const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!token) return null;
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) return null;
  const { data: row } = await admin.from('marga_users').select('id, data').eq('auth_id', data.user.id).maybeSingle();
  return esAdmin(row) ? row : null;
}

async function leerFila(tipo: string, id: string) {
  const t = TIPOS[tipo as keyof typeof TIPOS];
  const { data, error } = await admin.from(t.tabla).select(t.columnas).eq(t.idCol, id).maybeSingle();
  if (error) throw error;
  return data as Record<string, unknown> | null;
}

Deno.serve(async (req) => {
  const cors = corsHeaders(req.headers.get('origin'));
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Método no permitido.' }, 405, cors);

  try {
    if (!(await callerAdmin(req))) return json({ error: SOLO_ADMIN }, 403, cors);

    const { pedido, error } = validarPedido(await req.json().catch(() => ({})));
    if (error || !pedido) return json({ error }, 400, cors);

    const antes = await leerFila(pedido.tipo, pedido.id);
    if (!antes || !antes.token) return json({ error: 'No encontré eso en la agencia.' }, 404, cors);
    if (!sigueSinDecidir(pedido.tipo, antes)) return json(yaDecidida(pedido.tipo, antes), 200, cors);

    const llamada = armarLlamada(pedido, antes, Deno.env.get('AGENCIA_WEBHOOK_BASE') || WEBHOOK_BASE);
    const r = await fetch(llamada.url, {
      method: llamada.method,
      headers: {
        'User-Agent': USER_AGENT,
        ...(llamada.body ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
      },
      body: llamada.body,
      signal: AbortSignal.timeout(45_000),
    });
    await r.text(); // la página HTML de confirmación; lo que cuenta es la fila
    if (!r.ok) {
      console.error('marga-agencia: n8n respondió', r.status);
      return json({ error: 'La agencia no contestó. Intenta de nuevo.' }, 502, cors);
    }

    const despues = await leerFila(pedido.tipo, pedido.id);
    const salida = resultado(pedido.tipo, antes, despues);
    return json(salida, salida.ok ? 200 : 409, cors);
  } catch (err) {
    const tardo = err instanceof DOMException && err.name === 'TimeoutError';
    console.error('marga-agencia', err);
    return json({ error: tardo ? 'La agencia tardó demasiado. Revisa en un momento.' : 'Error interno.' }, tardo ? 504 : 500, cors);
  }
});
