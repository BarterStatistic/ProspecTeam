// Pruebas de armarEstado (nodo "Contexto cliente" de ALEX 3.3).
// Correr: node --test alex/contexto-cliente.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// El archivo es el cuerpo de un nodo Code de n8n: se toma solo la funcion pura.
const fuente = readFileSync(new URL('./contexto-cliente.js', import.meta.url), 'utf8');
const armarEstado = new Function(fuente.split('// --- n8n ---')[0] + '\nreturn armarEstado;')();

const paso = (x) => armarEstado(x).siguiente_paso;

test('cliente nuevo: sin datos, paso 1', () => {
  const r = armarEstado({});
  assert.match(r.estado, /Cliente nuevo/);
  assert.match(r.siguiente_paso, /PASO 1/);
});

test('el nombre de WhatsApp que es un telefono no se usa', () => {
  assert.doesNotMatch(armarEstado({ nombreWa: '+52 1 844 123 4567' }).estado, /Nombre en WhatsApp/);
  assert.match(armarEstado({ nombreWa: 'Rafael' }).estado, /Nombre en WhatsApp: Rafael/);
});

test('avanza por los datos que faltan, en orden', () => {
  const attrs = { moto_interes: 'Rayo 175' };
  assert.match(paso({ attrs }), /PASO 3/);
  attrs.ingresos = 'nomina en tarjeta';
  assert.match(paso({ attrs }), /PASO 4/);
  attrs.antiguedad_laboral = '2 anos';
  assert.match(paso({ attrs }), /PASO 5/);
  attrs.municipio = 'Saltillo';
  assert.match(paso({ attrs }), /PASO 6, CIERRE/);
});

test('MotoXpress no necesita antiguedad', () => {
  assert.match(paso({ labels: ['motoxpress'], attrs: { moto_interes: 'U2' } }), /PASO 5/);
});

test('contado: con la moto ya se pide la INE, sin preguntas de credito', () => {
  assert.match(paso({ labels: ['contado'], attrs: { moto_interes: 'Heavy Max 250' } }), /CIERRE DE CONTADO/);
});

test('con INE recibida no se vuelve a pedir', () => {
  const r = paso({ labels: ['documentacion', 'cumple_requisitos'], attrs: { moto_interes: 'R4', documentos: 'INE ambos lados' } });
  assert.match(r, /Ya mando su INE/);
});

test('no cumple: se trabaja la alternativa aunque haya mandado INE', () => {
  const r = paso({ labels: ['documentacion', 'no_cumple_requisitos'], attrs: { moto_interes: 'R4', documentos: 'INE ambos lados (no apta)' } });
  assert.match(r, /alternativa/);
});

test('si un vendedor ya lo paso a Procesos en Marga, Alex no pide papeles', () => {
  const r = paso({ attrs: { moto_interes: 'R4' }, ctx: { tarjeta: { en_proceso: true, vendedor: 'Emmanuel Bernal' } } });
  assert.match(r, /YA lo lleva Emmanuel Bernal/);
});

test('el anuncio de origen aparece en el estado', () => {
  assert.match(armarEstado({ ctx: { anuncio: 'Estrena con 5% de enganche' } }).estado, /Anuncio por el que llego.*5% de enganche/);
});

test('atributos viejos de Chatwoot (tipo_compra, perfil_credito) tambien cuentan', () => {
  const r = armarEstado({ attrs: { tipo_compra: 'credito', perfil_credito: 'dueno_negocio_flex', moto_interes: 'Xtreme RLX 200' } });
  assert.match(r.estado, /Compra: credito/);
  assert.match(r.siguiente_paso, /PASO 4/);
});

test('las directivas aprobadas del Supervisor van al final del estado', () => {
  const r = armarEstado({ attrs: { moto_interes: 'R4' }, ctx: { directivas: '1. Con el catalogo, recomienda dos modelos.' } });
  assert.match(r.estado, /NEXT STEP[\s\S]*SUPERVISOR DIRECTIVES[\s\S]*1\. Con el catalogo/);
  assert.doesNotMatch(armarEstado({}).estado, /SUPERVISOR DIRECTIVES/);
});

test('un contexto con error de la llamada a Marga no rompe nada', () => {
  assert.match(paso({ ctx: { error: { message: 'timeout' } } }), /PASO 1/);
});
