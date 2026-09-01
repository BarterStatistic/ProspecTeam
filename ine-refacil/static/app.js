const zona = document.getElementById('zona');
const inputArchivo = document.getElementById('archivo');
const vistaPrevia = document.getElementById('vista-previa');
const marcoPrevia = document.getElementById('marco-previa');
const nombreArchivoFoto = document.getElementById('nombre-archivo');
const zonaVacia = document.getElementById('zona-vacia');
const btnLeer = document.getElementById('btn-leer');
const btnOtra = document.getElementById('btn-otra');
const btnLlenar = document.getElementById('btn-llenar');
const btnDescargar = document.getElementById('btn-descargar');
const estadoOcr = document.getElementById('estado-ocr');
const seccionDatos = document.getElementById('seccion-datos');
const seccionBitacora = document.getElementById('seccion-bitacora');
const seccionComprobante = document.getElementById('seccion-comprobante');
const contenedorAvisos = document.getElementById('avisos');
const contenedorFormulario = document.getElementById('formulario');
const bitacora = document.getElementById('bitacora');
const lienzo = document.getElementById('lienzo');
const progreso = document.querySelector('.progreso');
const progresoRelleno = document.getElementById('progreso-relleno');
const progresoNum = document.getElementById('progreso-num');

const TOTAL_CAMPOS = 18;

let archivoElegido = null;
let camposEscritos = 0;
let datosComprobante = null;

// --- Pasos de la cabecera ----------------------------------------------------

function marcarPaso(numero) {
  document.querySelectorAll('#pasos li').forEach((li) => {
    const propio = Number(li.dataset.paso);
    li.classList.toggle('activo', propio === numero);
    li.classList.toggle('hecho', propio < numero);
  });
}

// --- Paso 1: elegir la foto --------------------------------------------------

function mostrarArchivo(archivo) {
  if (!archivo) return;

  if (!archivo.type.startsWith('image/')) {
    fijarEstado('Ese archivo no es una imagen. Usa JPG, PNG o WEBP.', true);
    return;
  }

  archivoElegido = archivo;
  vistaPrevia.src = URL.createObjectURL(archivo);
  nombreArchivoFoto.textContent = archivo.name;
  marcoPrevia.hidden = false;
  zonaVacia.hidden = true;
  btnLeer.disabled = false;
  btnOtra.hidden = false;
  fijarEstado('');
}

function fijarEstado(texto, malo = false) {
  estadoOcr.textContent = texto;
  estadoOcr.classList.toggle('malo', malo);
}

inputArchivo.addEventListener('change', () => mostrarArchivo(inputArchivo.files[0]));

['dragenter', 'dragover'].forEach((evento) =>
  zona.addEventListener(evento, (e) => {
    e.preventDefault();
    zona.classList.add('encima');
  })
);

['dragleave', 'drop'].forEach((evento) =>
  zona.addEventListener(evento, (e) => {
    e.preventDefault();
    zona.classList.remove('encima');
  })
);

zona.addEventListener('drop', (e) => mostrarArchivo(e.dataTransfer.files[0]));

btnOtra.addEventListener('click', (e) => {
  e.preventDefault();
  inputArchivo.value = '';
  inputArchivo.click();
});

// --- Paso 2: leer la credencial ----------------------------------------------

function mostrarEsqueleto() {
  contenedorFormulario.innerHTML = '';
  const caja = document.createElement('div');
  caja.className = 'esqueleto';
  for (let fila = 0; fila < 4; fila += 1) {
    const renglon = document.createElement('div');
    renglon.className = 'esqueleto-fila';
    for (let col = 0; col < 3; col += 1) {
      const bloque = document.createElement('div');
      bloque.className = 'esqueleto-caja';
      // Desfase por bloque: el barrido recorre la rejilla en vez de latir a la vez.
      bloque.style.animationDelay = `${(fila * 3 + col) * 60}ms`;
      renglon.append(bloque);
    }
    caja.append(renglon);
  }
  contenedorFormulario.append(caja);
  seccionDatos.hidden = false;
}

