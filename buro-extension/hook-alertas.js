// Corre en el contexto de la propia página de Refácil (world: MAIN), no en el
// mundo aislado de la extensión. Es la única forma de ver los `alert()` que
// dispara `validarRFCDINAMO()` cuando objeta el RFC.
//
// Equivale a `_revisar_alerta()` de `automatizacion.py`: allá Selenium consumía
// la alerta con `switch_to.alert`, aquí se reemplaza `window.alert`.
//
// Solo se suprimen las alertas MIENTRAS la extensión está llenando. Fuera de
// ese rato el usuario ve sus alertas normales: si Refácil le avisa algo cuando
// él está capturando a mano, tiene que enterarse.

(() => {
  const alertOriginal = window.alert;
  let capturando = false;

  window.alert = function (mensaje) {
    if (!capturando) return alertOriginal.call(window, mensaje);

    // Se reporta y se traga: un alert modal congelaría el llenado a media
    // corrida, y el texto ya viaja a la bitácora de Marga.
    window.postMessage(
      { fuente: 'buro-hook', tipo: 'alerta', texto: String(mensaje ?? '') },
      window.location.origin,
    );
    return undefined;
  };

  window.addEventListener('message', (evento) => {
    if (evento.source !== window) return;
    const dato = evento.data;
    if (!dato || dato.fuente !== 'buro-contenido') return;
    if (dato.tipo === 'capturar-alertas') capturando = !!dato.activo;
  });
})();
