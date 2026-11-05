// Créditos de la bandeja de Dinamo dentro de Marga (pestaña Procesos): cómo
// se interpreta cada uno. Sin React, para probarlo con Vitest. Viene de la web
// de bandeja-dinamo (src/lib/creditos.js), que se retira.
//
// El status real del credito no viene como texto: Dinamo marca cada etapa
// (Captura, DOC, BNC, VF, CC, EC, Aut) con un iconito. La leyenda de la propia
// bandeja de Dinamo dice que significa cada uno:
//   ok.gif        -> Autorizado (etapa cumplida)
//   p.gif         -> En Proceso
//   na.gif        -> Corrigiendo Informacion (hay que corregir algo)
//   cancelado.gif -> Rechazado
// (rechazado.png NO es un estado: es el boton «Rechazar» de su propia columna.)
//
// Con eso, el status general del credito es uno de cuatro, por prioridad:
// rechazado > autorizado > correccion > proceso.

export const ETAPAS = ['Captura', 'DOC', 'BNC', 'VF', 'CC', 'EC', 'Aut'];

export const ETAPA_NOMBRE = {
  Captura: 'Captura',
  DOC: 'Documentos',
  BNC: 'Buró (BNC)',
  VF: 'Verificación física',
  CC: 'Call center',
  EC: 'Evaluación de crédito',
  Aut: 'Autorización',
};

/** Los cuatro estados de un credito, en el orden en que conviene atenderlos. */
export const ESTADOS = {
  correccion: { nombre: 'Corrección', plural: 'En corrección', ayuda: 'Dinamo pide corregir información' },
  rechazado: { nombre: 'Rechazado', plural: 'Rechazados', ayuda: 'Solicitud rechazada' },
  proceso: { nombre: 'En proceso', plural: 'En proceso', ayuda: 'Avanzando, sin pendientes tuyos' },
  autorizado: { nombre: 'Autorizado', plural: 'Autorizados', ayuda: 'Crédito autorizado' },
};

export const ORDEN_ESTADOS = Object.keys(ESTADOS);

/** Estado de UNA etapa: ok | proceso | correccion | rechazado | vacio. */
export function estadoEtapa(etapa) {
  if (!etapa) return 'vacio';
  const icono = String(etapa.icono ?? '').toLowerCase();
  const alt = String(etapa.alt ?? '').toLowerCase();
  if (icono === 'ok' || icono === 'okx') return 'ok';
  if (icono === 'na' || alt.startsWith('corrig')) return 'correccion';
  if (icono.includes('cancel') || icono.includes('recha') || alt.startsWith('rechaz')) return 'rechazado';
  if (icono.includes('ok')) return 'ok';
  return 'proceso';
}

/** Como se ve cada estado de etapa (para la leyenda y los tooltips). */
export const ESTADO_ETAPA_NOMBRE = {
  ok: 'Autorizada',
  proceso: 'En proceso',
  correccion: 'Corrección',
  rechazado: 'Rechazada',
  vacio: 'Sin dato',
};

/**
 * Resumen del credito: su estado (uno de ESTADOS), una linea que dice que
 * hacer o donde va, y cuantas etapas lleva cumplidas.
 */
export function resumen(credito) {
  const estados = ETAPAS.map((e) => ({ etapa: e, estado: estadoEtapa(credito.etapas?.[e]) }));
  const cumplidas = estados.filter((e) => e.estado === 'ok').length;
  const totales = ETAPAS.length;
  const de = (estado) => estados.filter((e) => e.estado === estado).map((e) => e.etapa);
  const base = { cumplidas, totales };

  const rechazadas = de('rechazado');
  if (rechazadas.length) {
    return { ...base, estado: 'rechazado', etiqueta: 'Rechazado', detalle: `Rechazado en ${ETAPA_NOMBRE[rechazadas[0]]}` };
  }
  if (estados.at(-1).estado === 'ok' || cumplidas === totales) {
    return { ...base, estado: 'autorizado', etiqueta: 'Autorizado', detalle: 'Autorizado por Dinamo' };
  }
  const corregir = de('correccion');
  if (corregir.length) {
    return {
      ...base,
      estado: 'correccion',
      etiqueta: 'Corrección',
      detalle: `Corregir: ${corregir.map((e) => ETAPA_NOMBRE[e]).join(', ')}`,
      etapasCorregir: corregir,
    };
  }
  const actual = estados.find((e) => e.estado !== 'ok');
  return { ...base, estado: 'proceso', etiqueta: 'En proceso', detalle: `En ${ETAPA_NOMBRE[actual.etapa]}` };
}

