// Resumen del día del administrador ("Mi día" → Resumen).
//
// En producción sale de `marga_resumen_dia` (supabase/marga_resumen_dia.sql), que rechaza a quien
// no sea administrador. Clientes y citas no vienen de ahí: ya están en los datos de Marga.
// En modo demo se usan datos de muestra con la misma forma.

const num = (v) => (v == null || v === '' ? 0 : Number(v));
const ts = (v) => (v == null ? null : typeof v === 'number' ? v : Date.parse(v));

function embudo(e) {
  return {
    conversaciones: num(e?.conversaciones),
    conDocumentos: num(e?.con_documentos),
    aptos: num(e?.aptos_con_documentos),
    noCumplen: num(e?.no_cumplen),
    proceso: num(e?.pasaron_a_proceso),
  };
}

export const ORIGEN_REPORTE = {
  analista: 'Analista de Meta Ads',
  supervisor: 'Supervisor de Alex',
  mensual: 'Reporte mensual',
};

/** Da forma estable a lo que devuelve la base (o el demo). */
export function normalizarResumen(d) {
  if (!d || typeof d !== 'object') return null;
  const g = d.gasto ?? {};
  const ia = d.ia ?? {};
  const dec = d.decisiones ?? {};
  return {
    esDemo: !!d.esDemo,
    generado: ts(d.generado),
    alex: { hoy: embudo(d.alex?.hoy), semana: embudo(d.alex?.semana), semanaAnterior: embudo(d.alex?.semanaAnterior) },
    gasto: {
      hoy: num(g.hoy), ayer: num(g.ayer), semana: num(g.semana), mes: num(g.mes),
      conversacionesSemana: num(g.conversacionesSemana), ultimoDia: g.ultimoDia ?? null,
    },
    ia: {
      agenciaUsdMes: num(ia.agenciaUsdMes), agenciaUsdHoy: num(ia.agenciaUsdHoy),
      alexUsdMes: ia.alexUsdMes == null ? null : Number(ia.alexUsdMes), alexPreliminar: ia.alexPreliminar !== false,
    },
    decisiones: {
      agencia: dec.agencia == null ? null : num(dec.agencia),
      alex: num(dec.alex),
    },
    reportes: (Array.isArray(d.reportes) ? d.reportes : []).map((r) => ({
      id: `${r.origen}-${r.id}`,
      origen: String(r.origen ?? ''),
      titulo: String(r.titulo ?? ''),
      creado: ts(r.creado),
      resumen: String(r.resumen ?? ''),
      url: r.url ?? null,
    })),
  };
}

/** Total de cosas por decidir (agencia + Supervisor de Alex). */
export function totalDecisiones(r) {
  if (!r) return 0;
  return (r.decisiones.agencia ?? 0) + r.decisiones.alex;
}

/** Primer renglón legible de un resumen con <b> de Telegram (para la vista corta). */
export function primeraLinea(texto, max = 160) {
  const limpio = String(texto ?? '')
    .replace(/<[^>]*>/g, '')
    .split('\n')
    .map((l) => l.trim())
    .find((l) => l.length > 0);
  if (!limpio) return '';
  return limpio.length > max ? `${limpio.slice(0, max - 1).trimEnd()}…` : limpio;
}

function demo(ahora = Date.now()) {
  const h = (n) => new Date(ahora - n * 3_600_000).toISOString();
  return normalizarResumen({
    esDemo: true,
    generado: new Date(ahora).toISOString(),
    alex: {
      hoy: { conversaciones: 14, con_documentos: 3, aptos_con_documentos: 2, no_cumplen: 1, pasaron_a_proceso: 1 },
      semana: { conversaciones: 92, con_documentos: 14, aptos_con_documentos: 12, no_cumplen: 3, pasaron_a_proceso: 4 },
      semanaAnterior: { conversaciones: 85, con_documentos: 10, aptos_con_documentos: 8, no_cumplen: 2, pasaron_a_proceso: 3 },
    },
    gasto: { hoy: 64, ayer: 118, semana: 742, mes: 2380, conversacionesSemana: 96, ultimoDia: null },
    ia: { agenciaUsdMes: 11.4, agenciaUsdHoy: 0.38, alexUsdMes: 43.6, alexPreliminar: false },
    decisiones: { agencia: 3, alex: 1 },
    reportes: [
      { origen: 'supervisor', id: 2, titulo: 'Supervisor de Alex · avance', creado: h(8),
        resumen: '<b>La medida</b>: 6 aptos con documentos en 3 días, contra 4 de los 3 anteriores.\nQué vigilar: si los que prometen mandarla “al rato” la mandan.' },
      { origen: 'analista', id: 31, titulo: 'Meta Ads · reporte semanal', creado: h(30),
        resumen: '<b>El costo por conversación bajó 18 %</b>\nCómo vamos: $742 de gasto y 96 conversaciones, contra $810 y 82 la semana anterior.' },
      { origen: 'supervisor', id: 1, titulo: 'Supervisor de Alex · semanal', creado: h(32),
        resumen: '13 aptos con documentos esta semana, 5 más que la anterior.\nPropuestas abajo.' },
      { origen: 'mensual', id: '2026-10', titulo: 'Reporte mensual para la gerencia · 2026-10', creado: h(400), url: 'https://drive.google.com/' },
    ],
  });
}

/** `{ datos }`, `{ sinConectar: true }` si falta la función en la base; otro error se propaga. */
export async function cargarResumen(modo, store) {
  if (modo === 'demo') return { datos: demo() };
  if (typeof store?.resumenDia !== 'function') return { sinConectar: true };
  try {
    return { datos: normalizarResumen(await store.resumenDia()) };
  } catch (err) {
    if (err?.sinInstalar) return { sinConectar: true };
    throw err;
  }
}
