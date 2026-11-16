// Lógica pura de "decidir desde Marga" (Fase C de la agencia, 2026-11-15). JS plano, sin
// dependencias: la importan la Edge Function marga-agencia (Deno), la app y las pruebas (Vitest).
//
// Una sola fuente de verdad (Supabase) y una sola puerta para decidir: Marga NO cambia el estado
// por su cuenta. La Edge Function llama al MISMO webhook de n8n que el botón de Telegram, con
// origen=marga; n8n llama a public.decidir_* (sql/043 del repo de la agencia), hace lo externo
// (Meta, Productor, aprendizaje) y edita el mensaje de Telegram ("✅ … desde Marga").

export const WEBHOOK_BASE = 'https://chatwoot-n8n.zlpr6t.easypanel.host/webhook';
export const SOLO_ADMIN = 'Solo el administrador puede decidir lo de la agencia.';

// n8n descarta como "bot" (403, sin ejecución) las peticiones cuyo User-Agent no parece de navegador
// (ignoreBots en los webhooks POST). Ojo: un User-Agent con URL ("+https://…") o "compatible;" cuenta
// como bot, así que va uno de Chrome tal cual (2026-11-15: con el anterior, todo POST daba 403).
export const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

const MOTIVOS = ['moto', 'gancho', 'diseno', 'ya_visto', 'no_aplica', 'otro'];

/**
 * Cada tipo: tabla y columna id, acciones, webhook, si va por GET o POST, qué estados siguen
 * pendientes y cómo se nombra su estado. `version` solo aplica a piezas.
 */
export const TIPOS = {
  idea: {
    tabla: 'creativo_ideas', idCol: 'id', columnas: 'id, token, estado, version, decidido_desde',
    acciones: ['autorizar', 'descartar'], pendientes: ['propuesta'],
  },
  pieza: {
    tabla: 'creativo_ideas', idCol: 'id', columnas: 'id, token, estado, version, decidido_desde',
    acciones: ['publicar', 'programar', 'cambios', 'rechazar'], pendientes: ['en_revision', 'programada'],
  },
  propuesta: {
    tabla: 'ads_propuestas', idCol: 'id', columnas: 'id, token, estado, decidido_desde',
    acciones: ['aprobar', 'rechazar'], pendientes: ['pendiente'],
  },
  campana: {
    tabla: 'creativo_campanas', idCol: 'id', columnas: 'id, token, estado, decidido_desde',
    acciones: ['crear', 'no'], pendientes: ['propuesta'],
  },
  cuenta: {
    tabla: 'creativo_cuentas', idCol: 'username', columnas: 'username, token, activa, decidido_desde',
    acciones: ['agregar', 'no'], pendientes: ['pendiente'],
  },
  comentario: {
    tabla: 'fb_comentarios', idCol: 'comment_id', columnas: 'comment_id, token, estado, error, decidido_desde',
    acciones: ['responder', 'ignorar'], pendientes: ['avisado'],
  },
};

const DESDE = { telegram: 'Telegram', marga: 'Marga', cierre_del_dia: 'el cierre del día', bartersito: 'Bartersito', otro: 'otro lado' };
export const desdeTexto = (d) => DESDE[d] ?? '';

/** 'AAAA-MM-DD HH:MM' (hora de Monterrey) válido, o ''. Acepta también 'AAAA-MM-DDTHH:MM'. */
export function normalizarCuando(valor) {
  const s = String(valor ?? '').trim().replace('T', ' ');
  return /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(s) ? s : '';
}

/** Milisegundos UTC de una hora local de Monterrey (UTC-6 todo el año desde 2022). */
export function cuandoAMs(cuando) {
  const m = normalizarCuando(cuando).match(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})$/);
  return m ? Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4] + 6, +m[5]) : NaN;
}

