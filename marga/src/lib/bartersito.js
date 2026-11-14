// Chat con Bartersito desde Marga. Bartersito es el asistente personal del
// administrador (el mismo de Telegram); ver canUsarBartersito en permissions.js.
//
// El mensaje pasa por la Edge Function `marga-bartersito`, que comprueba que
// la sesión sea de administrador y lo reenvía a n8n con una clave que vive en
// el servidor: el navegador nunca conoce la dirección ni la clave de n8n.
// Mientras la función o su entrada en n8n no existan, se contesta que no está
// conectado en vez de inventar una respuesta.

import { canUsarBartersito } from './permissions.js';

export const SUGERENCIAS = [
  '¿Qué anuncio trae más calientes?',
  '¿Cuánto llevo gastado este mes?',
  'Resumen de hoy',
];

export const SALUDO = 'Hola. Pregúntame por los anuncios, los leads o las ventas.';

export const SIN_CONEXION =
  'Todavía no estoy conectado a Marga. Mientras tanto, escríbeme por Telegram.';

// Respuestas de muestra, solo para el modo demo.
const DEMO = {
  '¿Qué anuncio trae más calientes?': {
    texto: 'El de “Te autorizamos al instante”: 17 calientes de 131 leads.',
    grafica: [
      { label: 'Te autorizamos', value: 17 },
      { label: '5% de enganche', value: 16 },
      { label: 'Potencia y estilo', value: 9 },
      { label: 'Reel de entrega', value: 5 },
    ],
  },
  '¿Cuánto llevo gastado este mes?': {
    texto: '$6,550 en anuncios de la cuenta propia. El gasto de la cuenta interna no lo puedo ver.',
  },
  'Resumen de hoy': {
    texto:
      '18 leads nuevos, 7 calientes y 4 sin atender. Hay una idea y una propuesta esperando tu decisión.',
  },
};

/**
 * Manda una pregunta a Bartersito. Devuelve `{ texto, grafica? }`.
 * Rechaza a cualquier rol que no sea administrador, aunque alguien llegue a
 * llamarla sin pasar por la interfaz (el servidor lo comprueba otra vez).
 */
export async function preguntarBartersito(texto, { role, modo, store }) {
  if (!canUsarBartersito(role)) {
    throw new Error('Solo el administrador puede hablar con Bartersito.');
  }
  if (modo === 'demo') {
    await new Promise((r) => setTimeout(r, 450));
    return DEMO[texto] ?? { texto: 'Esto es el modo demo: aquí contestaría Bartersito con datos en vivo.' };
  }
  if (typeof store?.bartersito !== 'function') return { texto: SIN_CONEXION };
  try {
    const r = await store.bartersito(texto);
    return r?.texto ? r : { texto: SIN_CONEXION };
  } catch (err) {
    if (err?.sinInstalar || /no está conectado/i.test(err?.message ?? '')) return { texto: SIN_CONEXION };
    throw err;
  }
}
