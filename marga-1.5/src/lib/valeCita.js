// "Vale de cita": la imagen que el vendedor le manda al cliente al agendarle
// una cita, y que el cliente muestra al llegar a la agencia para que la cita
// cuente como válida. A diferencia del resumen interno (citaSummary.js) NO
// lleva la INE ni las notas del vendedor: solo lo que el cliente necesita.
//
// Canvas puro, sin librerías. Formato vertical 1080 px de ancho (se ve bien en
// WhatsApp); la altura crece si el nombre o la moto necesitan más renglones.

import { ATIENDE_CITAS } from './constants.js';
import { folioCita } from './citas.js';
import { wrapLines, safeName } from './citaSummary.js';
import { saveBlob } from './saveFile.js';

const COL = {
  bg: '#0A1428',
  panel: '#12213F',
  border: 'rgba(255,255,255,0.12)',
  gold: '#FFD11A',
  sky: '#38BDF8',
  ink: '#F8FAFC',
  muted: '#94A3B8',
  faint: '#64748B',
};

const W = 1080;
const MIN_H = 1350;
const PAD = 80;
const CONTENT_W = W - PAD * 2;

const HEAD = 'Urbanist, Inter, system-ui, sans-serif';
const BODY = 'Inter, system-ui, sans-serif';
const MONO = '"DM Mono", ui-monospace, monospace';

const fechaFmt = new Intl.DateTimeFormat('es-MX', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});
const horaFmt = new Intl.DateTimeFormat('es-MX', { hour: 'numeric', minute: '2-digit' });

const mayuscula = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

/** "Jueves, 2 de octubre de 2026". */
export function fechaVale(ts) {
  return mayuscula(fechaFmt.format(new Date(ts)));
}

/** "11:30 a.m." o, sin hora fija, un texto que lo dice. */
export function horaVale(cita) {
  return cita.hasTime ? horaFmt.format(new Date(cita.fechaCita)) : 'Hora por confirmar';
}

/** Texto de la indicación para el cliente. */
export function indicacionVale(atiende = ATIENDE_CITAS) {
  return `Al llegar a la agencia muestra este vale y pregunta por ${atiende} para ser atendido.`;
}

/** Datos del cliente que salen en el vale, en orden. Omite la moto si no hay. */
export function datosVale(cita) {
  const filas = [
    ['Cliente', cita.clientName || '—'],
    ['Teléfono', cita.phone || '—'],
  ];
  if (cita.motorcycle) filas.push(['Moto de interés', cita.motorcycle]);
  return filas;
}

