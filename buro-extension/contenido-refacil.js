// Llenado del formulario de Refácil, desde la pestaña del propio usuario.
//
// Port de `ine-refacil/automatizacion.py`. Mismo orden de campos, mismos
// selects por texto visible, misma espera del AJAX y mismo TAB sobre el RFC.
//
// Las dos reglas del original siguen intactas:
//
//   1. El llenado ocurre a la vista. Aquí más que nunca: pasa en la pestaña que
//      el vendedor está mirando.
//   2. NUNCA se hace clic en "Registrar". La solicitud la envía una persona
//      después de revisar. Una consulta de buró no se puede deshacer.

const pausa = (ms) => new Promise((r) => setTimeout(r, ms));

// Pestaña de Marga que pidió este llenado. Llega junto con los campos y viaja
// en cada evento, para que el background no tenga que averiguar a dónde
// mandarlo mientras la corrida ya está en marcha.
let idPestanaMarga;

/** Manda un evento a Marga, con la misma forma que publicaba `eventos.py`. */
function publicar(tipo, mensaje, campo = null, valor = null) {
  chrome.runtime
    .sendMessage({
      tipo: 'evento-llenado',
      idPestanaMarga,
      evento: { tipo, mensaje, campo, valor },
    })
    .catch(() => {}); // el service worker pudo reciclarse; el llenado sigue
}

/** Activa o desactiva la captura de `alert()` en el contexto de la página. */
function capturarAlertas(activo) {
  window.postMessage(
    { fuente: 'buro-contenido', tipo: 'capturar-alertas', activo },
    window.location.origin,
  );
}

// Las alertas que dispare la página durante el llenado llegan por aquí.
let ultimaAlerta = null;
window.addEventListener('message', (evento) => {
  if (evento.source !== window) return;
  if (evento.data?.fuente === 'buro-hook' && evento.data.tipo === 'alerta') {
    ultimaAlerta = evento.data.texto;
  }
});

/**
 * Espera a que la página dispare una alerta, hasta `ms`.
 *
 * No basta con leer la variable una vez: el aviso viaja del contexto de la
 * página al del content script por `postMessage`, que es asíncrono, y llega
 * un tick después de que la página llama a `alert()`. Leyendo en un instante
 * fijo se perdía la objeción del RFC por unos milisegundos.
 */
async function esperarAlerta(ms = 1000) {
  const limite = Date.now() + ms;
  // Se comprueba SIEMPRE antes de decidir rendirse. Con la condición en el
  // `while`, una alerta que llegara entre dos comprobaciones se perdía: el
  // navegador ralentiza los temporizadores de las pestañas en segundo plano,
  // así que una espera de 50 ms puede durar un segundo y dejar un hueco enorme.
  for (;;) {
    if (ultimaAlerta !== null) {
      const texto = ultimaAlerta;
      ultimaAlerta = null;
      return texto;
    }
    if (Date.now() >= limite) return null;
    await pausa(50);
  }
}

// --- Escritura ----------------------------------------------------------------

/**
 * Asigna el valor con el setter nativo del prototipo.
 *
 * Se evita `campo.value = x` porque si la página redefinió `value` sobre el
 * elemento, la asignación directa iría a parar a ese setter en vez de al del
 * navegador. Desde el mundo aislado del content script eso es difícil de
 * detectar, y el síntoma es un campo que queda vacío sin explicación.
 */
const SETTER_NATIVO = Object.getOwnPropertyDescriptor(
  HTMLInputElement.prototype,
  'value',
)?.set;

function asignarValor(campo, texto) {
  if (SETTER_NATIVO) SETTER_NATIVO.call(campo, texto);
  else campo.value = texto;
}

/**
 * Escribe en un input y devuelve **lo que realmente quedó** en él.
 *
 * Dos motivos para no dar por hecho que se escribió:
 *
 *   - Asignar `.value` no dispara los listeners de la página, así que los
 *     eventos van a mano; si algún handler exige tecleo real, no basta.
 *   - `rfc` y `curp` tienen un `oninput` propio que reescribe el valor
 *     (mayúsculas, quita símbolos y recorta a maxlength). Lo que queda en el
 *     campo puede no ser lo que se pidió, y hay que enterarse aquí.
 */
