// Lee MODELS y SCHEMES directamente del <script> de un cotizador.
// Es la única forma de usar cotizador-pt/index.html como fuente de verdad
// sin duplicar los datos a mano.
import { readFileSync } from 'node:fs';

function tomarLiteral(html, inicio, cierre) {
  const i = html.indexOf(inicio);
  if (i < 0) throw new Error(`No se encontró "${inicio}" en el cotizador`);
  const j = html.indexOf(cierre, i);
  if (j < 0) throw new Error(`No se encontró el cierre "${cierre}" después de "${inicio}"`);
  // Desde el "[" o "{" de apertura hasta el "]" o "}" de cierre, sin el ";".
  const literal = html.slice(i + inicio.length - 1, j + cierre.length - 1);
  return new Function(`return (${literal});`)();
}

export function extraerCatalogo(html) {
  return {
    MODELS: tomarLiteral(html, 'const MODELS=[', '\n];'),
    SCHEMES: tomarLiteral(html, 'const SCHEMES={', '\n};'),
  };
}

export function leerCotizadorPT(html) {
  const fuente = html ?? readFileSync(new URL('../../cotizador-pt/index.html', import.meta.url), 'utf8');
  return extraerCatalogo(fuente);
}
