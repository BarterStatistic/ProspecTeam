import { test } from 'node:test';
import assert from 'node:assert/strict';
import { leerCotizadorPT } from '../lib/extraer-catalogo.mjs';

test('extrae los 37 modelos del cotizador PT', () => {
  const { MODELS } = leerCotizadorPT();
  assert.equal(MODELS.length, 37);
  assert.deepEqual(MODELS[0], ['U2', 21945, 2287]);
  assert.deepEqual(MODELS.at(-1), ['HEAVY CAB 300', 90195, 5832]);
});

test('extrae los 7 esquemas con sus niveles y multiplicadores', () => {
  const { SCHEMES } = leerCotizadorPT();
  assert.deepEqual(Object.keys(SCHEMES), [
    'motonomina', 'credinamo', 'motoxpress', 'enganche50',
    'motonomina_flex', 'credinamo_flex', 'motoxpress_flex',
  ]);
  assert.equal(SCHEMES.motonomina.min, 5);
  assert.equal(SCHEMES.motonomina.levels.length, 3);
  assert.equal(SCHEMES.motonomina.levels[2].m[72], 0.035218);
  assert.ok(SCHEMES.motoxpress_flex.terms.includes(144));
  assert.equal(SCHEMES.motonomina_flex.levels[0].m[96], 0.0207137);
});

test('falla con mensaje claro si no encuentra MODELS', () => {
  assert.throws(() => leerCotizadorPT('<html></html>'), /No se encontró "const MODELS=\["/);
});