function escribirTexto(idCampo, valor) {
  const campo = document.getElementById(idCampo);
  if (!campo) throw new Error('no se encontró el campo en la página');

  const texto = String(valor);

  const intento = () => {
    campo.focus();
    asignarValor(campo, '');
    campo.dispatchEvent(new Event('input', { bubbles: true }));
    asignarValor(campo, texto);
    campo.dispatchEvent(new Event('input', { bubbles: true }));
    campo.dispatchEvent(new Event('change', { bubbles: true }));
    return campo.value;
  };

  let quedo = intento();

  // Segundo intento imitando un tecleo completo, por si algún handler de la
  // página solo reacciona a eventos de teclado.
  if (!quedo) {
    campo.focus();
    asignarValor(campo, '');
    campo.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'a' }));
    asignarValor(campo, texto);
    campo.dispatchEvent(new Event('input', { bubbles: true }));
    campo.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: 'a' }));
    campo.dispatchEvent(new Event('change', { bubbles: true }));
    quedo = campo.value;
  }

  if (!quedo) throw new Error('el campo quedó vacío después de escribirlo');
  return quedo;
}

/** El catálogo que carga por AJAX no llegó. Equivale a TimeoutException. */
class ErrorTiempo extends Error {}

/**
 * Espera a que el formulario exista y sea visible antes de tocarlo.
 *
 * Es el equivalente del `WebDriverWait(...).until(visibility_of_element_located
 * ((By.ID, "rfc")))` de `automatizacion.py`. Refácil termina de construir el
 * formulario un momento después de que la página carga, y el content script
 * arranca antes: sin esta espera, los primeros campos de la corrida se
 * intentaban escribir cuando todavía no existían en el DOM.
 */
async function esperarFormulario(esperaSegundos = 20) {
  const limite = Date.now() + esperaSegundos * 1000;
  for (;;) {
    const campo = document.getElementById('rfc');
    // Visible, no solo presente: el original espera visibilidad, y un campo
    // dentro de una sección aún oculta tampoco se deja escribir.
    if (campo && (campo.offsetParent || campo.offsetWidth || campo.offsetHeight)) return;
    if (Date.now() >= limite) {
      throw new ErrorTiempo('el formulario de Refácil no cargó a tiempo');
    }
    await pausa(200);
  }
}

/**
 * Espera a que el AJAX pueble el select (más de la opción -SELECCIONE-).
 *
 * Igual que `esperarAlerta`: se comprueba antes de rendirse, para no fallar
 * justo cuando el catálogo acaba de llegar.
 */
async function esperarOpciones(idCampo, esperaSegundos = 15) {
  const limite = Date.now() + esperaSegundos * 1000;
  for (;;) {
    const select = document.getElementById(idCampo);
    if (select && select.options.length > 1) return;
    if (Date.now() >= limite) {
      throw new ErrorTiempo(`el catálogo de ${idCampo} no cargó a tiempo`);
    }
    await pausa(250);
  }
}

/** Elige la opción cuyo texto coincide; si no, la que lo contenga. */
function seleccionarPorTexto(idCampo, texto) {
  const select = document.getElementById(idCampo);
  if (!select) throw new Error('no se encontró la lista en la página');

  const objetivo = String(texto).trim().toUpperCase();
  const opciones = [...select.options];

  const aplicar = (opcion) => {
    select.value = opcion.value;
    select.dispatchEvent(new Event('input', { bubbles: true }));
    select.dispatchEvent(new Event('change', { bubbles: true }));
    return opcion.text.trim();
  };

  const exacta = opciones.find((o) => o.text.trim().toUpperCase() === objetivo);
  if (exacta) return aplicar(exacta);

  const parcial = opciones.find((o) => o.text.trim().toUpperCase().includes(objetivo));
  if (parcial) return aplicar(parcial);

  const disponibles = opciones.slice(1, 6).map((o) => o.text.trim()).join(', ');
  throw new Error(`No se encontró «${texto}» en ${idCampo}. Opciones: ${disponibles}…`);
}

