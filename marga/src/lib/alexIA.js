// Datos de la pestaña "Alex IA" (Panel ADMIN, solo administrador).
//
// En producción salen de `marga_panel_alex` (supabase/alex_supervisor.sql), que rechaza a quien
// no sea administrador. Las decisiones van por `marga_alex_decidir`, la misma función que usa el
// botón de Telegram del Supervisor de Alex: una propuesta se decide una sola vez.
// En modo demo se usan datos de muestra con la misma forma.
//
// La medida que manda es una: clientes aptos que mandan documentación.
//
// Límites que la pantalla debe decir tal cual:
//   · Los costos son ESTIMADOS (llamadas al modelo × tokens promedio × precio) y se proyectan
//     a 30 días; con menos de 7 días medidos vienen marcados como preliminares.
//   · Los costos están en dólares: no hay tipo de cambio guardado.

const DAY = 86_400_000;
const num = (v) => (v == null || v === '' ? 0 : Number(v));
const ts = (v) => (v == null ? null : typeof v === 'number' ? v : Date.parse(v));
const lista = (v) => (Array.isArray(v) ? v : []);

/** 'YYYY-MM-DD' → milisegundos a medianoche local (sin el corrimiento de UTC). */
export function fechaLocal(valor) {
  if (typeof valor === 'number') return valor;
  const m = String(valor ?? '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getTime() : null;
}

function embudo(e) {
  return {
    conversaciones: num(e?.conversaciones),
    interesados: num(e?.interesados),
    conDocumentos: num(e?.con_documentos),
    aptos: num(e?.aptos_con_documentos),
    noCumplen: num(e?.no_cumplen),
    proceso: num(e?.pasaron_a_proceso),
    ventas: num(e?.ventas),
    pctAptos: e?.pct_aptos_con_documentos == null ? null : Number(e.pct_aptos_con_documentos),
  };
}

function costos(c) {
  if (!c || !c.medido) return { medido: false, config: lista(c?.config).map(conf) };
  return {
    medido: true,
    preliminar: !!c.preliminar,
    desde: ts(c.desde),
    diasMedidos: num(c.dias_medidos),
    llamadas: num(c.llamadas_modelo),
    respuestas: num(c.respuestas_enviadas),
    imagenes: num(c.imagenes),
    audios: num(c.audios),
    iaUsdMes: num(c.ia_usd_mes),
    waMensajesMes: num(c.wa_mensajes_mes),
    waGratisMes: num(c.wa_gratis_mes),
    waCobrablesMes: num(c.wa_cobrables_mes),
    waUsdMes: num(c.wa_usd_mes),
    totalUsdMes: num(c.total_usd_mes),
    config: lista(c.config).map(conf),
  };
}

function conf(x) {
  return { clave: String(x.clave ?? ''), valor: num(x.valor), nota: String(x.nota ?? ''), fuente: String(x.fuente ?? '') };
}

/** Da forma estable a lo que devuelve la base (o el demo). */
export function normalizarAlex(d) {
  if (!d || typeof d !== 'object') return null;
  return {
    esDemo: !!d.esDemo,
    generado: ts(d.generado),
    dias: num(d.dias),
    porDia: lista(d.porDia).map((x) => ({
      fecha: fechaLocal(x.fecha), conversaciones: num(x.conversaciones), conDocumentos: num(x.conDocumentos), aptos: num(x.aptos),
    })),
    porSemana: lista(d.porSemana).map((s) => ({ semana: fechaLocal(s.semana), ...embudo(s) })),
    periodo: embudo(d.periodo),
    semana: embudo(d.semana),
    semanaAnterior: embudo(d.semanaAnterior),
    dondeSeQuedaron: Object.entries(d.dondeSeQuedaron ?? {})
      .map(([label, value]) => ({ label, value: num(value) }))
      .sort((a, b) => b.value - a.value),
    reportes: lista(d.reportes).map((r) => ({
      id: String(r.id), tipo: r.tipo === 'semanal' ? 'semanal' : 'avance', desde: fechaLocal(r.desde), hasta: fechaLocal(r.hasta),
      resumen: String(r.resumen ?? ''), creado: ts(r.creado),
    })),
    propuestas: lista(d.propuestas).map((p) => ({
      id: String(p.id), tipo: String(p.tipo ?? ''), titulo: String(p.titulo ?? ''), problema: String(p.problema ?? ''),
      evidencia: String(p.evidencia ?? ''), directiva: String(p.directiva ?? ''), impacto: String(p.impacto ?? ''),
      estado: String(p.estado ?? 'pendiente'), creado: ts(p.creado), decidido: ts(p.decidido), desde: p.desde ?? null,
    })),
    directivas: lista(d.directivas).map((x) => ({
      id: String(x.id), texto: String(x.texto ?? ''), motivo: String(x.motivo ?? ''), desde: ts(x.desde),
    })),
    costos: costos(d.costos),
  };
}

export const TIPO_PROPUESTA = {
  agregar: 'Directiva nueva para Alex',
  retirar: 'Retirar una directiva',
  infraestructura: 'Cambio de infraestructura (manual)',
};

/** Qué pasa al aprobar una propuesta, dicho para quien decide. */
export function efectoDeAprobar(tipo) {
  if (tipo === 'agregar') return 'Al aprobarla, Alex la aplica desde su siguiente mensaje.';
  if (tipo === 'retirar') return 'Al aprobarla, Alex deja de aplicar esa directiva.';
  return 'Aprobarla solo la deja anotada: este cambio se hace a mano.';
}

/**
 * El resumen del Supervisor llega con <b> (formato de Telegram). Lo parte en trozos
 * `{ texto, negrita }` para pintarlo sin insertar HTML; cualquier otra etiqueta se quita.
 */
export function trozosDeResumen(resumen) {
  const out = [];
  let negrita = false;
  for (const parte of String(resumen ?? '').split(/(<\/?b>)/i)) {
    if (/^<b>$/i.test(parte)) negrita = true;
    else if (/^<\/b>$/i.test(parte)) negrita = false;
    else if (parte) out.push({ texto: parte.replace(/<[^>]*>/g, ''), negrita });
  }
  return out;
}

/** Cambio de la medida contra la semana anterior: { diferencia, texto }. */
export function cambioSemanal(d) {
  const diferencia = d.semana.aptos - d.semanaAnterior.aptos;
  const texto = diferencia === 0 ? 'Igual que la semana anterior' : `${diferencia > 0 ? '+' : ''}${diferencia} contra la semana anterior`;
  return { diferencia, texto };
}

export const pendientes = (d) => (d ? d.propuestas.filter((p) => p.estado === 'pendiente') : []);

// ---------- Demo ----------

let demoEstado = null;

function demoInicial(ahora = Date.now()) {
  const hoy = new Date(ahora);
  const base = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate()).getTime();
  const iso = (t) => {
    const f = new Date(t);
    return `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, '0')}-${String(f.getDate()).padStart(2, '0')}`;
  };
  const forma = [9, 14, 11, 16, 12, 6, 4, 10, 15, 13, 17, 12, 7, 5, 11, 16, 14, 18, 13, 8, 5, 12, 17, 15, 19, 14, 9, 6];
  const porDia = forma.map((n, i) => ({
    fecha: iso(base - (forma.length - 1 - i) * DAY), conversaciones: n,
    conDocumentos: Math.round(n * (i < 14 ? 0.09 : 0.16)), aptos: Math.round(n * (i < 14 ? 0.06 : 0.13)),
  }));
  const suma = (desde, hasta, k) => porDia.slice(desde, hasta).reduce((a, x) => a + x[k], 0);
  const emb = (a, b) => ({
    conversaciones: suma(a, b, 'conversaciones'), interesados: Math.round(suma(a, b, 'conversaciones') * 0.45),
    con_documentos: suma(a, b, 'conDocumentos'), aptos_con_documentos: suma(a, b, 'aptos'), no_cumplen: 3, pasaron_a_proceso: 2, ventas: 1,
    pct_aptos_con_documentos: Math.round((1000 * suma(a, b, 'aptos')) / Math.max(1, suma(a, b, 'conversaciones'))) / 10,
  });
  return {
    esDemo: true,
    generado: new Date(ahora).toISOString(),
    dias: forma.length,
    porDia,
    porSemana: [0, 7, 14, 21].map((i) => ({ semana: iso(base - (forma.length - 1 - i) * DAY), ...emb(i, i + 7) })),
    periodo: emb(0, 28),
    semana: emb(21, 28),
    semanaAnterior: emb(14, 21),
    dondeSeQuedaron: {
      'Alex pidió la INE y no llegó': 21, 'Después de mandar el catálogo': 14, 'Después de una cotización': 9,
      'Pregunta de ingresos': 7, 'Después de pasarlo con un asesor': 5, Otro: 6,
    },
    reportes: [
      { id: 2, tipo: 'avance', desde: iso(base - 3 * DAY), hasta: iso(base),
        resumen: '<b>La medida</b>: 6 aptos con documentos en 3 días, contra 4 de los 3 anteriores.\n<b>Dónde se quedan</b>: 8 conversaciones después de pedir la INE.\nQué vigilar: si los que prometen mandarla “al rato” la mandan.', creado: new Date(ahora - 8 * 3_600_000).toISOString() },
      { id: 1, tipo: 'semanal', desde: iso(base - 7 * DAY), hasta: iso(base),
        resumen: '13 aptos con documentos esta semana, 5 más que la anterior.\n<b>La medida</b>: 13 de 98 conversaciones (13.3 %).\n<b>Dónde se quedan</b>: 21 después de pedir la INE, 14 después del catálogo.\nPropuestas abajo.', creado: new Date(ahora - 3 * DAY).toISOString() },
    ],
    propuestas: [
      { id: 7, tipo: 'agregar', titulo: 'Recordar la hora pactada antes de despedirse', problema: '8 clientes dijeron “al rato te la mando” y no la mandaron.',
        evidencia: 'Conversación #2301: “ahorita que llegue a la casa”.', directiva: 'Cuando el cliente prometa mandar la INE más tarde, repite la hora que te dijo y pregunta si le recuerdas a esa hora.',
        impacto: 'Que al menos 3 de cada 8 que la prometen la manden.', estado: 'pendiente', creado: new Date(ahora - 3 * DAY).toISOString() },
      { id: 6, tipo: 'infraestructura', titulo: 'Probar un modelo más capaz para Alex', problema: 'Alex no guarda en el CRM 1 de cada 4 datos.',
        evidencia: '', directiva: '', impacto: 'Menos preguntas repetidas.', estado: 'aprobada', creado: new Date(ahora - 10 * DAY).toISOString(),
        decidido: new Date(ahora - 9 * DAY).toISOString(), desde: 'telegram' },
    ],
    directivas: [
      { id: 3, texto: 'Con el catálogo, recomienda dos modelos con su pago aproximado en vez de mandar solo el enlace.', motivo: '14 conversaciones murieron después del catálogo.',
        desde: new Date(ahora - 9 * DAY).toISOString() },
    ],
    costos: {
      medido: true, preliminar: false, desde: new Date(ahora - 28 * DAY).toISOString(), dias_medidos: 28, llamadas_modelo: 5400, respuestas_enviadas: 3100,
      imagenes: 140, audios: 60, ia_usd_mes: 36.4, wa_mensajes_mes: 1850, wa_gratis_mes: 1000, wa_cobrables_mes: 850, wa_usd_mes: 7.23, total_usd_mes: 43.63,
      config: [
        { clave: 'ia_usd_millon_entrada', valor: 0.25, nota: 'Gemini 3.1 Flash-Lite, tokens de entrada', fuente: 'Datos de ejemplo' },
        { clave: 'wa_servicio_usd', valor: 0.0085, nota: 'Mensaje de servicio de WhatsApp a México', fuente: 'Datos de ejemplo' },
      ],
    },
  };
}

