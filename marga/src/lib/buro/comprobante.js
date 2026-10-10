// Comprobante de captura: se dibuja en un canvas y se baja como PNG.
//
// Port 1:1 de `ine-refacil/static/comprobante.js`, convertido a módulo ESM.
// Paleta propia, distinta a la de Marga: es un documento que se imprime, no una
// pantalla. Fondo blanco, azul y amarillo vibrante; el amarillo nunca lleva
// texto encima porque sobre blanco no alcanza contraste legible.

const TINTA = {
  blanco: '#ffffff',
  azul: '#1747e5',
  azulHondo: '#0f2f9e',
  amarillo: '#ffc800',
  texto: '#0f1523',
  suave: '#5b667c',
  linea: '#dfe4ee',
};

import { saveBlob } from '../saveFile.js';

export const LIENZO = { ancho: 1240, alto: 1754 };
const MARGEN = 88;
const TIPO = "'Segoe UI', system-ui, -apple-system, sans-serif";

function fuente(peso, tam) {
  return `${peso} ${tam}px ${TIPO}`;
}

/** Reduce el tamaño hasta que el texto quepa en el ancho disponible. */
function tamanoQueQuepa(ctx, texto, tamInicial, peso, anchoMax) {
  let tam = tamInicial;
  ctx.font = fuente(peso, tam);
  while (ctx.measureText(texto).width > anchoMax && tam > 20) {
    tam -= 2;
    ctx.font = fuente(peso, tam);
  }
  return tam;
}

/** Encabezado azul con el acento amarillo al pie. */
function dibujarCabecera(ctx) {
  const alto = 250;

  ctx.fillStyle = TINTA.azul;
  ctx.fillRect(0, 0, LIENZO.ancho, alto);

  // Bloque más oscuro a la derecha: da profundidad sin recurrir a un degradado.
  ctx.fillStyle = TINTA.azulHondo;
  ctx.fillRect(LIENZO.ancho - 180, 0, 180, alto);

  ctx.fillStyle = TINTA.amarillo;
  ctx.fillRect(0, alto - 12, LIENZO.ancho, 12);

  ctx.fillStyle = TINTA.blanco;
  ctx.font = fuente(700, 52);
  ctx.textBaseline = 'alphabetic';
  ctx.fillText('Comprobante de captura', MARGEN, 118);

  ctx.font = fuente(400, 24);
  ctx.fillStyle = 'rgba(255,255,255,0.82)';
  ctx.fillText('INE → Refácil · Agencia Dinamo Saltillo', MARGEN, 162);

  // Marca cuadrada en la esquina, en amarillo.
  ctx.fillStyle = TINTA.amarillo;
  ctx.fillRect(LIENZO.ancho - 138, 74, 96, 96);
  ctx.fillStyle = TINTA.azulHondo;
  ctx.font = fuente(700, 40);
  ctx.textAlign = 'center';
  ctx.fillText('PT', LIENZO.ancho - 90, 137);
  ctx.textAlign = 'left';
}

/** Imagen de la credencial, encajada sin deformarse. */
function dibujarCredencial(ctx, imagen, y) {
  const ancho = LIENZO.ancho - MARGEN * 2;
  const alto = 560;

  ctx.fillStyle = TINTA.suave;
  ctx.font = fuente(600, 20);
  ctx.fillText('CREDENCIAL', MARGEN, y - 18);

  ctx.fillStyle = '#f4f6fb';
  ctx.fillRect(MARGEN, y, ancho, alto);
  ctx.strokeStyle = TINTA.linea;
  ctx.lineWidth = 2;
  ctx.strokeRect(MARGEN, y, ancho, alto);

  if (!imagen) {
    ctx.fillStyle = TINTA.suave;
    ctx.font = fuente(400, 26);
    ctx.textAlign = 'center';
    ctx.fillText('Sin imagen disponible', LIENZO.ancho / 2, y + alto / 2);
    ctx.textAlign = 'left';
    return y + alto;
  }

  const escala = Math.min((ancho - 40) / imagen.width, (alto - 40) / imagen.height);
  const w = imagen.width * escala;
  const h = imagen.height * escala;
  ctx.drawImage(imagen, MARGEN + (ancho - w) / 2, y + (alto - h) / 2, w, h);

  return y + alto;
}

