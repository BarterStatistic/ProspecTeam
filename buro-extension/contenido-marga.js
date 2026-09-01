// Puente entre la página de Marga y la extensión.
//
// Marga no puede hablarle directo a la extensión: son mundos distintos. Este
// script vive en la página, escucha sus `postMessage` y los traduce a mensajes
// de la extensión, y de vuelta.

const MARCA = 'data-buro-extension';

// Bandera para que Marga sepa que la extensión está instalada sin preguntar ni
// esperar. Es el equivalente de `/api/salud` del servicio local.
document.documentElement.setAttribute(MARCA, chrome.runtime.getManifest().version);

// La página también puede enterarse por evento, por si carga antes que esto.
window.addEventListener('DOMContentLoaded', () => {
  document.documentElement.setAttribute(MARCA, chrome.runtime.getManifest().version);
});

// --- Marga → extensión --------------------------------------------------------

window.addEventListener('message', (evento) => {
  if (evento.source !== window) return;
  const dato = evento.data;
  if (!dato || dato.fuente !== 'marga-buro') return;

  if (dato.tipo === 'iniciar-llenado') {
    chrome.runtime
      .sendMessage({ tipo: 'iniciar-llenado', campos: dato.campos })
      .then((respuesta) => {
        if (respuesta?.ok) return;
        responderAMarga({
          tipo: 'error',
          mensaje: respuesta?.error || 'La extensión no pudo abrir Refácil.',
          campo: null,
          valor: null,
        });
        responderAMarga({ tipo: 'fin', mensaje: 'La corrida terminó con errores.' });
      })
      .catch((error) => {
        responderAMarga({
          tipo: 'error',
          mensaje: `La extensión no respondió: ${error.message}`,
          campo: null,
          valor: null,
        });
        responderAMarga({ tipo: 'fin', mensaje: 'La corrida terminó con errores.' });
      });
  }
});

// --- Extensión → Marga --------------------------------------------------------

function responderAMarga(evento) {
  window.postMessage({ fuente: 'buro-extension', tipo: 'evento', evento }, window.location.origin);
}

chrome.runtime.onMessage.addListener((mensaje) => {
  if (mensaje?.tipo === 'evento-llenado') responderAMarga(mensaje.evento);
  return false;
});
