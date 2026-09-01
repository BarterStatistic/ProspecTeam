// Cliente de la extensión de navegador que llena Refácil.
//
// Es la vía preferida sobre el servicio local (`servicio.js`): no necesita
// Python ni un puerto abierto, y el llenado ocurre en una pestaña del propio
// usuario, que lo ve y presiona «Registrar» él mismo.
//
// La extensión marca su presencia con un atributo en <html>, así que detectarla
// es síncrono y no cuesta una petición.

const MARCA = 'data-buro-extension';

/** ¿Está instalada la extensión en este navegador? */
export function extensionDisponible() {
  return document.documentElement.hasAttribute(MARCA);
}

/** Versión de la extensión instalada, o null. */
export function versionExtension() {
  return document.documentElement.getAttribute(MARCA);
}

/**
 * Pide a la extensión que llene Refácil y entrega los eventos de avance.
 *
 * Los eventos tienen la misma forma que los del servicio local
 * ({ tipo, mensaje, campo, valor }), así que la vista no distingue el origen.
 * Resuelve cuando llega el evento `fin`.
 */
export function llenarConExtension(campos, alRecibir, señal) {
  return new Promise((resolver) => {
    function alMensaje(evento) {
      if (evento.source !== window) return;
      const dato = evento.data;
      if (!dato || dato.fuente !== 'buro-extension' || dato.tipo !== 'evento') return;

      alRecibir(dato.evento);
      if (dato.evento.tipo === 'fin') terminar();
    }

    function terminar() {
      window.removeEventListener('message', alMensaje);
      señal?.removeEventListener('abort', terminar);
      resolver();
    }

    window.addEventListener('message', alMensaje);
    señal?.addEventListener('abort', terminar, { once: true });

    window.postMessage({ fuente: 'marga-buro', tipo: 'iniciar-llenado', campos }, window.location.origin);
  });
}
