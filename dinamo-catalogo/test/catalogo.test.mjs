import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rpc } from '../lib/rpc.mjs';
import { leerCotizadorPT } from '../lib/extraer-catalogo.mjs';

const { MODELS, SCHEMES } = leerCotizadorPT();

// JSON convierte las llaves numéricas de "m" en texto; se normaliza igual que la respuesta.
const comoJSON = (x) => JSON.parse(JSON.stringify(x));

test('catalogo() trae la lista vigente', async () => {
  const cat = await rpc('catalogo');
  assert.equal(cat.lista_vigente, '2026-08-25');
});

test('catalogo().modelos es idéntico a MODELS del cotizador', async () => {
  const cat = await rpc('catalogo');
  assert.deepStrictEqual(cat.modelos, MODELS);
});

test('catalogo().esquemas es idéntico a SCHEMES, en el mismo orden', async () => {
  const cat = await rpc('catalogo');
  assert.deepEqual(Object.keys(cat.esquemas), Object.keys(SCHEMES));
  assert.deepStrictEqual(cat.esquemas, comoJSON(SCHEMES));
});
