// Client-side image compression for the INE photo. Firestore documents cap at
// 1 MB, so we resize + JPEG-encode in the browser and store the result as a
// base64 data URL inside the cita document (no Firebase Storage needed).

/** Rough byte size of a base64 data URL (payload only). */
function dataUrlBytes(dataUrl) {
  const comma = dataUrl.indexOf(',');
  const b64 = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
  return Math.floor((b64.length * 3) / 4);
}

async function loadBitmap(file) {
  // createImageBitmap honours EXIF orientation so phone photos aren't sideways.
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch {
      /* fall through to <img> */
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('No se pudo leer la imagen.'));
      el.src = url;
    });
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Compress an image File to a JPEG data URL under `maxBytes`.
 * Retries with smaller dimensions / quality until it fits.
 */
export async function compressImage(
  file,
  { maxDim = 1000, quality = 0.6, maxBytes = 850_000 } = {},
) {
  if (!file || !file.type?.startsWith('image/')) {
    throw new Error('El archivo seleccionado no es una imagen.');
  }
  const bitmap = await loadBitmap(file);
  const srcW = bitmap.width;
  const srcH = bitmap.height;

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  // Try progressively smaller/lower-quality encodings until under the cap.
  const attempts = [
    { dim: maxDim, q: quality },
    { dim: 850, q: 0.55 },
    { dim: 720, q: 0.5 },
    { dim: 600, q: 0.45 },
    { dim: 480, q: 0.4 },
  ];

  let result = '';
  for (const { dim, q } of attempts) {
    const scale = Math.min(1, dim / Math.max(srcW, srcH));
    canvas.width = Math.max(1, Math.round(srcW * scale));
    canvas.height = Math.max(1, Math.round(srcH * scale));
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    result = canvas.toDataURL('image/jpeg', q);
    if (dataUrlBytes(result) <= maxBytes) {
      bitmap.close?.();
      return result;
    }
  }

  bitmap.close?.();
  throw new Error(
    'La imagen es demasiado grande incluso comprimida. Intenta con una foto más pequeña.',
  );
}