btnLeer.addEventListener('click', async () => {
  if (!archivoElegido) return;

  btnLeer.disabled = true;
  btnLeer.classList.add('cargando');
  fijarEstado('Leyendo la credencial…');
  mostrarEsqueleto();

  const cuerpo = new FormData();
  cuerpo.append('foto', archivoElegido);

  try {
    const respuesta = await fetch('/api/extraer', { method: 'POST', body: cuerpo });
    const datos = await respuesta.json();

    if (!respuesta.ok) {
      contenedorFormulario.innerHTML = '';
      seccionDatos.hidden = true;
      fijarEstado(datos.error || 'No se pudo leer la credencial.', true);
      return;
    }

    fijarEstado('Credencial leída.');
    dibujarFormulario(datos.campos, datos.secciones, datos.origenes, datos.etiquetas);
    dibujarAvisos(datos.avisos);
    marcarPaso(2);
    seccionDatos.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (error) {
    contenedorFormulario.innerHTML = '';
    seccionDatos.hidden = true;
    fijarEstado(`Error de red: ${error.message}`, true);
  } finally {
    btnLeer.disabled = false;
    btnLeer.classList.remove('cargando');
  }
});

function dibujarFormulario(campos, secciones, origenes, textos) {
  contenedorFormulario.innerHTML = '';

  secciones.forEach(({ titulo, campos: claves }) => {
    const bloque = document.createElement('section');
    bloque.className = 'grupo';

    const encabezado = document.createElement('h3');
    encabezado.textContent = titulo;

    const rejilla = document.createElement('div');
    rejilla.className = 'rejilla';
    // Una fila por sección: tantas columnas como campos tenga.
    rejilla.style.setProperty('--columnas', claves.length);

    claves.forEach((clave) =>
      rejilla.append(crearCampo(clave, campos[clave] ?? '', origenes[clave], textos[clave]))
    );

    bloque.append(encabezado, rejilla);
    contenedorFormulario.append(bloque);
  });
}

function crearCampo(clave, valor, origen, texto) {
  const contenedor = document.createElement('div');
  contenedor.className = `campo ${origen}`;
  contenedor.dataset.campo = clave;
  if (!valor) contenedor.classList.add('vacio');

  const etiqueta = document.createElement('label');
  etiqueta.textContent = texto;
  etiqueta.htmlFor = `campo-${clave}`;

  const entrada = document.createElement('input');
  entrada.id = `campo-${clave}`;
  entrada.value = valor;
  entrada.addEventListener('input', () => {
    contenedor.classList.toggle('vacio', !entrada.value.trim());
    contenedor.classList.remove('escrito');
  });

  contenedor.append(etiqueta, entrada);
  return contenedor;
}

function dibujarAvisos(avisos) {
  contenedorAvisos.innerHTML = '';
  (avisos || []).forEach((texto) => {
    const nodo = document.createElement('div');
    nodo.className = 'aviso';
    nodo.append(document.createTextNode(texto));
    contenedorAvisos.append(nodo);
  });
}

function leerFormulario() {
  const campos = {};
  contenedorFormulario.querySelectorAll('.campo').forEach((contenedor) => {
    campos[contenedor.dataset.campo] = contenedor.querySelector('input').value.trim();
  });
  return campos;
}

// --- Paso 3: llenar en Refácil ------------------------------------------------

function reiniciarProgreso() {
  camposEscritos = 0;
  progreso.classList.remove('completo');
  progresoRelleno.style.width = '0%';
  progresoNum.textContent = '0';
}

function avanzarProgreso() {
  camposEscritos = Math.min(camposEscritos + 1, TOTAL_CAMPOS);
  progresoRelleno.style.width = `${(camposEscritos / TOTAL_CAMPOS) * 100}%`;
  progresoNum.textContent = String(camposEscritos);
}

btnLlenar.addEventListener('click', async () => {
  btnLlenar.disabled = true;
  btnLlenar.classList.add('cargando');
  bitacora.innerHTML = '';
  reiniciarProgreso();
  seccionBitacora.hidden = false;
  seccionComprobante.hidden = true;
  contenedorFormulario
    .querySelectorAll('.campo')
    .forEach((c) => c.classList.remove('escrito'));

  try {
    const respuesta = await fetch('/api/llenar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ campos: leerFormulario() }),
    });
    const datos = await respuesta.json();

    if (!respuesta.ok) {
      apuntar('error', datos.error || 'No se pudo iniciar el llenado.');
      btnLlenar.disabled = false;
      btnLlenar.classList.remove('cargando');
      return;
    }

    marcarPaso(3);
    seccionBitacora.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (error) {
    apuntar('error', `Error de red: ${error.message}`);
    btnLlenar.disabled = false;
    btnLlenar.classList.remove('cargando');
  }
});

const ICONOS = { inicio: '·', campo: '✓', aviso: '!', error: '✕', fin: '■' };
const CLASES = {
  inicio: '',
  campo: 'campo-ok',
  aviso: 'campo-aviso',
  error: 'campo-error',
  fin: 'campo-fin',
};

function apuntar(tipo, mensaje) {
  const fila = document.createElement('li');
  fila.className = CLASES[tipo] ?? '';

  const icono = document.createElement('span');
  icono.className = 'icono';
  icono.textContent = ICONOS[tipo] ?? '·';

  const texto = document.createElement('span');
  texto.textContent = mensaje;

  fila.append(icono, texto);
  bitacora.append(fila);
  bitacora.scrollTop = bitacora.scrollHeight;
}

// --- Paso 4: comprobante ------------------------------------------------------

/** Carga la foto elegida como imagen lista para dibujarse en el canvas. */
function cargarImagen(archivo) {
  return new Promise((resolver) => {
    if (!archivo) return resolver(null);
    const imagen = new Image();
    imagen.onload = () => resolver(imagen);
    imagen.onerror = () => resolver(null);
    imagen.src = URL.createObjectURL(archivo);
  });
}

async function generarComprobante() {
  const campos = leerFormulario();
  const nombreCompleto = [campos.nombre, campos.paterno, campos.materno]
    .filter(Boolean)
    .join(' ');

  datosComprobante = { nombreCompleto, rfc: campos.rfc, fecha: new Date() };

  const imagen = await cargarImagen(archivoElegido);
  dibujarComprobante(lienzo, datosComprobante, imagen);

  seccionComprobante.hidden = false;
  await descargarComprobante(lienzo, datosComprobante);
  seccionComprobante.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

btnDescargar.addEventListener('click', () => {
  if (datosComprobante) descargarComprobante(lienzo, datosComprobante);
});

// --- Conexión en vivo ---------------------------------------------------------

const flujo = new EventSource('/api/eventos');

flujo.onmessage = (evento) => {
  const dato = JSON.parse(evento.data);
  apuntar(dato.tipo, dato.mensaje);

  if (dato.tipo === 'campo') {
    avanzarProgreso();
    const contenedor = contenedorFormulario.querySelector(`[data-campo="${dato.campo}"]`);
    if (contenedor) contenedor.classList.add('escrito');
  }

  if (dato.tipo === 'fin') {
    btnLlenar.disabled = false;
    btnLlenar.classList.remove('cargando');
    progreso.classList.add('completo');
    generarComprobante();
  }
};

flujo.onerror = () => apuntar('aviso', 'Se perdió la conexión con el servidor; reintentando…');
