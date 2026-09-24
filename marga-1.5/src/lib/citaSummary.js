// Renders a cita to an organized JPG summary and triggers a download. Pure
// canvas (no libraries): draws the client data and, when present, embeds the
// INE photo underneath. Colours mirror the app palette.

import { formatDate, formatDateTime } from './format.js';
import { saveBlob } from './saveFile.js';

const COL = {
  bg: '#0A1428',
  panel: '#12213F',
  border: 'rgba(255,255,255,0.10)',
  gold: '#FFD11A',
  sky: '#38BDF8',
  ink: '#F8FAFC',
  muted: '#94A3B8',
  faint: '#64748B',
  green: '#4ADE80',
};

const W = 820;
const PAD = 44;
const CONTENT_W = W - PAD * 2;

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('No se pudo cargar la imagen de la INE.'));
    img.src = src;
  });
}

/** Word-wrap `text` to `maxWidth`, returning an array of lines. */
function wrapLines(ctx, text, maxWidth) {
  const out = [];
  for (const paragraph of String(text).split('\n')) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      out.push('');
      continue;
    }
    let line = '';
    for (const word of words) {
      const test = line ? `${line} ${word}` : word;
      if (ctx.measureText(test).width > maxWidth && line) {
        out.push(line);
        line = word;
      } else {
        line = test;
      }
    }
    if (line) out.push(line);
  }
  return out;
}

function safeName(s) {
  return String(s || 'cita')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
    .slice(0, 40) || 'cita';
}

export async function downloadCitaSummary(cita) {
  const ine = cita.ineImage ? await loadImage(cita.ineImage).catch(() => null) : null;

  // Measure pass on a scratch context to compute the dynamic height.
  const scratch = document.createElement('canvas').getContext('2d');

  const fields = [
    ['Cliente', cita.clientName || '—'],
    ['Teléfono', cita.phone || '—'],
    ['Moto(s)', cita.motorcycle || '—'],
    ['Fecha de la cita', cita.hasTime ? formatDateTime(cita.fechaCita) : formatDate(cita.fechaCita)],
    ['Agendó', cita.createdBy || '—'],
  ];
  if (cita.atendida) {
    fields.push(['Estado', `Atendida${cita.fechaAtencion ? ` · ${formatDateTime(cita.fechaAtencion)}` : ''}`]);
  }

  const rowH = 52;
  let y = 0;
  const headerH = 108;
  y += headerH + 24;

  const fieldsTop = y;
  y += fields.length * rowH;

  // Intención (wrapped)
  scratch.font = '18px Inter, system-ui, sans-serif';
  const descLines = cita.description ? wrapLines(scratch, cita.description, CONTENT_W - 28) : [];
  const descTop = y + 8;
  if (descLines.length) y = descTop + 30 + descLines.length * 24 + 16;

  // Nota de atención (wrapped)
  const notaLines = cita.atendida && cita.notaAtencion
    ? wrapLines(scratch, cita.notaAtencion, CONTENT_W - 28)
    : [];
  const notaTop = y + 8;
  if (notaLines.length) y = notaTop + 30 + notaLines.length * 24 + 16;

  // INE image block
  let ineH = 0;
  let ineDrawW = 0;
  let ineDrawH = 0;
  const ineTop = y + 8;
  if (ine) {
    const maxImgW = CONTENT_W;
    const maxImgH = 460;
    const scale = Math.min(maxImgW / ine.width, maxImgH / ine.height, 1);
    ineDrawW = Math.round(ine.width * scale);
    ineDrawH = Math.round(ine.height * scale);
    ineH = 34 + ineDrawH; // label + image
    y = ineTop + ineH + 16;
  }

  const footerH = 46;
  const totalH = y + footerH;

  // Draw pass
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = totalH;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = COL.bg;
  ctx.fillRect(0, 0, W, totalH);

  // Header
  ctx.fillStyle = COL.panel;
  ctx.fillRect(0, 0, W, headerH);
  ctx.fillStyle = COL.gold;
  ctx.fillRect(0, 0, 6, headerH);
  ctx.fillStyle = COL.gold;
  ctx.font = '700 30px Inter, system-ui, sans-serif';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText('Resumen de cita', PAD, 52);
  ctx.fillStyle = COL.muted;
  ctx.font = '16px Inter, system-ui, sans-serif';
  ctx.fillText('Dinamo Saltillo · Marga', PAD, 80);

  // Fields
  fields.forEach(([label, value], i) => {
    const ry = fieldsTop + i * rowH;
    ctx.fillStyle = COL.faint;
    ctx.font = '13px Inter, system-ui, sans-serif';
    ctx.fillText(String(label).toUpperCase(), PAD, ry + 18);
    ctx.fillStyle = i === 0 ? COL.gold : COL.ink;
    ctx.font = `${i === 0 ? '700 ' : ''}20px Inter, system-ui, sans-serif`;
    ctx.fillText(String(value), PAD, ry + 42);
    ctx.strokeStyle = COL.border;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(PAD, ry + rowH - 4);
    ctx.lineTo(W - PAD, ry + rowH - 4);
    ctx.stroke();
  });

  const drawBlock = (top, label, lines, accent) => {
    ctx.fillStyle = COL.panel;
    const h = 30 + lines.length * 24 + 8;
    ctx.fillRect(PAD, top, CONTENT_W, h);
    ctx.fillStyle = accent;
    ctx.fillRect(PAD, top, 4, h);
    ctx.fillStyle = COL.faint;
    ctx.font = '13px Inter, system-ui, sans-serif';
    ctx.fillText(label.toUpperCase(), PAD + 16, top + 22);
    ctx.fillStyle = COL.ink;
    ctx.font = '18px Inter, system-ui, sans-serif';
    lines.forEach((ln, i) => ctx.fillText(ln, PAD + 16, top + 46 + i * 24));
  };

  if (descLines.length) drawBlock(descTop, 'Intención del cliente', descLines, COL.sky);
  if (notaLines.length) drawBlock(notaTop, 'Nota de atención', notaLines, COL.green);

  // INE
  if (ine) {
    ctx.fillStyle = COL.faint;
    ctx.font = '13px Inter, system-ui, sans-serif';
    ctx.fillText('INE DEL CLIENTE', PAD, ineTop + 18);
    const imgY = ineTop + 30;
    ctx.strokeStyle = COL.border;
    ctx.lineWidth = 2;
    ctx.strokeRect(PAD - 1, imgY - 1, ineDrawW + 2, ineDrawH + 2);
    ctx.drawImage(ine, PAD, imgY, ineDrawW, ineDrawH);
  }

  // Footer
  ctx.fillStyle = COL.faint;
  ctx.font = '13px Inter, system-ui, sans-serif';
  ctx.fillText(`Generado el ${formatDateTime(Date.now())}`, PAD, totalH - 18);

  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92));
  if (!blob) throw new Error('No se pudo generar la imagen del resumen.');
  const filename = `cita-${safeName(cita.clientName)}-${safeName(formatDate(cita.fechaCita))}.jpg`;
  await saveBlob(blob, filename);
}