/** Un dato: etiqueta pequeña arriba, valor grande abajo, separador tenue. */
function dibujarDato(ctx, etiqueta, valor, y, opciones = {}) {
  const anchoMax = LIENZO.ancho - MARGEN * 2;

  ctx.fillStyle = TINTA.suave;
  ctx.font = fuente(600, 20);
  ctx.fillText(etiqueta, MARGEN, y);

  const tam = tamanoQueQuepa(ctx, valor, opciones.tam || 44, 700, anchoMax);
  ctx.fillStyle = opciones.color || TINTA.texto;
  ctx.font = fuente(700, tam);
  if (opciones.mono) ctx.font = `700 ${tam}px Consolas, 'Cascadia Mono', monospace`;
  ctx.fillText(valor, MARGEN, y + tam + 14);

  const abajo = y + tam + 48;
  ctx.strokeStyle = TINTA.linea;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(MARGEN, abajo);
  ctx.lineTo(LIENZO.ancho - MARGEN, abajo);
  ctx.stroke();

  return abajo + 46;
}

function dibujarPie(ctx) {
  const y = LIENZO.alto - 132;

  ctx.fillStyle = TINTA.amarillo;
  ctx.fillRect(MARGEN, y, 72, 6);

  ctx.fillStyle = TINTA.suave;
  ctx.font = fuente(400, 19);
  ctx.fillText(
    'Documento informativo de captura. No acredita la autorización del titular para',
    MARGEN, y + 42,
  );
  ctx.fillText(
    'consultar su historial crediticio (LRSIC art. 28).',
    MARGEN, y + 70,
  );
}

/** Fecha larga en español, con hora. */
function fechaLarga(fecha) {
  const dia = fecha.toLocaleDateString('es-MX', {
    day: 'numeric', month: 'long', year: 'numeric',
  });
  const hora = fecha.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
  return `${dia}, ${hora}`;
}

/**
 * Dibuja el comprobante completo.
 * datos: { nombreCompleto, rfc, fecha, vendedor }  ·  imagen: HTMLImageElement o null
 */
export function dibujarComprobante(lienzo, datos, imagen) {
  const ctx = lienzo.getContext('2d');

  ctx.fillStyle = TINTA.blanco;
  ctx.fillRect(0, 0, LIENZO.ancho, LIENZO.alto);
  ctx.textBaseline = 'alphabetic';

  dibujarCabecera(ctx);

  let y = dibujarCredencial(ctx, imagen, 372) + 100;
  y = dibujarDato(ctx, 'NOMBRE DEL CLIENTE', datos.nombreCompleto || '—', y);
  y = dibujarDato(ctx, 'RFC', datos.rfc || '—', y, { mono: true, color: TINTA.azul });
  y = dibujarDato(ctx, 'FECHA DE CAPTURA', fechaLarga(datos.fecha), y, { tam: 34 });
  dibujarDato(ctx, 'GENERADO POR', datos.vendedor || '—', y, { tam: 30 });

  dibujarPie(ctx);
}

/** Nombre de archivo estable y ordenable. */
function nombreArchivo(datos) {
  const f = datos.fecha;
  const sello = [
    f.getFullYear(),
    String(f.getMonth() + 1).padStart(2, '0'),
    String(f.getDate()).padStart(2, '0'),
    '-',
    String(f.getHours()).padStart(2, '0'),
    String(f.getMinutes()).padStart(2, '0'),
  ].join('');
  const rfc = (datos.rfc || 'sin-rfc').replace(/[^A-Za-z0-9]/g, '');
  return `comprobante-${rfc}-${sello}.png`;
}

/** Baja el canvas como PNG. */
export function descargarComprobante(lienzo, datos) {
  return new Promise((resolver, rechazar) => {
    lienzo.toBlob((blob) => {
      if (!blob) {
        rechazar(new Error('No se pudo generar el comprobante.'));
        return;
      }
      saveBlob(blob, nombreArchivo(datos)).then(resolver, rechazar);
    }, 'image/png');
  });
}

/** Carga la foto elegida como imagen lista para dibujarse en el canvas. */
export function cargarImagen(archivo) {
  return new Promise((resolver) => {
    if (!archivo) return resolver(null);
    const imagen = new Image();
    imagen.onload = () => resolver(imagen);
    imagen.onerror = () => resolver(null);
    imagen.src = URL.createObjectURL(archivo);
  });
}
