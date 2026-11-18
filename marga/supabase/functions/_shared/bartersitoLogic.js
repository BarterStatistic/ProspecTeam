// Lógica pura del chat con Bartersito desde Marga. JS plano, sin dependencias:
// la importan la Edge Function (Deno) y las pruebas (Vitest).

export const MAX_TEXTO = 2000;
export const SOLO_ADMIN = 'Solo el administrador puede hablar con Bartersito.';

// n8n descarta como "bot" (403, sin ejecución) las peticiones cuyo User-Agent no parece de navegador
// (ignoreBots en el webhook de Bartersito). Mismo arreglo que marga-agencia (PR #23, 2026-11-15):
// sin esto, desde el 16-nov todo mensaje desde Marga daba 403.
export const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

/** Limpia y valida el mensaje. Devuelve `{ texto }` o `{ error }`. */
export function validarMensaje(valor) {
  const texto = String(valor ?? '').trim();
  if (!texto) return { error: 'Escribe un mensaje.' };
  if (texto.length > MAX_TEXTO) {
    return { error: `El mensaje es muy largo (máximo ${MAX_TEXTO} caracteres).` };
  }
  return { texto };
}

/** ¿La fila de marga_users es de un administrador? */
export function esAdmin(fila) {
  return fila?.data?.role === 'admin';
}

/**
 * Da forma a lo que contesta n8n. Acepta `{ output }` (salida del agente),
 * `{ texto }`, un arreglo con un solo elemento o texto suelto. La gráfica es
 * opcional: `[{ label, value }]`, se descarta lo que no tenga esa forma.
 */
export function normalizarRespuesta(cuerpo) {
  const base = Array.isArray(cuerpo) ? cuerpo[0] : cuerpo;
  const texto =
    typeof base === 'string'
      ? base
      : String(base?.texto ?? base?.output ?? base?.text ?? '').trim();
  if (!texto) return null;

  const filas = Array.isArray(base?.grafica)
    ? base.grafica
        .map((f) => ({ label: String(f?.label ?? '').slice(0, 60), value: Number(f?.value) }))
        .filter((f) => f.label && Number.isFinite(f.value))
        .slice(0, 12)
    : [];
  return filas.length ? { texto, grafica: filas } : { texto };
}
