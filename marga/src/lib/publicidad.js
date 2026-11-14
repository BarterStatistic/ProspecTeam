// Datos de "Publicidad y agencia" (Panel ADMIN, solo administrador).
//
// En producción salen de la función `marga_panel_publicidad` de Supabase
// (supabase/marga_publicidad.sql), que rechaza a quien no sea administrador.
// En modo demo se usan datos de muestra con la misma forma.
//
// Límites que la pantalla debe decir tal cual, sin rellenar con supuestos:
//   · Solo se conoce el gasto de la cuenta propia. La mayoría de los leads
//     llega de anuncios de la cuenta interna de Dinamo, cuyo gasto no se
//     recolecta: esos anuncios traen `gasto: null` y `externo: true`.
//   · El costo de la agencia (IA) está en dólares y solo desde que se empezó
//     a registrar. No se convierte a pesos: no hay tipo de cambio guardado.

const DAY = 86_400_000;

/** 'YYYY-MM-DD' → milisegundos a medianoche local (sin el corrimiento de UTC). */
export function fechaLocal(valor) {
  if (typeof valor === 'number') return valor;
  const m = String(valor ?? '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getTime() : null;
}

const num = (v) => (v == null ? null : Number(v));

/** Da forma estable a lo que devuelve la función de Supabase. */
export function normalizarPublicidad(d) {
  if (!d || typeof d !== 'object') return null;
  return {
    esDemo: !!d.esDemo,
    desde: fechaLocal(d.desde),
    hasta: fechaLocal(d.hasta),
    gastoAnuncios: num(d.gastoAnuncios) ?? 0,
    gastoPorDia: (d.gastoPorDia ?? []).map((g) => ({ fecha: fechaLocal(g.fecha), monto: num(g.monto) ?? 0 })),
    costosUsd: (d.costosUsd ?? []).map((c) => ({ label: String(c.label), usd: num(c.usd) ?? 0 })),
    leads: num(d.leads) ?? 0,
    ventasAtribuidas: num(d.ventasAtribuidas) ?? 0,
    anuncios: (d.anuncios ?? []).map((a) => ({
      nombre: String(a.nombre ?? 'Anuncio sin nombre'),
      externo: !!a.externo,
      gasto: num(a.gasto),
      leads: num(a.leads) ?? 0,
      calientes: num(a.calientes) ?? 0,
      ventas: num(a.ventas) ?? 0,
    })),
    hoy: {
      leads: num(d.hoy?.leads) ?? 0,
      calientes: num(d.hoy?.calientes) ?? 0,
      sinAtender: num(d.hoy?.sinAtender) ?? 0,
      porDecidir: num(d.hoy?.porDecidir) ?? 0,
    },
    enVivo: (d.enVivo ?? []).map((e) => ({
      cuando: typeof e.cuando === 'number' ? e.cuando : Date.parse(e.cuando),
      tipo: String(e.tipo ?? ''),
      titulo: String(e.titulo ?? ''),
      detalle: String(e.detalle ?? ''),
    })),
    agentes: (d.agentes ?? []).map((a) => ({
      nombre: String(a.nombre),
      ultima: typeof a.ultima === 'number' ? a.ultima : Date.parse(a.ultima),
    })),
  };
}

/** Datos de muestra para el modo demo (deterministas, sin azar). */
function demo(ahora = Date.now()) {
  const hoy = new Date(ahora);
  const base = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate()).getTime();
  const forma = [0.7, 0.9, 0.8, 1.1, 0.75, 0.95, 1.2, 0.85, 1.0, 0.8, 1.05, 0.9, 1.15, 0.7, 0.95,
    1.1, 0.85, 1.0, 0.9, 1.2, 0.8, 1.05, 0.95, 1.4, 1.6, 1.35, 1.7, 1.5, 1.3, 1.25];
  const suma = forma.reduce((a, b) => a + b, 0);
  const anuncios = [
    { nombre: 'Te autorizamos al instante', externo: true, gasto: null, leads: 131, calientes: 17, ventas: 1 },
    { nombre: 'Motos disponibles · 5% de enganche', externo: false, gasto: 3180, leads: 71, calientes: 16, ventas: 0 },
    { nombre: 'Potencia y estilo', externo: false, gasto: 1960, leads: 33, calientes: 9, ventas: 1 },
    { nombre: 'Reel de entrega real', externo: false, gasto: 1410, leads: 12, calientes: 5, ventas: 0 },
  ];
  const gasto = anuncios.reduce((a, x) => a + (x.gasto ?? 0), 0);
  return normalizarPublicidad({
    esDemo: true,
    desde: base - (forma.length - 1) * DAY,
    hasta: base,
    gastoAnuncios: gasto,
    gastoPorDia: forma.map((f, i) => ({
      fecha: base - (forma.length - 1 - i) * DAY,
      monto: Math.round((f / suma) * gasto),
    })),
    costosUsd: [
      { label: 'Creativo', usd: 6.4 },
      { label: 'Investigador', usd: 3.1 },
      { label: 'Aprendizaje', usd: 1.9 },
    ],
    leads: anuncios.reduce((a, x) => a + x.leads, 0),
    ventasAtribuidas: 2,
    anuncios,
    hoy: { leads: 18, calientes: 7, sinAtender: 4, porDecidir: 2 },
    enVivo: [
      { cuando: ahora - 12 * 60_000, tipo: 'lead', titulo: 'Lead nuevo', detalle: 'Llegó del anuncio “Motos disponibles · 5% de enganche”' },
      { cuando: ahora - 50 * 60_000, tipo: 'idea', titulo: 'Idea #41 lista para revisar', detalle: '3 dudas sobre el buró' },
      { cuando: ahora - 3 * 3_600_000, tipo: 'propuesta', titulo: 'Propuesta #44', detalle: 'Promocionar la publicación de la entrega del sábado' },
      { cuando: ahora - 26 * 3_600_000, tipo: 'alerta', titulo: 'Alerta de anuncios', detalle: 'Costo alto: Potencia y estilo' },
    ],
    agentes: [
      { nombre: 'Creativo', ultima: ahora - 4 * 3_600_000 },
      { nombre: 'Investigador', ultima: ahora - 20 * 3_600_000 },
      { nombre: 'Aprendizaje', ultima: ahora - 2 * 3_600_000 },
    ],
  });
}

