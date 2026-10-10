// Catálogo compartido de Dinamo en Supabase (función catalogo()). Lo leen
// también Alex y los 5 cotizadores: un cambio de precio o de factores se hace
// en un solo lugar. Si Supabase falla, tarda o responde algo con forma
// inesperada, Marga sigue con los datos de respaldo de motos.js.
import { SCHEME_IDS, aplicarCatalogo } from './motos.js';

export const CATALOGO_URL = 'https://ehyqexzaauvjoioafqdz.supabase.co/rest/v1/rpc/catalogo';
// Clave publicable: solo permite leer el catálogo (RLS de lectura pública).
export const CATALOGO_KEY = 'sb_publishable_wHca_29_5WG40UG0w9TSlg_D6UnWHnP';
export const CATALOGO_TIMEOUT_MS = 3000;

const esNumero = (v) => typeof v === 'number' && Number.isFinite(v);

function esquemaValido(e) {
  return (
    !!e &&
    esNumero(e.min) && esNumero(e.max) && e.min >= 0 && e.min <= e.max && e.max <= 100 &&
    (e.termUnit === 'quincenas' || e.termUnit === 'semanas') &&
    Array.isArray(e.terms) && e.terms.length > 0 &&
    e.terms.every((t) => Number.isInteger(t) && t > 0) &&
    Array.isArray(e.levels) && e.levels.length > 0 &&
    e.levels.every(
      (l) =>
        l && Array.isArray(l.range) && l.range.length === 2 &&
        esNumero(l.range[0]) && esNumero(l.range[1]) && l.range[0] <= l.range[1] &&
        !!l.m && e.terms.every((t) => esNumero(l.m[t]) && l.m[t] > 0),
    )
  );
}

/** true si `cat` tiene la forma de catalogo() y números con sentido. */
export function catalogoValido(cat) {
  if (!cat || !Array.isArray(cat.modelos) || cat.modelos.length === 0) return false;
  const modelosOk = cat.modelos.every(
    (m) =>
      Array.isArray(m) && typeof m[0] === 'string' && m[0].trim() !== '' &&
      esNumero(m[1]) && m[1] > 0 && esNumero(m[2]) && m[2] >= 0,
  );
  if (!modelosOk || !cat.esquemas || typeof cat.esquemas !== 'object') return false;
  // Un esquema que no venga se queda con los datos de respaldo.
  return SCHEME_IDS.every((id) => cat.esquemas[id] === undefined || esquemaValido(cat.esquemas[id]));
}

/**
 * Pide el catálogo y, si es válido, lo aplica sobre MODELS y SCHEMES.
 * Nunca lanza: resuelve 'aplicado', 'sin-cambios' o 'respaldo'.
 */
export async function cargarCatalogoRemoto({ fetchFn = globalThis.fetch, timeoutMs = CATALOGO_TIMEOUT_MS } = {}) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const r = await fetchFn(CATALOGO_URL, {
      method: 'POST',
      body: '{}',
      cache: 'no-store',
      signal: ctl.signal,
      headers: { apikey: CATALOGO_KEY, 'Content-Type': 'application/json' },
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const cat = await r.json();
    if (!catalogoValido(cat)) throw new Error('forma inesperada');
    return aplicarCatalogo(cat) ? 'aplicado' : 'sin-cambios';
  } catch (e) {
    console.warn('Catálogo en línea no disponible; se usan los datos de respaldo.', e);
    return 'respaldo';
  } finally {
    clearTimeout(timer);
  }
}
