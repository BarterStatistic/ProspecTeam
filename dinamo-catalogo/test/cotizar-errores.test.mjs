import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rpc } from '../lib/rpc.mjs';

const args = (extra) => ({ p_modelo: 'U2', p_esquema: 'motonomina', p_enganche: 5, p_con_servicio: false, ...extra });

test('U2 Motonomina 5 % sin servicio a 72 quincenas = 844 (igual que Motos)', async () => {
  const filas = await rpc('cotizar', args());
  const f72 = filas.find((f) => f.plazo === 72);
  assert.equal(f72.parcialidad, 844);
  assert.equal(f72.unidad, 'quincenas');
  assert.equal(filas.length, 7);
});

test('con servicio suma el preventivo al precio', async () => {
  const [f] = await rpc('cotizar', args({ p_con_servicio: true }));
  assert.equal(Number(f.precio), 21945 + 2287);
});

test('modelo inexistente da error en español', async () => {
  await assert.rejects(rpc('cotizar', args({ p_modelo: 'NO EXISTE' })), /Modelo no encontrado o inactivo/);
});

test('modelo inactivo da error', async () => {
  await assert.rejects(rpc('cotizar', args({ p_modelo: 'Monkey' })), /Modelo no encontrado o inactivo/);
});

test('esquema inexistente da error', async () => {
  await assert.rejects(rpc('cotizar', args({ p_esquema: 'nada' })), /Esquema no encontrado/);
});

test('enganche bajo el mínimo da error', async () => {
  await assert.rejects(rpc('cotizar', args({ p_esquema: 'credinamo', p_enganche: 5 })), /fuera del rango/);
});

test('enganche sobre el máximo da error', async () => {
  await assert.rejects(rpc('cotizar', args({ p_enganche: 80 })), /fuera del rango/);
});

test('enganche en un hueco entre niveles da error', async () => {
  await assert.rejects(rpc('cotizar', args({ p_enganche: 24.995 })), /No hay nivel/);
});
