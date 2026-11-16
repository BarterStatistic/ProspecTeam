// "Por decidir hoy" de la agencia (Publicidad y agencia, solo administrador). Fase C, 2026-11-15.
//
// En producción la bandeja sale de `marga_por_decidir()` (supabase/marga_centro_de_mando.sql) y cada
// botón va por la Edge Function `marga-agencia`, que llama al MISMO webhook de n8n que el botón de
// Telegram: la base decide una sola vez (public.decidir_*) y el mensaje de Telegram se edita solo.
// Lo que se decide en Telegram llega a Marga por Supabase Realtime y la tarjeta desaparece sola.
// En modo demo todo vive en memoria, con la misma forma.

import { desdeTexto, validarPedido } from '../../supabase/functions/_shared/agenciaLogic.js';

export { desdeTexto };

const ts = (v) => (v == null ? null : typeof v === 'number' ? v : Date.parse(v));
const lista = (v) => (Array.isArray(v) ? v : []);

/** Imagen de Drive para la vista previa (el archivo ya es público para el Productor). */
export const miniaturaDrive = (id) => (id ? `https://drive.google.com/thumbnail?id=${encodeURIComponent(id)}&sz=w640` : null);

/** "Subir presupuesto a $250/día", "Pausar", … a partir de accion_meta (o null si no hay acción). */
export function antesDespues(accion) {
  if (!accion || typeof accion !== 'object') return null;
  if (accion.campo === 'daily_budget') {
    const pesos = (c) => (c == null || c === '' ? null : `$${(Number(c) / 100).toLocaleString('es-MX')}/día`);
    return { que: 'Presupuesto diario', antes: pesos(accion.antes) ?? 'el actual', despues: pesos(accion.valor) ?? '—' };
  }
  if (accion.campo === 'status') {
    const n = { ACTIVE: 'Activo', PAUSED: 'En pausa' };
    return { que: 'Estado', antes: n[accion.antes] ?? accion.antes ?? 'el actual', despues: n[accion.valor] ?? String(accion.valor ?? '—') };
  }
  const tipos = {
    agregar_anuncio: 'Agregar un anuncio', editar_anuncio: 'Editar un anuncio', crear_campana: 'Crear una campaña',
    promocionar_post: 'Promocionar una publicación',
  };
  return tipos[accion.tipo] ? { que: tipos[accion.tipo], antes: null, despues: accion.anuncio?.nombre ?? null } : null;
}

/** Da forma estable a lo que devuelve la base (o el demo). */
export function normalizarBandeja(d) {
  if (!d || typeof d !== 'object') return null;
  return {
    esDemo: !!d.esDemo,
    generado: ts(d.generado),
    ideas: lista(d.ideas).map((i) => ({
      id: String(i.id), tipo: String(i.tipo ?? ''), modelo: String(i.modelo ?? ''), titulo: String(i.titulo ?? ''),
      texto: String(i.texto ?? ''), razon: String(i.razon ?? ''), angulo: i.angulo ?? null, creado: ts(i.creado_en),
    })),
    piezas: lista(d.piezas).map((p) => ({
      id: String(p.id), version: Number(p.version ?? 1), estado: String(p.estado ?? 'en_revision'), tipo: String(p.tipo ?? ''),
      modelo: String(p.modelo ?? ''), titulo: String(p.titulo ?? ''), texto: String(p.texto ?? ''),
      archivo: p.archivo_drive_id ?? null, archivoVertical: p.archivo_vertical_drive_id ?? null,
      desde: ts(p.en_revision_desde), programada: ts(p.programada_para),
    })),
    propuestas: lista(d.propuestas).map((p) => ({
      id: String(p.id), titulo: String(p.titulo ?? ''), detalle: String(p.detalle ?? ''), motivo: String(p.motivo ?? ''),
      entidad: String(p.entidad ?? ''), dinero: !!p.involucra_dinero, manual: !!p.manual, origen: String(p.origen ?? ''),
      cambio: antesDespues(p.accion_meta), ejecutaEnMeta: !!p.accion_meta, creado: ts(p.creado_en),
    })),
    campanas: lista(d.campanas).map((c) => ({
      id: String(c.id), nombre: String(c.nombre ?? ''), desde: c.desde ?? null, hasta: c.hasta ?? null,
      mensaje: String(c.mensaje_clave ?? ''), piezas: Number(c.piezas_meta ?? 0),
    })),
    cuentas: lista(d.cuentas).map((c) => ({
      id: String(c.username), tipo: String(c.tipo ?? ''), notas: String(c.notas ?? ''), region: c.region ?? null,
    })),
    comentarios: lista(d.comentarios).map((c) => ({
      id: String(c.comment_id), texto: String(c.texto ?? ''), clase: String(c.clase ?? ''), respuesta: String(c.respuesta ?? ''),
      creado: ts(c.creado_fb),
    })),
    decididasHoy: lista(d.decididas_hoy).map((x) => ({
      tipo: String(x.tipo ?? ''), id: String(x.id ?? ''), titulo: String(x.titulo ?? ''), estado: String(x.estado ?? ''),
      desde: x.desde ?? null, cuando: ts(x.cuando),
    })),
  };
}