function rectRedondo(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/**
 * Recorre el vale de arriba abajo. Con `dibujar` en false solo mide (para
 * saber la altura del lienzo); con true pinta. Devuelve la altura total.
 */
function componer(ctx, cita, dibujar, altoTotal = 0) {
  const texto = (t, x, y, font, color, align = 'left') => {
    if (!dibujar) return;
    ctx.font = font;
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.fillText(t, x, y);
    ctx.textAlign = 'left';
  };
  const lineas = (t, font, ancho) => {
    ctx.font = font;
    return wrapLines(ctx, t, ancho);
  };

  if (dibujar) {
    ctx.fillStyle = COL.bg;
    ctx.fillRect(0, 0, W, altoTotal);
    ctx.fillStyle = COL.gold;
    ctx.fillRect(0, 0, W, 16);
  }

  // Encabezado: agencia y tipo de documento.
  let y = 112;
  texto('DINAMO SALTILLO', PAD, y, `800 30px ${HEAD}`, COL.gold);
  texto('VALE DE CITA', W - PAD, y, `700 26px ${BODY}`, COL.muted, 'right');

  // Título grande: "Cita agendada con" / "Braulio Acosta".
  y += 120;
  texto('Cita agendada con', PAD, y, `700 64px ${HEAD}`, COL.ink);
  const fontNombre = `800 112px ${HEAD}`;
  for (const ln of lineas(ATIENDE_CITAS, fontNombre, CONTENT_W)) {
    y += 118;
    texto(ln, PAD, y, fontNombre, COL.gold);
  }

  // Fecha y hora, en un panel.
  y += 60;
  const fontFecha = `700 46px ${HEAD}`;
  const fechaLns = lineas(fechaVale(cita.fechaCita), fontFecha, CONTENT_W - 80);
  const panelH = 70 + fechaLns.length * 58 + 64;
  if (dibujar) {
    ctx.fillStyle = COL.panel;
    rectRedondo(ctx, PAD, y, CONTENT_W, panelH, 28);
    ctx.fill();
  }
  let py = y + 58;
  texto('FECHA DE LA CITA', PAD + 40, py, `600 22px ${BODY}`, COL.faint);
  for (const ln of fechaLns) {
    py += 58;
    texto(ln, PAD + 40, py, fontFecha, COL.ink);
  }
  py += 60;
  texto(horaVale(cita), PAD + 40, py, `700 44px ${HEAD}`, COL.sky);
  y += panelH;

  // Datos del cliente.
  y += 30;
  const fontValor = `600 40px ${BODY}`;
  for (const [label, valor] of datosVale(cita)) {
    y += 56;
    texto(label.toUpperCase(), PAD, y, `600 22px ${BODY}`, COL.faint);
    for (const ln of lineas(valor, fontValor, CONTENT_W)) {
      y += 52;
      texto(ln, PAD, y, fontValor, COL.ink);
    }
    y += 22;
    if (dibujar) {
      ctx.strokeStyle = COL.border;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(PAD, y);
      ctx.lineTo(W - PAD, y);
      ctx.stroke();
    }
  }

  // Indicación: qué hacer al llegar.
  y += 50;
  const fontIndic = `600 36px ${BODY}`;
  const indicLns = lineas(indicacionVale(), fontIndic, CONTENT_W - 96);
  const indicH = 60 + indicLns.length * 48 + 40;
  if (dibujar) {
    ctx.fillStyle = 'rgba(255,209,26,0.10)';
    rectRedondo(ctx, PAD, y, CONTENT_W, indicH, 28);
    ctx.fill();
    ctx.strokeStyle = COL.gold;
    ctx.lineWidth = 3;
    ctx.stroke();
  }
  let iy = y + 56;
  texto('IMPORTANTE', PAD + 48, iy, `800 24px ${BODY}`, COL.gold);
  for (const ln of indicLns) {
    iy += 48;
    texto(ln, PAD + 48, iy, fontIndic, COL.ink);
  }
  y += indicH;

  // Pie: folio (para validar contra la agenda) y quién agendó.
  y += 70;
  texto(`Folio ${folioCita(cita)}`, PAD, y, `500 28px ${MONO}`, COL.muted);
  if (cita.createdBy) {
    texto(`Agendó: ${cita.createdBy}`, W - PAD, y, `500 24px ${BODY}`, COL.faint, 'right');
  }
  y += 60;

  return Math.max(MIN_H, y);
}

/** Espera las fuentes del vale (ya las carga index.html) para no pintar con la de respaldo. */
async function cargarFuentes() {
  if (typeof document === 'undefined' || !document.fonts?.load) return;
  try {
    await Promise.all([
      document.fonts.load(`800 112px ${HEAD}`),
      document.fonts.load(`700 64px ${HEAD}`),
      document.fonts.load(`600 40px ${BODY}`),
      document.fonts.load(`500 28px ${MONO}`),
    ]);
  } catch {
    /* sin red: se usa la fuente de respaldo */
  }
}

/** Genera el vale de una cita como JPG. */
export async function generarValeCita(cita) {
  await cargarFuentes();
  const medir = document.createElement('canvas').getContext('2d');
  const alto = componer(medir, cita, false);

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = alto;
  componer(canvas.getContext('2d'), cita, true, alto);

  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92));
  if (!blob) throw new Error('No se pudo generar el vale de la cita.');
  return blob;
}

export function nombreArchivoVale(cita) {
  return `vale-cita-${safeName(cita.clientName)}-${folioCita(cita).toLowerCase()}.jpg`;
}

/** Descarga (o abre el menú de compartir, en iOS/Android) un vale ya generado. */
export function guardarValeCita(blob, cita) {
  return saveBlob(blob, nombreArchivoVale(cita));
}
