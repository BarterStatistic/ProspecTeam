// Imagen descargable de una cotización.
//
// Reproduce tal cual la tarjeta que genera el cotizador original
// (`cotizador-pt/index.html`, función `download()`): mismo ancho (640 px a
// escala 2), mismos colores, tipografías, textos y estructura. La paleta de
// Marga NO se aplica aquí a propósito: la imagen es lo que recibe el cliente y
// debe verse igual que siempre.
//
// `tarjetaCotizacionHTML` es pura (sin DOM) para poder probarla; la descarga
// en sí vive en `descargarCotizacionJPG`.

import { precioEfectivo } from './cotizador.js';
import { formatMXN as mxn, formatMXN0 as mxn0, formatPct as pct } from './format.js';

export const ANCHO_TARJETA = 640;

// Cifras en DM Mono, como el original (su peso Medium es el que da el trazo
// grueso de las imágenes que ya recibe el cliente).
const CIFRAS = "'DM Mono',monospace";

// Estilos de la tarjeta raíz. `line-height` va explícito porque el original lo
// heredaba de su <body> (1.6) y Marga hereda el 1.5 del preflight de Tailwind.
const ESTILO_TARJETA =
  `position:absolute;left:-9999px;top:0;width:${ANCHO_TARJETA}px;background:#0A0C12;` +
  "font-family:Urbanist,sans-serif;color:#EDF0F7;border-radius:16px;overflow:hidden;" +
  'border:1px solid #252A3A;line-height:1.6;';

function esc(s) {
  return String(s).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
}