export const GRUPOS = ['piezas', 'ideas', 'propuestas', 'campanas', 'cuentas', 'comentarios'];

/** Cuántas cosas esperan una decisión. */
export function contarPendientes(b) {
  return b ? GRUPOS.reduce((n, g) => n + b[g].length, 0) : 0;
}

// Grupo de la bandeja de cada tipo de decisión
const GRUPO_DE = { idea: 'ideas', pieza: 'piezas', propuesta: 'propuestas', campana: 'campanas', cuenta: 'cuentas', comentario: 'comentarios' };
const ESTADO_NUEVO = {
  'idea:autorizar': 'autorizada', 'idea:descartar': 'descartada', 'pieza:publicar': 'aprobada_final', 'pieza:programar': 'programada',
  'pieza:cambios': 'cambios_pedidos', 'pieza:rechazar': 'rechazada', 'propuesta:aprobar': 'aprobada', 'propuesta:rechazar': 'rechazada',
  'campana:crear': 'activa', 'campana:no': 'rechazada', 'cuenta:agregar': 'agregada', 'cuenta:no': 'descartada',
  'comentario:responder': 'respondido', 'comentario:ignorar': 'ignorado',
};
export const estadoTrasDecidir = (tipo, accion) => ESTADO_NUEVO[`${tipo}:${accion}`] ?? null;

/**
 * Quita de la bandeja lo que se acaba de decidir (respuesta optimista: la tarjeta se va al tocar,
 * y Realtime o la recarga confirman). Devuelve una bandeja nueva.
 */
export function quitarDecidida(b, { tipo, id, accion, desde = 'marga', ahora = Date.now() }) {
  const g = GRUPO_DE[tipo];
  if (!b || !g) return b;
  const item = b[g].find((x) => x.id === String(id));
  // Programar deja la pieza en la bandeja (sigue por publicar), con su hora
  const sigue = tipo === 'pieza' && accion === 'programar';
  return {
    ...b,
    [g]: sigue ? b[g] : b[g].filter((x) => x.id !== String(id)),
    decididasHoy: item
      ? [{ tipo, id: String(id), titulo: item.titulo ?? item.nombre ?? (tipo === 'cuenta' ? `@${id}` : item.texto?.slice(0, 80) ?? ''),
          estado: estadoTrasDecidir(tipo, accion) ?? '', desde, cuando: ahora }, ...b.decididasHoy]
      : b.decididasHoy,
  };
}

// ---------- Demo ----------

let demoEstado = null;

function demoInicial(ahora = Date.now()) {
  const h = (n) => new Date(ahora - n * 3_600_000).toISOString();
  return {
    esDemo: true,
    generado: new Date(ahora).toISOString(),
    ideas: [
      { id: 161, tipo: 'imagen', modelo: 'Italika DM 250', titulo: 'Tu primera moto con 5 % de enganche',
        texto: 'Estrena tu DM 250 con solo 5 % de enganche. Trámite por WhatsApp 📲', razon: 'Las piezas con el 5 % traen 2× más mensajes.', angulo: 'enganche', creado_en: h(3) },
      { id: 162, tipo: 'reel', modelo: 'Vento Nitrox 250', titulo: '¿Te dijeron que no por el buró?',
        texto: 'Aquí revisamos tu caso. Muchos clientes salieron con su moto el mismo día.', razon: '3 preguntas de esta semana fueron sobre el buró.', angulo: 'buró', creado_en: h(2) },
    ],
    piezas: [
      { id: 158, version: 2, estado: 'en_revision', tipo: 'imagen', modelo: 'Italika FT 150', titulo: 'La moto para ir a la chamba',
        texto: 'Llega a tiempo todos los días. FT 150 desde $389 a la semana.', archivo_drive_id: null, en_revision_desde: h(5) },
    ],
    propuestas: [
      { id: 61, titulo: 'Subir presupuesto de "Motos disponibles · 5 % de enganche"', detalle: 'Trae el costo por lead más bajo de la semana.',
        motivo: 'Costo por lead $38 contra $71 del promedio.', entidad: 'Conjunto "Dinamo segundo semestre"', involucra_dinero: true,
        accion_meta: { objeto_tipo: 'adset', objeto_id: '120252919805380022', campo: 'daily_budget', antes: 15000, valor: 25000 }, origen: 'analista', creado_en: h(6) },
    ],
    campanas: [
      { id: 9, nombre: 'Aguinaldo 2026', desde: '2026-12-01', hasta: '2026-12-24', mensaje_clave: 'Tu aguinaldo alcanza para el enganche', piezas_meta: 3 },
    ],
    cuentas: [{ username: 'motos_del_norte', tipo: 'competencia', notas: 'Reels de entregas con 40 mil reproducciones' }],
    comentarios: [
      { comment_id: '106744505821209_1', texto: '¿Cuánto piden de enganche para la DM 250?', clase: 'compra',
        respuesta: '¡Hola! Desde el 5 %. Escríbenos por WhatsApp y te cotizamos 📲', creado_fb: h(1) },
    ],
    decididas_hoy: [
      { tipo: 'idea', id: '157', titulo: 'Entrega del sábado', estado: 'autorizada', desde: 'telegram', cuando: h(4) },
    ],
  };
}