/**
 * Lee la publicidad. Devuelve `{ datos }` o `{ sinConectar: true }` cuando la
 * base todavía no tiene la función (o el almacén no es Supabase). Cualquier
 * otro fallo se propaga para que la pantalla lo muestre.
 */
export async function cargarPublicidad(modo, store, dias = 30) {
  if (modo === 'demo') return { datos: demo() };
  if (typeof store?.publicidad !== 'function') return { sinConectar: true };
  try {
    return { datos: normalizarPublicidad(await store.publicidad(dias)) };
  } catch (err) {
    if (err?.sinInstalar) return { sinConectar: true };
    throw err;
  }
}

/**
 * Totales derivados. El costo por lead y por venta usa SOLO los anuncios con
 * gasto conocido: mezclar los leads de la cuenta interna (gasto desconocido)
 * haría parecer la publicidad más barata de lo que es.
 */
export function resumenPublicidad(d) {
  const conGasto = d.anuncios.filter((a) => a.gasto != null);
  const leadsConGasto = conGasto.reduce((a, x) => a + x.leads, 0);
  const ventasConGasto = conGasto.reduce((a, x) => a + x.ventas, 0);
  const leadsExternos = d.anuncios.filter((a) => a.gasto == null).reduce((a, x) => a + x.leads, 0);
  return {
    costoAgenciaUsd: d.costosUsd.reduce((a, c) => a + c.usd, 0),
    leadsConGasto,
    leadsExternos,
    costoPorLead: leadsConGasto ? d.gastoAnuncios / leadsConGasto : null,
    costoPorVenta: ventasConGasto ? d.gastoAnuncios / ventasConGasto : null,
  };
}

/** "hace 5 min", "hace 3 h", "hace 2 días". */
export function hace(ts, ahora = Date.now()) {
  if (!Number.isFinite(ts)) return '';
  const min = Math.max(0, Math.round((ahora - ts) / 60_000));
  if (min < 1) return 'ahora';
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `hace ${h} h`;
  const dias = Math.round(h / 24);
  return `hace ${dias} ${dias === 1 ? 'día' : 'días'}`;
}

// Resumen de la auditoría del ecosistema Dinamo (2026-11-13). Son datos fijos
// de ese corte, no en vivo: el documento completo está en
// docs/2026-11-13-auditoria-ecosistema-dinamo.md.
export const AUDITORIA = {
  fecha: '13 de noviembre de 2026',
  periodo: '4 al 13 de noviembre',
  hallazgo:
    'El problema hoy no es conseguir leads ni contestarles: es lo que pasa después de que Alex los entrega.',
  datos: [
    { valor: 144, texto: 'tarjetas subió Alex en 10 días' },
    { valor: 143, texto: 'seguían en Prospectos' },
    { valor: 36, texto: 'calientes sin tocar en 3 días o más' },
    { valor: 1, texto: 'venta con la conversación de origen' },
  ],
  embudo: [
    { label: 'Conversación desde anuncio', value: 168 },
    { label: 'Tarjeta de Alex en Marga', value: 144 },
    { label: 'Caliente', value: 63 },
    { label: 'Docs / Cita', value: 30 },
    { label: 'Proceso', value: 0 },
    { label: 'Venta', value: 1 },
  ],
  plan: [
    { fase: 'A', titulo: 'Que ningún lead caliente se enfríe', detalle: 'Seguimiento de un toque y “Mi día”', enCurso: true },
    { fase: 'B', titulo: 'Que todo se pueda medir', detalle: 'Historial de movimientos y cliente único' },
    { fase: 'D', titulo: 'Centro de mando', detalle: 'Esta pantalla, con datos en vivo' },
    { fase: 'C', titulo: 'Que Alex atienda mejor', detalle: 'Contexto del anuncio y aprendizaje' },
    { fase: 'E', titulo: 'Calidad y posventa', detalle: 'Encuesta, referidos y tarjeta semanal' },
  ],
};
