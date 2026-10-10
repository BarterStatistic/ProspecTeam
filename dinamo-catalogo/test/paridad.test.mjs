// Paridad JS ↔ SQL: bloqueante para cambiar a Alex (Task 6).
// Recorre modelo × esquema × enganche representativo × con/sin servicio y
// compara cada parcialidad al peso.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { leerCotizadorPT } from '../lib/extraer-catalogo.mjs';
import { cotizarJS } from '../lib/cotizar.mjs';
import { rpc } from '../lib/rpc.mjs';

const { MODELS, SCHEMES } = leerCotizadorPT();

// Bordes y punto medio de cada nivel, recortados al rango válido del esquema.
function enganchesDe(sc) {
  const set = new Set();
  for (const { range: [a, b] } of sc.levels) {
    const lo = Math.max(a, sc.min);
    const hi = Math.min(b, sc.max);
    if (lo > hi) continue;
    set.add(lo);
    set.add(hi);
    set.add(Math.round(((lo + hi) / 2) * 100) / 100);
  }
  return [...set].sort((x, y) => x - y);
}

const casos = [];
for (const [esquemaId, sc] of Object.entries(SCHEMES)) {
  for (const enganche of enganchesDe(sc)) {
    for (const [nombre] of MODELS) {
      for (const conServicio of [false, true]) casos.push({ nombre, esquemaId, enganche, conServicio });
    }
  }
}

async function enParalelo(items, n, fn) {
  let i = 0;
  await Promise.all(Array.from({ length: n }, async () => {
    while (i < items.length) await fn(items[i++]);
  }));
}

test(`cotizar() coincide al peso con el cotizador PT (${casos.length} casos)`, { timeout: 600_000 }, async () => {
  const diferencias = [];
  await enParalelo(casos, 16, async (c) => {
    const esperado = cotizarJS(MODELS, SCHEMES, c.nombre, c.esquemaId, c.enganche, c.conServicio);
    const filas = await rpc('cotizar', {
      p_modelo: c.nombre, p_esquema: c.esquemaId, p_enganche: c.enganche, p_con_servicio: c.conServicio,
    });
    const obtenido = Object.fromEntries(filas.map((f) => [f.plazo, f.parcialidad]));
    if (JSON.stringify(obtenido) !== JSON.stringify(esperado)) diferencias.push({ ...c, esperado, obtenido });
  });
  assert.deepEqual(diferencias.slice(0, 10), [], `${diferencias.length} casos difieren`);
});
