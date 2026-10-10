// Cliente del servicio local de llenado (`ine-refacil/app.py`).
//
// Es la única pieza del Buró Automático que no puede correr en el navegador:
// Selenium abre una ventana de Edge y llena el formulario de Refácil. Todo lo
// demás (OCR, RFC, revisión, comprobante) vive en Marga.
//
// El transporte de eventos es sondeo indexado en vez del SSE original:
// EventSource no emite preflight, así que Private Network Access lo bloquea
// cuando Marga se sirve por HTTPS. Los eventos y sus tipos son los mismos.

const BASE = String(
  import.meta.env.VITE_BURO_SERVICIO_URL ?? 'http://localhost:5000',
).replace(/\/$/, '');

/** Cada cuánto se le pregunta al servicio por eventos nuevos. */
const INTERVALO_SONDEO = 400;

export const URL_SERVICIO = BASE;

/** El servicio respondió algo que no esperábamos. */
export class ErrorServicio extends Error {
  constructor(mensaje) {
    super(mensaje);
    this.name = 'ErrorServicio';
  }
}

/** ¿Está corriendo el servicio en esta máquina? No lanza: responde true/false. */
export async function comprobarSalud(timeoutMs = 1500) {
  const corte = AbortSignal.timeout ? AbortSignal.timeout(timeoutMs) : undefined;
  try {
    const respuesta = await fetch(`${BASE}/api/salud`, { mode: 'cors', signal: corte });
    return respuesta.ok;
  } catch {
    return false;
  }
}

/**
 * Dispara el llenado. Devuelve cuando el servicio aceptó el trabajo; el avance
 * llega después por `seguirEventos`.
 */
export async function iniciarLlenado(campos) {
  let respuesta;
  try {
    respuesta = await fetch(`${BASE}/api/llenar`, {
      method: 'POST',
      mode: 'cors',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ campos }),
    });
  } catch (exc) {
    throw new ErrorServicio(`No se pudo contactar al servicio de llenado: ${exc.message}`);
  }

  const datos = await respuesta.json().catch(() => ({}));
  if (!respuesta.ok) {
    throw new ErrorServicio(datos.error || 'No se pudo iniciar el llenado.');
  }
  return datos;
}

/**
 * Sondea los eventos del llenado y llama `alRecibir` con cada uno, en orden.
 *
 * Termina solo al llegar el evento `fin` o cuando se aborta la señal. Devuelve
 * una promesa que se resuelve cuando deja de sondear.
 */
export async function seguirEventos(alRecibir, señal) {
  let desde = 0;

  while (!señal?.aborted) {
    let lote;
    try {
      const respuesta = await fetch(`${BASE}/api/eventos/desde/${desde}`, {
        mode: 'cors',
        signal: señal,
      });
      if (!respuesta.ok) throw new ErrorServicio(`el servicio respondió ${respuesta.status}`);
      lote = await respuesta.json();
    } catch (exc) {
      if (señal?.aborted) return;
      // Un tropiezo de red no debe matar la corrida: Selenium sigue llenando en
      // la ventana de Edge aunque el navegador pierda un sondeo.
      alRecibir({
        tipo: 'aviso',
        mensaje: `Se perdió la conexión con el servicio (${exc.message}); reintentando…`,
        campo: null,
        valor: null,
      });
      await esperar(INTERVALO_SONDEO * 2, señal);
      continue;
    }

    desde = lote.siguiente ?? desde;
    for (const evento of lote.eventos ?? []) {
      alRecibir(evento);
      if (evento.tipo === 'fin') return;
    }

    await esperar(INTERVALO_SONDEO, señal);
  }
}

function esperar(ms, señal) {
  return new Promise((resolver) => {
    const id = setTimeout(resolver, ms);
    señal?.addEventListener('abort', () => {
      clearTimeout(id);
      resolver();
    }, { once: true });
  });
}
