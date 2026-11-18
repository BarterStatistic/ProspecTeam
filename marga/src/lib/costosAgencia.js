// Desglose del costo de IA de la agencia (Panel ADMIN → Publicidad → "Costo de la agencia").
//
// En producción sale de la función `marga_costos_agencia` (supabase/marga_costos_agencia.sql), que rechaza a quien
// no sea administrador. En modo demo se usan datos de muestra con la misma forma.
//
// El costo está en dólares y viene de `agencia_costos`. Una llamada sin precio conocido (por ejemplo Speko, que no
// publica tarifa) trae `usd: null`: se muestra "—" y se cuenta aparte en `sinPrecio`, nunca como $0.

const DAY = 86_400_000;

const num = (v) => (v == null ? null : Number(v));
const n0 = (v) => num(v) ?? 0;

/** 'YYYY-MM-DD' → milisegundos a medianoche local (sin el corrimiento de UTC). */
function fechaLocal(valor) {
  if (typeof valor === 'number') return valor;
  const m = String(valor ?? '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getTime() : null;
}

/** ms → 'YYYY-MM-DD' en hora local (valor de un <input type="date"> y parámetro de la función). */
export function aISO(ts) {
  const d = new Date(ts);
  const p = (x) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

const grupo = (g) => ({
  nombre: String(g.nombre ?? 'Sin nombre'),
  agente: g.agente == null ? null : String(g.agente),
  usd: num(g.usd),
  llamadas: n0(g.llamadas),
  tokensEntrada: n0(g.tokensEntrada),
  tokensSalida: n0(g.tokensSalida),
  unidades: num(g.unidades),
});

/** Da forma estable a lo que devuelve la función de Supabase. */
export function normalizarCostos(d) {
  if (!d || typeof d !== 'object') return null;
  return {
    esDemo: !!d.esDemo,
    desde: fechaLocal(d.desde),
    hasta: fechaLocal(d.hasta),
    totalUsd: n0(d.totalUsd),
    tokensEntrada: n0(d.tokensEntrada),
    tokensSalida: n0(d.tokensSalida),
    llamadas: n0(d.llamadas),
    sinPrecio: n0(d.sinPrecio),
    porAgente: (d.porAgente ?? []).map(grupo),
    porPaso: (d.porPaso ?? []).map(grupo),
    porModelo: (d.porModelo ?? []).map(grupo),
    porDia: (d.porDia ?? []).map((x) => ({ fecha: fechaLocal(x.fecha), usd: n0(x.usd) })),
    detalle: (d.detalle ?? []).map((x) => ({
      cuando: typeof x.cuando === 'number' ? x.cuando : Date.parse(x.cuando),
      flujo: String(x.flujo ?? ''),
      agente: String(x.agente ?? ''),
      modelo: String(x.modelo ?? ''),
      tokensEntrada: n0(x.tokensEntrada),
      tokensSalida: n0(x.tokensSalida),
      unidades: num(x.unidades),
      usd: num(x.usd),
    })),
  };
}

/**
 * Rangos rápidos del filtro. `hoy` es medianoche local de hoy; "mes" va del día 1 al día de hoy.
 * Devuelve { desde, hasta } como 'YYYY-MM-DD'.
 */
export function rangoRapido(clave, hoy = Date.now()) {
  const h = new Date(hoy);
  const base = new Date(h.getFullYear(), h.getMonth(), h.getDate()).getTime();
  switch (clave) {
    case 'hoy':
      return { desde: aISO(base), hasta: aISO(base) };
    case '7':
      return { desde: aISO(base - 6 * DAY), hasta: aISO(base) };
    case 'mes':
      return { desde: aISO(new Date(h.getFullYear(), h.getMonth(), 1).getTime()), hasta: aISO(base) };
    case '90':
      return { desde: aISO(base - 89 * DAY), hasta: aISO(base) };
    case '30':
    default:
      return { desde: aISO(base - 29 * DAY), hasta: aISO(base) };
  }
}

/** Valida el rango del filtro. Devuelve un texto de error o null si está bien. */
export function validarRango(desde, hasta) {
  if (!desde || !hasta) return 'Elige las dos fechas.';
  if (desde > hasta) return 'La fecha inicial es posterior a la final.';
  return null;
}

/** Datos de muestra para el modo demo (deterministas, sin azar). */
function demo(desde, hasta, ahora = Date.now()) {
  const h = new Date(ahora);
  const hoy = new Date(h.getFullYear(), h.getMonth(), h.getDate()).getTime();
  const fin = Math.min(fechaLocal(hasta) ?? hoy, hoy);
  const ini = Math.min(fechaLocal(desde) ?? fin - 29 * DAY, fin);
  const dias = Math.min(366, Math.round((fin - ini) / DAY) + 1);
  const pasos = [
    ['Creativo', 'gpt-5.4-mini', 52_000, 9_400, 0.081],
    ['Investigador', 'gpt-5.4-mini', 85_500, 24_900, 0.176],
    ['Aprendizaje - Analizar', 'gpt-5.4', 31_000, 3_800, 0.135],
    ['Productor - voz', 'speko', 0, 0, null],
  ];
  const detalle = [];
  const porDia = [];
  for (let i = 0; i < dias; i++) {
    const f = ini + i * DAY;
    let suma = 0;
    pasos.forEach(([flujo, modelo, tin, tout, usd], j) => {
      if ((i + j) % 3 !== 0) return;
      const k = 0.6 + ((i * 7 + j * 3) % 9) / 10;
      const costo = usd == null ? null : Number((usd * k).toFixed(4));
      suma += costo ?? 0;
      detalle.push({
        cuando: f + (7 + j) * 3_600_000, flujo, agente: flujo.split(' - ')[0], modelo,
        tokensEntrada: Math.round(tin * k), tokensSalida: Math.round(tout * k),
        unidades: usd == null ? 420 : null, usd: costo,
      });
    });
    porDia.push({ fecha: f, usd: Number(suma.toFixed(4)) });
  }
  detalle.sort((a, b) => b.cuando - a.cuando);
  const agrupa = (clave, extra = () => ({})) => {
    const m = new Map();
    for (const r of detalle) {
      const k = clave(r);
      const g = m.get(k) ?? { nombre: k, ...extra(r), usd: null, llamadas: 0, tokensEntrada: 0, tokensSalida: 0 };
      g.usd = r.usd == null ? g.usd : (g.usd ?? 0) + r.usd;
      g.llamadas += 1;
      g.tokensEntrada += r.tokensEntrada;
      g.tokensSalida += r.tokensSalida;
      m.set(k, g);
    }
    return [...m.values()].sort((a, b) => (b.usd ?? -1) - (a.usd ?? -1));
  };
  return normalizarCostos({
    esDemo: true,
    desde: ini,
    hasta: fin,
    totalUsd: detalle.reduce((a, r) => a + (r.usd ?? 0), 0),
    tokensEntrada: detalle.reduce((a, r) => a + r.tokensEntrada, 0),
    tokensSalida: detalle.reduce((a, r) => a + r.tokensSalida, 0),
    llamadas: detalle.length,
    sinPrecio: detalle.filter((r) => r.usd == null).length,
    porAgente: agrupa((r) => r.agente),
    porPaso: agrupa((r) => r.flujo, (r) => ({ agente: r.agente })),
    porModelo: agrupa((r) => r.modelo),
    porDia,
    detalle: detalle.slice(0, 300),
  });
}

/**
 * Lee el desglose. Devuelve `{ datos }` o `{ sinConectar: true }` cuando la base todavía no tiene la función (o el
 * almacén no es Supabase). Cualquier otro fallo se propaga para que la pantalla lo muestre.
 */
export async function cargarCostos(modo, store, desde, hasta) {
  if (modo === 'demo') return { datos: demo(desde, hasta) };
  if (typeof store?.costosAgencia !== 'function') return { sinConectar: true };
  try {
    return { datos: normalizarCostos(await store.costosAgencia(desde, hasta)) };
  } catch (err) {
    if (err?.sinInstalar) return { sinConectar: true };
    throw err;
  }
}

/** Dólares con 2 decimales; con 4 si es menos de un centavo (para no mostrar US$0.00 de algo que sí costó). */
export function usd(n) {
  if (n == null) return '—';
  const v = Number(n);
  return `US$${(v !== 0 && Math.abs(v) < 0.01 ? v.toFixed(4) : v.toFixed(2))}`;
}

/** 24899 → "24,899"; 1_250_000 → "1.25 M". */
export function tokens(n) {
  const v = Number(n ?? 0);
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(2)} M`;
  return v.toLocaleString('es-MX');
}