/** "dd/mm/aaaa", igual que el original (`toLocaleDateString('es-MX')`). */
export function fechaCorta(ts) {
  return new Date(ts).toLocaleDateString('es-MX', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

/**
 * HTML interno de la tarjeta.
 *
 * - `modo`: 'all' | 'multi' | 'single'.
 * - `plazos`: los plazos a incluir (en 'single', solo el primero cuenta).
 * - `pagos`: { [plazo]: parcialidad ya redondeada al peso }.
 */
export function tarjetaCotizacionHTML({
  moto,
  esquema,
  enganchePct,
  incluyeServicio,
  pagos,
  plazos,
  modo,
  vendedor,
  fecha,
}) {
  const listPrice = moto.precio;
  const svcPrice = moto.servicio || 0;
  const price = precioEfectivo(moto, incluyeServicio);
  const downAmt = price * (enganchePct / 100);
  const fin = price - downAmt;
  const unidad = esquema.termUnit;
  const unidadSing = unidad.replace(/s$/, '');
  const quien = esc(vendedor || 'Prospect Team');

  const cabecera = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:1.1rem;">
      <div>
        <div style="font-size:.6rem;color:#F0A800;margin-bottom:.3rem;">Cotización · ${quien} · Dinamo Saltillo</div>
        <div style="font-size:1.25rem;font-weight:800;">${esc(moto.nombre)}</div>
      </div>
      <div style="padding:.28rem .7rem;border-radius:99px;background:rgba(0,180,245,.16);border:1px solid rgba(0,180,245,.38);font-size:.66rem;font-weight:700;color:#40D4FF;">${esc(esquema.label)}</div>
    </div>`;
  const pie = (nota) => `
    <div style="padding:.75rem 1.25rem;display:flex;justify-content:space-between;align-items:flex-end;border-top:1px solid #252A3A;">
      <span style="font-size:.62rem;color:#8B93AA;">${nota}</span>
      <div style="display:flex;flex-direction:column;align-items:flex-end;gap:.2rem;">
        <span style="font-size:.62rem;color:#F0A800;font-weight:600;">Cotizado por ${quien} · ${fechaCorta(fecha)}</span>
        <span style="font-size:.62rem;color:#8B93AA;">Cotización con vigencia de 5 días</span>
      </div>
    </div>`;
  const dato = (l, v, color) => `
    <div style="background:rgba(10,12,18,.75);border:1px solid #252A3A;border-radius:8px;padding:.6rem .75rem;">
      <div style="font-size:.6rem;color:#8B93AA;margin-bottom:.25rem;">${l}</div>
      <div style="font-size:.85rem;font-weight:500;font-family:${CIFRAS};${color ? 'color:' + color + ';' : ''}word-break:break-word;">${v}</div>
    </div>`;

  if (modo === 'single') {
    // Un solo plazo: la parcialidad manda y el resto de las cifras se reparte
    // en exactamente dos filas, en lugar de una tabla de un renglón.
    const t = plazos[0];
    const datos = [['Precio de Lista', mxn(listPrice), '']];
    if (incluyeServicio && svcPrice > 0) {
      datos.push(['Servicio preventivo', '+' + mxn(svcPrice), '#3DD68C'], ['Precio Paquete', mxn(price), '']);
    }
    datos.push(
      ['Enganche', pct(enganchePct), '#40D4FF'],
      ['Monto Enganche', mxn(downAmt), '#FFCC33'],
      ['A Financiar', mxn(fin), ''],
    );
    const cols = Math.ceil(datos.length / 2);
    const fila = (items) =>
      `<div style="display:grid;grid-template-columns:repeat(${cols},1fr);gap:.5rem;">${items.map((d) => dato(d[0], d[1], d[2])).join('')}</div>`;

    return `
      <div style="background:linear-gradient(135deg,#12161F,#0A0C12);padding:1.5rem 1.75rem 1.35rem;">
        ${cabecera}
        <div style="display:flex;align-items:center;justify-content:space-between;gap:1rem;background:rgba(204,140,0,.09);border:1px solid rgba(204,140,0,.34);border-radius:12px;padding:1rem 1.25rem;">
          <div>
            <div style="font-size:.6rem;color:#8B93AA;margin-bottom:.2rem;">Plazo</div>
            <div style="display:flex;align-items:baseline;gap:.4rem;">
              <span style="font-size:2rem;font-weight:800;color:#40D4FF;line-height:1;">${t}</span>
              <span style="font-size:.75rem;color:#A8B0C4;">${unidad}</span>
            </div>
          </div>
          <div style="text-align:right;">
            <div style="font-size:.6rem;color:#8B93AA;margin-bottom:.2rem;">Parcialidad ${unidadSing}</div>
            <div style="font-size:2.15rem;font-weight:600;color:#FFCC33;font-family:${CIFRAS};line-height:1.05;">${mxn0(pagos[t])}</div>
          </div>
        </div>
      </div>
      <div style="padding:0 1.25rem 1.1rem;display:flex;flex-direction:column;gap:.5rem;">
        ${fila(datos.slice(0, cols))}
        ${fila(datos.slice(cols))}
      </div>
      ${pie('Parcialidad ' + unidadSing + ' · redondeada al entero más cercano')}`;
  }

  const datos = [['Precio de Lista', mxn(listPrice), '']];
  if (incluyeServicio && svcPrice > 0) datos.push(['Precio Paquete', mxn(price), '']);
  datos.push(
    ['Enganche', pct(enganchePct), '#40D4FF'],
    ['Monto Enganche', mxn(downAmt), '#FFCC33'],
    ['A Financiar', mxn(fin), ''],
  );
  return `
      <div style="background:linear-gradient(135deg,#12161F,#0A0C12);padding:1.5rem 1.75rem 1.25rem;">
        ${cabecera}
        <div style="display:grid;grid-template-columns:repeat(${datos.length},1fr);gap:.5rem;">
          ${datos.map((d) => dato(d[0], d[1], d[2])).join('')}
        </div>
      </div>
      <table style="width:100%;border-collapse:collapse;">
        <thead>
          <tr style="background:rgba(6,7,9,.6);">
            <th style="font-size:.62rem;font-weight:600;color:#8B93AA;padding:.75rem 1.25rem;text-align:left;border-bottom:1px solid #252A3A;">Plazo</th>
            <th style="font-size:.62rem;font-weight:600;color:#8B93AA;padding:.75rem 1.25rem;text-align:left;border-bottom:1px solid #252A3A;">Enganche</th>
            <th style="font-size:.62rem;font-weight:600;color:#8B93AA;padding:.75rem 1.25rem;text-align:right;border-bottom:1px solid #252A3A;">Parcialidad</th>
          </tr>
        </thead>
        <tbody>
          ${plazos
            .map(
              (t, i) => `
            <tr style="background:${i % 2 === 0 ? 'rgba(18,22,31,.6)' : 'rgba(10,12,18,.6)'};">
              <td style="padding:.7rem 1.25rem;border-bottom:1px solid rgba(37,42,58,.4);">
                <span style="font-size:.82rem;padding:.18rem .5rem;border-radius:5px;background:rgba(0,180,245,.14);border:1px solid rgba(0,180,245,.26);color:#40D4FF;">${t}</span>
                <span style="font-size:.68rem;color:#8B93AA;margin-left:.5rem;">${unidad}</span>
              </td>
              <td style="padding:.7rem 1.25rem;font-size:.8rem;color:#A8B0C4;font-family:${CIFRAS};border-bottom:1px solid rgba(37,42,58,.4);">${pct(enganchePct)} · ${mxn(downAmt)}</td>
              <td style="padding:.7rem 1.25rem;font-size:1rem;font-weight:600;color:#FFCC33;font-family:${CIFRAS};text-align:right;border-bottom:1px solid rgba(37,42,58,.4);">${mxn0(pagos[t])}</td>
            </tr>`,
            )
            .join('')}
        </tbody>
      </table>
      ${pie('Parcialidades ' + unidad + ' · redondeadas al entero más cercano')}`;
}

/** Nombre del archivo, igual que el original: cotizacion-super-sport-400.jpg */
export function nombreArchivo(motoNombre) {
  return `cotizacion-${motoNombre.replace(/\s+/g, '-').toLowerCase()}.jpg`;
}

/**
 * Rasteriza la tarjeta a JPG y dispara la descarga. Lanza si html2canvas falla.
 * La tarjeta se monta fuera de pantalla y se retira siempre, falle o no.
 */
export async function descargarCotizacionJPG(opciones) {
  // Import diferido: html2canvas pesa ~200 KB y solo hace falta aquí.
  const { default: html2canvas } = await import('html2canvas');

  // Las fuentes solo se descargan cuando algo las usa; se piden antes de
  // rasterizar para que la imagen nunca salga con la tipografía de respaldo.
  try {
    await Promise.all([
      document.fonts.load('800 20px "Urbanist"'),
      document.fonts.load('600 20px "Urbanist"'),
      document.fonts.load('400 20px "Urbanist"'),
      document.fonts.load('500 20px "DM Mono"'),
    ]);
    await document.fonts.ready;
  } catch {
    // Sin la API de fuentes se rasteriza con lo que haya.
  }

  // html2canvas mide la línea base de cada fuente con un <img> 1×1 en línea
  // junto al texto; el preflight de Tailwind pone `img { display: block }` y esa
  // medición sale mal, así que todo el texto se dibuja más abajo de su lugar.
  // Mientras dura la captura se devuelve esa imagen de medición a `inline`.
  const arreglo = document.createElement('style');
  arreglo.textContent = 'img[src^="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP"]{display:inline !important}';
  document.head.appendChild(arreglo);

  const card = document.createElement('div');
  card.style.cssText = ESTILO_TARJETA;
  card.innerHTML = tarjetaCotizacionHTML(opciones);
  document.body.appendChild(card);
  try {
    const canvas = await html2canvas(card, {
      scale: 2,
      backgroundColor: '#0A0C12',
      useCORS: true,
      logging: false,
      windowWidth: ANCHO_TARJETA,
      width: ANCHO_TARJETA,
      scrollX: 0,
      scrollY: 0,
    });
    const link = document.createElement('a');
    link.download = nombreArchivo(opciones.moto.nombre);
    link.href = canvas.toDataURL('image/jpeg', 0.93);
    link.click();
  } finally {
    document.body.removeChild(card);
    arreglo.remove();
  }
}
