// Coordina las dos pestañas: la de Marga, que manda los 18 campos, y la de
// Refácil, donde ocurre el llenado.
//
// Reemplaza lo que hacía `app.py`: recibir la petición, disparar el trabajo y
// devolver el avance. Sin servidor, sin puerto y sin CORS de por medio.

const URL_FORMULARIO_DEFECTO =
  'https://www.refacil.com.mx/formularioDinamo.php?id=33628&intranet=0';

/** Guarda el trabajo pendiente de una pestaña hasta que su script pida turno. */
async function guardarPendiente(idPestana, campos, idPestanaMarga) {
  await chrome.storage.session.set({
    [`pendiente-${idPestana}`]: { campos, idPestanaMarga },
  });
}

async function tomarPendiente(idPestana) {
  const clave = `pendiente-${idPestana}`;
  const guardado = await chrome.storage.session.get(clave);
  return guardado[clave] ?? null;
}

async function urlFormulario() {
  const { urlFormulario } = await chrome.storage.local.get('urlFormulario');
  return urlFormulario || URL_FORMULARIO_DEFECTO;
}

/** Abre el formulario, reusando una pestaña que ya lo tenga cargado. */
async function abrirFormulario(idPestanaMarga, campos) {
  const url = await urlFormulario();
  const base = url.split('?')[0];

  const abiertas = await chrome.tabs.query({ url: `${base}*` });
  const pestana = abiertas.length
    ? await chrome.tabs.update(abiertas[0].id, { url, active: true })
    : await chrome.tabs.create({ url, active: true });

  await guardarPendiente(pestana.id, campos, idPestanaMarga);
  await chrome.windows.update(pestana.windowId, { focused: true });
  return pestana.id;
}

chrome.runtime.onMessage.addListener((mensaje, remitente, responder) => {
  // --- Desde la pestaña de Marga -------------------------------------------
  if (mensaje?.tipo === 'iniciar-llenado') {
    abrirFormulario(remitente.tab.id, mensaje.campos)
      .then(() => responder({ ok: true }))
      .catch((error) => responder({ ok: false, error: error.message }));
    return true; // respuesta asíncrona
  }

  // --- Desde la pestaña de Refácil -----------------------------------------
  if (mensaje?.tipo === 'listo-para-llenar') {
    tomarPendiente(remitente.tab.id)
      .then(async (registro) => {
        if (!registro) return responder({});
        // Se consume: si el usuario recarga Refácil a mano, no se vuelve a
        // llenar solo a sus espaldas.
        await chrome.storage.session.remove(`pendiente-${remitente.tab.id}`);
        // El id de la pestaña de Marga viaja de vuelta con el trabajo: así cada
        // evento dice a dónde va y no hay que consultar nada para enrutarlo.
        responder({ campos: registro.campos, idPestanaMarga: registro.idPestanaMarga });
      })
      .catch(() => responder({}));
    return true;
  }

  if (mensaje?.tipo === 'evento-llenado') {
    if (mensaje.idPestanaMarga !== undefined) {
      entregarAMarga(mensaje.idPestanaMarga, mensaje.evento);
    }
    return false;
  }

  return false;
});

// Una cola por pestaña de Marga. Los eventos se entregan de uno en uno y en
// orden: si el primero está reintentando, el segundo espera. Sin esto, un
// evento reintentado llega después de los que venían detrás y la bitácora
// cuenta la corrida desordenada.
const colas = new Map();

function entregarAMarga(idPestanaMarga, evento) {
  const anterior = colas.get(idPestanaMarga) ?? Promise.resolve();
  const siguiente = anterior.then(() => intentarEntrega(idPestanaMarga, evento));
  colas.set(idPestanaMarga, siguiente);

  // El evento final cierra la corrida: se suelta la cola para no dejarla viva.
  if (evento.tipo === 'fin') siguiente.then(() => colas.delete(idPestanaMarga));
}

/**
 * Entrega un evento a la pestaña de Marga, reintentando.
 *
 * Hace falta el reintento porque al abrir Refácil, Marga pierde el foco y
 * durante ese momento `sendMessage` puede rechazar. Antes eso se tragaba en
 * silencio y los primeros campos de la corrida (RFC y correo) nunca se
 * marcaban como escritos, aunque sí se hubieran escrito en el formulario.
 */
async function intentarEntrega(idPestanaMarga, evento, intentos = 4) {
  for (let i = 0; i < intentos; i += 1) {
    try {
      await chrome.tabs.sendMessage(idPestanaMarga, { tipo: 'evento-llenado', evento });
      return;
    } catch (error) {
      if (i === intentos - 1) {
        // Si de plano no se pudo, que quede rastro: un evento perdido en
        // silencio es justo lo que hizo este bug tan difícil de ver.
        console.warn('Buró Automático: no se pudo entregar el evento', evento, error);
        return;
      }
      await new Promise((r) => setTimeout(r, 150));
    }
  }
}

// Limpieza: sin esto, storage.session junta basura de pestañas muertas.
chrome.tabs.onRemoved.addListener((idPestana) => {
  chrome.storage.session.remove(`pendiente-${idPestana}`);
});
