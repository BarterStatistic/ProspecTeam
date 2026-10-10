// Lectura de la INE con Gemini 2.5 Flash.
//
// Port de `ine-refacil/ocr.py`. El modelo, el prompt y el `responseSchema` son
// idénticos, así que la respuesta es la misma que producía el backend Flask.
//
// Dos diferencias, ambas por correr en el navegador y no en Python:
//
//   - El reescalado usa <canvas> en vez de Pillow (mismo lado máximo, misma
//     calidad JPEG).
//   - La API key sale de VITE_GEMINI_API_KEY y viaja en el bundle. Restríngela
//     por HTTP referrer y cuota diaria en Google Cloud (ver .env.example).

const MODELO = 'gemini-2.5-flash';
const URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODELO}:generateContent`;
const LADO_MAXIMO = 1600; // píxeles; acota el costo sin perder legibilidad de la CURP
const CALIDAD_JPEG = 0.88;

/** Formatos que aceptaba `app.py`; se conserva la misma lista. */
export const TIPOS_ACEPTADOS = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
]);

const INSTRUCCIONES = `Eres un lector de credenciales para votar del INE mexicano.

Extrae los datos del anverso de la credencial que se te muestra. Reglas:

- Transcribe EXACTAMENTE lo que ves. No corrijas, no completes y no inventes.
- Si un dato no se alcanza a leer con certeza, devuélvelo como null.
- El campo NOMBRE de la INE viene en tres renglones: primero el apellido
  paterno, luego el materno y al final los nombres de pila. Sepáralos así.
- El DOMICILIO viene en varios renglones: calle y número, después colonia y
  código postal, y al final municipio y estado. Sepáralos.
- La CURP tiene exactamente 18 caracteres. Si no puedes leer los 18, null.
- La fecha de nacimiento devuélvela en formato AAAA-MM-DD.
`;

const ESQUEMA = {
  type: 'object',
  properties: {
    nombres: { type: 'string', nullable: true },
    apellido_paterno: { type: 'string', nullable: true },
    apellido_materno: { type: 'string', nullable: true },
    curp: { type: 'string', nullable: true },
    fecha_nacimiento: { type: 'string', nullable: true },
    sexo: { type: 'string', nullable: true },
    calle: { type: 'string', nullable: true },
    numero_exterior: { type: 'string', nullable: true },
    colonia: { type: 'string', nullable: true },
    cp: { type: 'string', nullable: true },
    municipio: { type: 'string', nullable: true },
    estado: { type: 'string', nullable: true },
  },
  required: [
    'nombres', 'apellido_paterno', 'apellido_materno', 'curp',
    'fecha_nacimiento', 'calle', 'numero_exterior',
  ],
};

/** La foto no se pudo leer o la API respondió con un error. */
export class ErrorOCR extends Error {
  constructor(mensaje) {
    super(mensaje);
    this.name = 'ErrorOCR';
  }
}

/**
 * Baja la resolución si la foto es enorme; si el navegador no puede decodificarla,
 * la deja igual y que decida Gemini (mismo comportamiento que Pillow ausente).
 */
async function reducir(archivo) {
  let bitmap;
  try {
    bitmap = await createImageBitmap(archivo);
  } catch {
    return archivo;
  }

  const lado = Math.max(bitmap.width, bitmap.height);
  if (lado <= LADO_MAXIMO) {
    bitmap.close?.();
    return archivo;
  }

  const proporcion = LADO_MAXIMO / lado;
  const lienzo = document.createElement('canvas');
  lienzo.width = Math.round(bitmap.width * proporcion);
  lienzo.height = Math.round(bitmap.height * proporcion);

  const ctx = lienzo.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, 0, 0, lienzo.width, lienzo.height);
  bitmap.close?.();

  const blob = await new Promise((resolver) =>
    lienzo.toBlob(resolver, 'image/jpeg', CALIDAD_JPEG),
  );
  return blob ?? archivo;
}

/** Base64 sin el prefijo `data:`, que es lo que espera `inline_data`. */
function aBase64(blob) {
  return new Promise((resolver, rechazar) => {
    const lector = new FileReader();
    lector.onload = () => resolver(String(lector.result).split(',')[1] ?? '');
    lector.onerror = () => rechazar(new ErrorOCR('No se pudo leer el archivo de la foto.'));
    lector.readAsDataURL(blob);
  });
}

/**
 * Devuelve un objeto con los datos leídos de la credencial.
 * `archivo` es el File/Blob de la foto tal como lo entregó el input.
 */
export async function leerIne(archivo) {
  const apiKey = String(import.meta.env.VITE_GEMINI_API_KEY ?? '').trim();
  if (!apiKey) {
    throw new ErrorOCR(
      'Falta VITE_GEMINI_API_KEY. Consíguela en https://aistudio.google.com/apikey ' +
        'y ponla en el archivo .env.local de Marga.',
    );
  }

  const mimeOriginal = archivo.type || 'image/jpeg';
  if (!TIPOS_ACEPTADOS.has(mimeOriginal)) {
    throw new ErrorOCR(`Formato no soportado: ${mimeOriginal}`);
  }
  if (!archivo.size) throw new ErrorOCR('El archivo llegó vacío.');

  const reducido = await reducir(archivo);
  const mime = reducido.type || mimeOriginal;
  const datos = await aBase64(reducido);

  const cuerpo = {
    contents: [{
      parts: [
        { text: INSTRUCCIONES },
        { inline_data: { mime_type: mime, data: datos } },
      ],
    }],
    generationConfig: {
      temperature: 0,
      responseMimeType: 'application/json',
      responseSchema: ESQUEMA,
    },
  };

  let respuesta;
  try {
    respuesta = await fetch(URL, {
      method: 'POST',
      headers: { 'x-goog-api-key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify(cuerpo),
    });
  } catch (exc) {
    throw new ErrorOCR(`No se pudo contactar a Gemini: ${exc.message}`);
  }

  const texto = await respuesta.text();
  if (!respuesta.ok) {
    throw new ErrorOCR(`Gemini respondió ${respuesta.status}: ${texto.slice(0, 300)}`);
  }

  let lectura;
  try {
    lectura = JSON.parse(JSON.parse(texto).candidates[0].content.parts[0].text);
  } catch {
    throw new ErrorOCR(`Respuesta de Gemini inesperada: ${texto.slice(0, 300)}`);
  }

  // Normaliza cadenas vacías a null para que la UI las marque como faltantes.
  return Object.fromEntries(
    Object.entries(lectura).map(([clave, valor]) => [
      clave,
      typeof valor === 'string' && valor.trim() ? valor.trim() : null,
    ]),
  );
}