/** Bandeja del modo demo (en memoria, se reinicia al recargar). */
export function demoBandeja() {
  demoEstado ??= demoInicial();
  return normalizarBandeja(demoEstado);
}

/** Decide en el modo demo con las mismas reglas que la base: una sola vez. */
export function demoDecidir(pedido) {
  demoEstado ??= demoInicial();
  const g = GRUPO_DE[pedido.tipo];
  const idCol = { cuentas: 'username', comentarios: 'comment_id' }[g] ?? 'id';
  const fila = demoEstado[g]?.find((x) => String(x[idCol]) === String(pedido.id));
  if (!fila) {
    const ya = demoEstado.decididas_hoy.find((x) => x.tipo === pedido.tipo && x.id === String(pedido.id));
    return ya
      ? { ok: true, cambio: false, yaDecidida: true, estado: ya.estado, desde: ya.desde, mensaje: `Ya se decidió desde ${desdeTexto(ya.desde)}.` }
      : { ok: false, error: 'No encontré eso en la agencia.' };
  }
  const estado = estadoTrasDecidir(pedido.tipo, pedido.accion);
  if (pedido.tipo === 'pieza' && pedido.accion === 'programar') {
    fila.estado = 'programada';
    fila.programada_para = pedido.cuando;
  } else {
    demoEstado[g] = demoEstado[g].filter((x) => x !== fila);
  }
  demoEstado.decididas_hoy.unshift({
    tipo: pedido.tipo, id: String(pedido.id), titulo: fila.titulo ?? fila.nombre ?? (pedido.tipo === 'cuenta' ? `@${pedido.id}` : String(fila.texto).slice(0, 80)),
    estado, desde: 'marga', cuando: new Date().toISOString(),
  });
  return { ok: true, cambio: true, estado, desde: 'marga' };
}

/** Para las pruebas: vuelve al estado inicial del demo. */
export function reiniciarDemo() {
  demoEstado = null;
}

/**
 * Lee la bandeja. `{ datos }`, o `{ sinConectar: true }` si la base todavía no tiene la función
 * (falta aplicar supabase/marga_centro_de_mando.sql). Otro fallo se propaga.
 */
export async function cargarBandeja(modo, store) {
  if (modo === 'demo') return { datos: demoBandeja() };
  if (typeof store?.porDecidir !== 'function') return { sinConectar: true };
  try {
    return { datos: normalizarBandeja(await store.porDecidir()) };
  } catch (err) {
    if (err?.sinInstalar) return { sinConectar: true };
    throw err;
  }
}

/** Manda una decisión (demo en memoria o la Edge Function). Siempre resuelve con `{ ok, … }`. */
export async function decidir(modo, store, crudo) {
  // Mismas reglas que la Edge Function (hora de 15 min a 30 días, texto de cambios, …)
  const { pedido, error } = validarPedido(crudo);
  if (error) return { ok: false, error };
  if (modo === 'demo') return demoDecidir(pedido);
  if (typeof store?.decidirAgencia !== 'function') return { ok: false, error: 'La agencia todavía no está conectada a Marga.' };
  try {
    return await store.decidirAgencia(pedido);
  } catch (err) {
    return { ok: false, error: err?.message || 'No se pudo decidir. Intenta de nuevo.' };
  }
}
