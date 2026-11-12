// supabase/functions/marga-avisos/index.ts
// Avisos de Marga fuera de la app: notificación push (Web Push) a los teléfonos
// suscritos y, para envío de docs / citas, Telegram por el flujo de n8n
// "Marga - Avisos a vendedores (Telegram)".
//
// La llama SOLO el trigger `marga_avisar` (supabase/marga_avisos.sql) con
// pg_net, con el secreto de `marga_avisos_config` en `x-marga-secreto`.
// Llaves VAPID, secreto y URL de n8n viven en esa tabla (solo service_role):
// nada sensible en el repo. Desplegar con verify_jwt = false.
import { createClient } from 'npm:@supabase/supabase-js@2.117.3';
import webpush from 'npm:web-push@3.6.7';
import { decidirAvisos } from '../_shared/avisosLogic.js';

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false },
});

type Config = {
  secreto: string;
  vapid_public: string;
  vapid_private: string;
  vapid_subject: string;
  telegram_webhook: string | null;
  telegram_token: string | null;
};

let configCache: { valor: Config; hasta: number } | null = null;
async function leerConfig(): Promise<Config> {
  if (configCache && configCache.hasta > Date.now()) return configCache.valor;
  const { data, error } = await admin.from('marga_avisos_config').select('*').eq('id', 1).single();
  if (error) throw error;
  configCache = { valor: data as Config, hasta: Date.now() + 60_000 };
  return data as Config;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

async function enviarPush(cfg: Config, usuarioId: string, aviso: { titulo: string; cuerpo: string; tag: string }) {
  const { data: subs } = await admin
    .from('marga_push_subs')
    .select('endpoint, subscription')
    .eq('usuario_id', usuarioId);
  let enviados = 0;
  for (const s of subs ?? []) {
    try {
      await webpush.sendNotification(
        s.subscription,
        JSON.stringify({ title: aviso.titulo, body: aviso.cuerpo, tag: aviso.tag, url: './' }),
        {
          vapidDetails: { subject: cfg.vapid_subject, publicKey: cfg.vapid_public, privateKey: cfg.vapid_private },
          TTL: 60 * 60 * 12,
          urgency: 'high',
        },
      );
      enviados++;
    } catch (err) {
      const code = (err as { statusCode?: number }).statusCode;
      // 404/410: el navegador dio de baja la suscripción; se limpia.
      if (code === 404 || code === 410) await admin.from('marga_push_subs').delete().eq('endpoint', s.endpoint);
      else console.error('push', usuarioId, code, String(err));
    }
  }
  return enviados;
}

async function enviarTelegram(cfg: Config, chatId: string, texto: string) {
  if (cfg.telegram_token) {
    const r = await fetch(`https://api.telegram.org/bot${cfg.telegram_token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: texto, parse_mode: 'HTML', disable_web_page_preview: true }),
    });
    return r.ok;
  }
  if (!cfg.telegram_webhook) return false;
  const [url, token] = cfg.telegram_webhook.split('#');
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-marga-token': token ?? '' },
    body: JSON.stringify({ chat_id: chatId, texto }),
  });
  return r.ok;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405);
  let cfg: Config;
  try {
    cfg = await leerConfig();
  } catch (err) {
    console.error('config', err);
    return json({ error: 'Sin configuración' }, 500);
  }
  if (!cfg.secreto || req.headers.get('x-marga-secreto') !== cfg.secreto) {
    return json({ error: 'No autorizado' }, 401);
  }

  const evento = await req.json().catch(() => null);
  const { data: filas } = await admin.from('marga_users').select('id, data');
  const usuarios = (filas ?? []).map((f) => ({
    id: f.id as string,
    username: f.data?.username as string,
    role: f.data?.role as string,
    telegramChatId: String(f.data?.telegramChatId ?? '').trim(),
  }));
  const porNombre = new Map(usuarios.map((u) => [u.username, u]));

  const avisos = decidirAvisos(evento, usuarios);
  const resultado = [];
  for (const aviso of avisos) {
    const u = porNombre.get(aviso.destinatario);
    if (!u) continue;
    const push = cfg.vapid_private ? await enviarPush(cfg, u.id, aviso) : 0;
    const telegram = aviso.telegram && u.telegramChatId ? await enviarTelegram(cfg, u.telegramChatId, aviso.telegram) : false;
    resultado.push({ destinatario: u.username, push, telegram });
  }
  return json({ ok: true, avisos: resultado });
});