/** Panel del modo demo (en memoria, se reinicia al recargar). */
export function demoAlex() {
  demoEstado ??= demoInicial();
  return normalizarAlex(demoEstado);
}

/** Decide en el modo demo con la misma regla que la base: una sola vez. */
export function demoDecidirAlex({ id, accion }) {
  demoEstado ??= demoInicial();
  const p = demoEstado.propuestas.find((x) => String(x.id) === String(id));
  if (!p) return { ok: false, error: 'No encontré esa propuesta.' };
  if (p.estado !== 'pendiente') return { ok: true, cambio: false, estado: p.estado, mensaje: `Ya estaba ${p.estado}.` };
  p.estado = accion === 'aprobar' ? 'aprobada' : 'rechazada';
  p.decidido = new Date().toISOString();
  p.desde = 'marga';
  if (accion === 'aprobar' && p.tipo === 'agregar') {
    demoEstado.directivas.push({ id: 100 + Number(p.id), texto: p.directiva, motivo: p.problema, desde: p.decidido });
  }
  return { ok: true, cambio: true, estado: p.estado, mensaje: accion === 'aprobar' ? efectoDeAprobar(p.tipo).replace('Al aprobarla, ', '') : 'Rechazada. Alex sigue igual.' };
}

/** Para las pruebas: vuelve al estado inicial del demo. */
export function reiniciarDemoAlex() {
  demoEstado = null;
}

