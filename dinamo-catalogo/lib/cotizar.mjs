// Copia fiel del cálculo de render() en cotizador-pt/index.html (líneas 908–949).
// Es la referencia contra la que se prueba cotizar() de Postgres.
export function cotizarJS(MODELS, SCHEMES, nombre, esquemaId, enganche, conServicio) {
  const fila = MODELS.find(([n]) => n === nombre);
  const sc = SCHEMES[esquemaId];
  if (!fila || !sc || !(enganche >= sc.min && enganche <= sc.max)) return null;
  const [, listPrice, svcPrice = 0] = fila;
  const price = listPrice + (conServicio ? svcPrice : 0);
  const downAmt = price * (enganche / 100);
  const fin = price - downAmt;
  const lvl = sc.levels.find((l) => enganche >= l.range[0] && enganche <= l.range[1]);
  if (!lvl) return null;
  return Object.fromEntries(sc.terms.map((t) => [t, Math.round(fin * lvl.m[t])]));
}