// --- Corrida ------------------------------------------------------------------

let llenando = false;

async function llenar(campos) {
  if (llenando) return;
  llenando = true;
  capturarAlertas(true);

  try {
    publicar('inicio', 'Cargando el formulario de Refácil…');
    await esperarFormulario();
    publicar('inicio', 'Formulario cargado. Empezando el llenado.');

    for (const idCampo of ORDEN) {
      const valor = String(campos[idCampo] ?? '').trim();
      const etiqueta = ETIQUETAS[idCampo];

      if (!valor) {
        publicar('aviso', `${etiqueta}: sin dato, se dejó vacío`, idCampo);
        continue;
      }

      try {
        let escrito;
        if (SELECTS.has(idCampo)) {
          if (SELECTS_DINAMICOS.has(idCampo)) await esperarOpciones(idCampo);
          escrito = seleccionarPorTexto(idCampo, valor);
        } else {
          escrito = escribirTexto(idCampo, valor);
        }

        // Se reporta lo que quedó en el campo, no lo que se quiso poner: si la
        // página lo recortó o lo normalizó, quien revisa tiene que verlo.
        publicar('campo', `${etiqueta}: ${escrito}`, idCampo, escrito);

        if (escrito !== valor) {
          publicar(
            'aviso',
            `${etiqueta}: Refácil lo dejó como «${escrito}» en vez de «${valor}». Revísalo.`,
            idCampo,
          );
        }

        if (idCampo === 'rfc') {
          // Dispara validarRFCDINAMO() y recoge lo que reclame. La espera sale
          // en cuanto llega la objeción; el tope solo aplica cuando no la hay.
          document.getElementById('rfc')?.blur();
          const alerta = await esperarAlerta();
          if (alerta) {
            publicar(
              'aviso',
              `Refácil objetó el RFC: «${alerta}». Corrígelo a mano en esta pestaña.`,
              'rfc',
            );
          }
        }
      } catch (error) {
        if (error instanceof ErrorTiempo) {
          publicar(
            'error',
            `${etiqueta}: el catálogo no cargó a tiempo. Selecciónalo a mano.`,
            idCampo,
          );
        } else {
          publicar('error', `${etiqueta}: ${error.message}`, idCampo);
        }
      }

      await pausa(PAUSA_ENTRE_CAMPOS);
    }

    publicar(
      'fin',
      'Formulario lleno. Revísalo en esta pestaña y, si todo está bien, ' +
        'presiona tú mismo el botón Registrar. La extensión no envía nada.',
    );
  } catch (error) {
    publicar('error', `El llenado se interrumpió: ${error.message}`);
    publicar('fin', 'La corrida terminó con errores.');
  } finally {
    capturarAlertas(false);
    llenando = false;
  }
}

// --- Enganche con el background ----------------------------------------------

chrome.runtime.onMessage.addListener((mensaje) => {
  if (mensaje?.tipo === 'llenar') llenar(mensaje.campos);
});

// El background guarda el trabajo pendiente de esta pestaña; al terminar de
// cargar la página se lo pedimos. Evita la carrera de mandarle los campos a un
// content script que todavía no existe.
//
// Se reintenta un par de veces porque la carrera también corre al revés: con la
// página en caché, este script puede pedir turno antes de que el background
// alcance a registrar el trabajo.
async function pedirTrabajo(intentos = 3) {
  for (let i = 0; i < intentos; i += 1) {
    const respuesta = await chrome.runtime.sendMessage({ tipo: 'listo-para-llenar' })
      .catch(() => null);
    if (respuesta?.campos) {
      idPestanaMarga = respuesta.idPestanaMarga;
      return llenar(respuesta.campos);
    }
    await pausa(300);
  }
}

pedirTrabajo();
