// Posición de un menú flotante (position: fixed) junto al botón que lo abre.
// Puro: recibe el rectángulo del botón y el tamaño de la ventana, sin tocar
// el DOM, para poder probarlo.

/** Alto mínimo que se busca debajo del botón antes de preferir abrir hacia arriba. */
const ALTO_PREFERIDO = 320;

/**
 * El menú se alinea al borde derecho del botón y abre hacia abajo si cabe; si
 * no, hacia el lado con más espacio. Nunca se sale de la ventana: `left` se
 * acota a los márgenes y `maxHeight` al espacio disponible (el menú hace scroll).
 * Devuelve { left, top | bottom, maxHeight } en píxeles de la ventana.
 */
export function posicionMenu(rect, viewport, { ancho = 224, margen = 8, separacion = 4 } = {}) {
  const left = Math.max(margen, Math.min(rect.right - ancho, viewport.width - ancho - margen));
  const abajo = viewport.height - rect.bottom - separacion - margen;
  const arriba = rect.top - separacion - margen;
  if (abajo >= ALTO_PREFERIDO || abajo >= arriba) {
    return { left, top: rect.bottom + separacion, maxHeight: Math.max(abajo, 0) };
  }
  return { left, bottom: viewport.height - rect.top + separacion, maxHeight: Math.max(arriba, 0) };
}