/**
 * Lee el panel. `{ datos }`, o `{ sinConectar: true }` si la base todavía no tiene la función
 * (falta aplicar supabase/alex_supervisor.sql). Otro fallo se propaga.
 */
export async function cargarAlex(modo, store, dias = 56) {
  if (modo === 'demo') return { datos: demoAlex() };
  if (typeof store?.panelAlex !== 'function') return { sinConectar: true };
  try {
    return { datos: normalizarAlex(await store.panelAlex(dias)) };
  } catch (err) {
    if (err?.sinInstalar) return { sinConectar: true };
    throw err;
  }
}

/** Aprueba o rechaza una propuesta del Supervisor. Siempre resuelve con `{ ok, … }`. */
export async function decidirAlex(modo, store, { id, accion }) {
  if (!['aprobar', 'rechazar'].includes(accion) || !/^\d+$/.test(String(id))) return { ok: false, error: 'Decisión no válida.' };
  if (modo === 'demo') return demoDecidirAlex({ id, accion });
  if (typeof store?.decidirAlex !== 'function') return { ok: false, error: 'El Supervisor de Alex todavía no está conectado a Marga.' };
  try {
    return (await store.decidirAlex(Number(id), accion)) ?? { ok: false, error: 'Sin respuesta de la base.' };
  } catch (err) {
    return { ok: false, error: err?.message || 'No se pudo decidir. Intenta de nuevo.' };
  }
}