/** Cuantos creditos hay en cada estado. */
export function contar(creditos) {
  const cuenta = Object.fromEntries(ORDEN_ESTADOS.map((e) => [e, 0]));
  for (const c of creditos) cuenta[resumen(c).estado] += 1;
  return cuenta;
}

/** Ordena para que primero salga lo que pide accion (correccion, rechazo). */
export function ordenar(creditos) {
  const peso = (c) => ORDEN_ESTADOS.indexOf(resumen(c).estado);
  return [...creditos].sort((a, b) => peso(a) - peso(b));
}

/** Fecha ISO -> "hace 5 min" / "hace 2 h" / "14 oct 10:15". */
export function hace(iso, ahora = Date.now()) {
  if (!iso) return '—';
  const ms = ahora - Date.parse(iso);
  if (!(ms >= 0)) return formatoFecha(iso);
  const min = Math.floor(ms / 60000);
  if (min < 1) return 'hace un momento';
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `hace ${h} h`;
  return formatoFecha(iso);
}

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

export function formatoFecha(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${d.getDate()} ${MESES[d.getMonth()]} ${hh}:${mm}`;
}

/** Sin latido en este tiempo, una máquina se da por desconectada. */
export const LATIDO_MAXIMO_MS = 3 * 60 * 1000;

/** Máquinas activas que dieron latido hace poco. */
export function maquinasVivas(panel, ahora = Date.now()) {
  return (panel?.agentes ?? []).filter(
    (a) => a.activo && a.ultimo_latido && ahora - Date.parse(a.ultimo_latido) < LATIDO_MAXIMO_MS,
  );
}

/** Cuándo toca la siguiente lectura automática (ISO), o null. */
export function proximaLectura(estado) {
  if (!estado?.ultima_sync) return null;
  return new Date(Date.parse(estado.ultima_sync) + (estado.intervalo_min ?? 30) * 60000).toISOString();
}

/**
 * Indicador de Procesos: { tono: ok | leyendo | apagado | error, texto }.
 * `panel` es lo que devuelve dinamo_panel().
 */
export function estadoEnVivo(panel, ahora = Date.now()) {
  if (!panel?.estado) return { tono: 'apagado', texto: 'Dinamo sin conectar' };
  const e = panel.estado;
  const vivas = maquinasVivas(panel, ahora).length;
  if (e.tipo_error === 'login') return { tono: 'error', texto: 'Revisa la contraseña de Dinamo' };
  if (e.ultimo_error) return { tono: 'error', texto: e.ultimo_error };
  if (!vivas) {
    return { tono: 'apagado', texto: e.ultima_sync ? `Sin máquinas · leída ${hace(e.ultima_sync, ahora)}` : 'Sin máquinas conectadas' };
  }
  if (e.leyendo || e.solicitud_desde) return { tono: 'leyendo', texto: 'Leyendo Dinamo…' };
  const maquinas = vivas === 1 ? '1 máquina' : `${vivas} máquinas`;
  return { tono: 'ok', texto: e.ultima_sync ? `En vivo · ${hace(e.ultima_sync, ahora)} · ${maquinas}` : `En vivo · ${maquinas}` };
}

/** Filtra por texto (cliente, folio, moto, esquema) y por estado del resumen. */
export function filtrar(creditos, { texto = '', estado = 'todos' } = {}) {
  const q = texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
  return creditos.filter((c) => {
    if (estado !== 'todos' && resumen(c).estado !== estado) return false;
    if (!q) return true;
    return [c.cliente, c.folio, c.moto, c.esquema]
      .join(' ')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .includes(q);
  });
}