/** Limpia y valida lo que manda el navegador. Devuelve `{ pedido }` o `{ error }`. */
export function validarPedido(cuerpo, ahora = Date.now()) {
  const tipo = String(cuerpo?.tipo ?? '');
  const t = TIPOS[tipo];
  if (!t) return { error: 'Tipo no válido.' };
  const accion = String(cuerpo?.accion ?? '').trim().toLowerCase();
  if (!t.acciones.includes(accion)) return { error: 'Acción no válida.' };
  const id = String(cuerpo?.id ?? '').trim();
  const idOk = {
    id: /^\d{1,10}$/, username: /^[a-z0-9._]{1,30}$/, comment_id: /^\d+_\d+$/,
  }[t.idCol].test(tipo === 'cuenta' ? id.toLowerCase() : id);
  if (!idOk) return { error: 'Id no válido.' };
  const pedido = { tipo, accion, id: tipo === 'cuenta' ? id.toLowerCase() : id };

  if (tipo === 'idea' && accion === 'descartar' && MOTIVOS.includes(cuerpo?.motivo)) pedido.motivo = cuerpo.motivo;
  if (tipo === 'pieza' && accion === 'cambios') {
    const texto = String(cuerpo?.texto ?? '').replace(/\s+/g, ' ').trim().slice(0, 1500);
    if (!texto) return { error: 'Escribe qué cambiar.' };
    pedido.texto = texto;
  }
  if ((tipo === 'pieza' && accion === 'rechazar') || (tipo === 'comentario' && accion === 'responder')) {
    const texto = String(cuerpo?.texto ?? '').trim().slice(0, tipo === 'pieza' ? 1500 : 1000);
    if (texto) pedido.texto = texto;
  }
  if (tipo === 'pieza' && accion === 'programar') {
    const cuando = normalizarCuando(cuerpo?.cuando);
    const ms = cuandoAMs(cuando);
    if (!cuando || !Number.isFinite(ms)) return { error: 'Elige la fecha y la hora.' };
    if (ms < ahora + 15 * 60_000) return { error: 'La hora debe ser al menos 15 minutos después de ahora.' };
    if (ms > ahora + 30 * 86_400_000) return { error: 'Se puede programar hasta 30 días adelante.' };
    pedido.cuando = cuando;
  }
  return { pedido };
}

/** El estado de una fila con un nombre común (las cuentas guardan `activa`). */
export function estadoDe(tipo, fila) {
  if (!fila) return null;
  if (tipo === 'cuenta') return fila.activa == null ? 'pendiente' : fila.activa ? 'agregada' : 'descartada';
  return fila.estado ?? null;
}

export function sigueSinDecidir(tipo, fila) {
  return TIPOS[tipo].pendientes.includes(estadoDe(tipo, fila));
}

/**
 * La llamada al webhook de n8n: la misma que hace el botón de Telegram (POST de la página de
 * confirmación, o GET directo en campañas y cuentas), con el token de la fila y origen=marga.
 */
export function armarLlamada(pedido, fila, base = WEBHOOK_BASE) {
  const { tipo, accion } = pedido;
  const p = new URLSearchParams();
  const post = (ruta) => ({ url: `${base}/${ruta}`, method: 'POST', body: p.toString() });
  if (tipo === 'campana' || tipo === 'cuenta') {
    p.set(tipo === 'campana' ? 'c' : 'u', String(fila[TIPOS[tipo].idCol]));
    p.set('a', accion);
    p.set('t', fila.token);
    p.set('origen', 'marga');
    return { url: `${base}/${tipo === 'campana' ? 'campana-decidir' : 'investigador-cuenta'}?${p}`, method: 'GET' };
  }
  if (tipo === 'comentario') {
    p.set('c', fila.comment_id);
    p.set('a', accion);
    p.set('t', fila.token);
    if (pedido.texto) p.set('texto', pedido.texto);
    p.set('origen', 'marga');
    return post('comentario-decidir');
  }
  p.set('id', String(fila.id));
  p.set('accion', accion);
  p.set('t', fila.token);
  if (tipo === 'pieza') p.set('v', String(fila.version));
  if (pedido.motivo) p.set('motivo', pedido.motivo);
  if (pedido.cuando) p.set('cuando', pedido.cuando);
  if (pedido.texto) p.set('texto', pedido.texto);
  p.set('origen', 'marga');
  if (tipo === 'propuesta') return post('meta-ads-propuesta');
  if (tipo === 'pieza' && (accion === 'cambios' || accion === 'rechazar')) return post('creativo-revision');
  return post('creativo-idea');
}

/**
 * Lo que se le contesta a Marga comparando la fila antes y después de llamar a n8n.
 * `antes` sigue pendiente (si no, ni se llamó al webhook: ya se había decidido).
 */
export function resultado(tipo, antes, despues) {
  const estado = estadoDe(tipo, despues);
  const cambio = !!despues && estado !== estadoDe(tipo, antes);
  if (!despues) return { ok: false, error: 'Ya no existe.' };
  if (cambio) return { ok: true, cambio: true, estado, desde: despues.decidido_desde ?? 'marga' };
  // Responder un comentario puede fallar en Meta: regresa a 'avisado' con el error
  if (tipo === 'comentario' && despues.error) return { ok: false, error: `Meta no aceptó la respuesta: ${despues.error}` };
  return { ok: false, error: 'No cambió nada. Revisa el mensaje en Telegram o intenta de nuevo.' };
}

/** Respuesta cuando la fila ya estaba decidida antes de tocar el botón en Marga. */
export function yaDecidida(tipo, fila) {
  const desde = fila.decidido_desde ?? null;
  return {
    ok: true, cambio: false, yaDecidida: true, estado: estadoDe(tipo, fila), desde,
    mensaje: `Ya se decidió${desde ? ` desde ${desdeTexto(desde)}` : ''}.`,
  };
}
