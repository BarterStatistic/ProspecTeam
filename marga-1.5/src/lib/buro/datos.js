// Arma el registro de 18 campos que espera el formulario de Refácil.
//
// Port 1:1 de `ine-refacil/datos.py`; `scripts/paridad-buro.mjs` corre los
// mismos casos que `ine-refacil/tests/test_datos.py`.
//
// Une tres orígenes: lo que se leyó de la INE, lo que se calcula (RFC, correo,
// celular) y las constantes del negocio, que son iguales en toda solicitud.

import { curpValida, normalizarCurp, resolverRfc } from './rfc.js';

// --- Constantes del negocio ---------------------------------------------------

// Los selects se guardan por su TEXTO visible, no por su value interno: así la
// pantalla de revisión muestra "COAHUILA DE ZARAGOZA" en vez de un "5" que no
// le dice nada a quien revisa, y se puede corregir escribiendo el nombre real.
export const ESTADO = 'COAHUILA DE ZARAGOZA'; // cbEstado, value 5
export const MUNICIPIO = 'SALTILLO';          // cbMunicipio, se puebla por AJAX
export const LOCALIDAD = 'SALTILLO';          // cbLocalidad, también por AJAX
export const CP = '25000';
export const COLONIA = 'ZONA CENTRO';
export const EMPRESA = 'STELLANTIS';
export const INGRESO_MENSUAL = '20000';
export const TIPO_VENTA = 'MOTO NOMINA';      // cbTipo_Venta, value 9
export const DOMINIO_CORREO = 'YOPMAIL.COM';  // sí existe en la lista del formulario
export const LADA = '844';                    // Saltillo

// Cómo se agrupa la pantalla de revisión. Cada sección es un bloque con título
// y ocupa UNA sola fila, con tantas columnas como campos tenga: así se lee de
// corrido de arriba hacia abajo, en vez de ser una cuadrícula de 18 cajas
// iguales donde hay que buscar cada dato.
//
// Este orden NO es el del llenado: `automatizacion.ORDEN` mete el estado antes
// que el municipio porque el municipio depende del AJAX que dispara el estado.
export const SECCIONES = [
  { titulo: 'Identidad', campos: ['nombre', 'paterno', 'materno'] },
  { titulo: 'Ubicación', campos: ['cbEstado', 'cbLocalidad', 'cbMunicipio'] },
  { titulo: 'Domicilio', campos: ['calle', 'numExt', 'cp', 'colonia'] },
  { titulo: 'Contacto', campos: ['numTelefono', 'correo', 'cbCorreo'] },
  { titulo: 'Claves fiscales', campos: ['curp', 'rfc'] },
  { titulo: 'Datos del crédito', campos: ['empresa', 'ingresoMensual', 'cbTipo_Venta'] },
];

// De dónde salió cada dato; en la interfaz define el color del punto.
export const ORIGENES = {
  nombre: 'ine',
  paterno: 'ine',
  materno: 'ine',
  cbEstado: 'constante',
  cbLocalidad: 'constante',
  cbMunicipio: 'constante',
  calle: 'ine',
  numExt: 'ine',
  cp: 'constante',
  colonia: 'constante',
  numTelefono: 'calculado',
  correo: 'calculado',
  cbCorreo: 'constante',
  curp: 'ine',
  rfc: 'calculado',
  empresa: 'constante',
  ingresoMensual: 'constante',
  cbTipo_Venta: 'constante',
};

// Etiquetas para la bitácora y el formulario de revisión.
export const ETIQUETAS = {
  rfc: 'RFC',
  correo: 'Correo',
  cbCorreo: 'Dominio del correo',
  curp: 'CURP',
  nombre: 'Nombre(s)',
  paterno: 'Apellido paterno',
  materno: 'Apellido materno',
  cbEstado: 'Estado',
  cbMunicipio: 'Municipio',
  cbLocalidad: 'Localidad',
  calle: 'Calle',
  numExt: 'Número exterior',
  cp: 'Código postal',
  colonia: 'Colonia',
  numTelefono: 'Celular',
  empresa: 'Empresa',
  ingresoMensual: 'Ingreso mensual',
  cbTipo_Venta: 'Tipo de venta',
};

/** Cuántos campos lleva el formulario. Alimenta la barra de progreso. */
export const TOTAL_CAMPOS = Object.keys(ORIGENES).length;

// --- Generadores --------------------------------------------------------------

/** Celular ficticio de 10 dígitos con lada de Saltillo. */
export function generarCelular() {
  let digitos = '';
  for (let i = 0; i < 7; i += 1) digitos += String(Math.floor(Math.random() * 10));
  return LADA + digitos;
}

function sinAcentos(texto) {
  return String(texto ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Mn}/gu, '');
}

/** Primera palabra de un texto, o cadena vacía si no hay ninguna. */
function primeraPalabra(texto) {
  return sinAcentos(texto).trim().split(/\s+/).filter(Boolean)[0] ?? '';
}

/** Usuario de correo derivado del nombre, sin el dominio. */
export function generarUsuarioCorreo(nombres, paterno) {
  const primero = nombres ? primeraPalabra(nombres) : 'cliente';
  const apellido = paterno ? primeraPalabra(paterno) : 'pt';
  const usuario = `${primero}.${apellido}`.replace(/[^a-z.]/g, '');
  return `${usuario}${Math.floor(Math.random() * 900) + 100}`;
}

// --- Construcción del registro ------------------------------------------------

/**
 * Devuelve { campos, avisos } a partir del objeto que entregó el OCR.
 *
 * `campos` trae las 18 llaves con los IDs exactos del formulario de Refácil.
 * `avisos` son advertencias para mostrar en la página, no errores fatales.
 */
export function construir(lectura) {
  const avisos = [];

  const nombres = String(lectura?.nombres ?? '').trim();
  const paterno = String(lectura?.apellido_paterno ?? '').trim();
  const materno = String(lectura?.apellido_materno ?? '').trim();
  const curp = String(lectura?.curp ?? '').trim();
  const fecha = String(lectura?.fecha_nacimiento ?? '').trim();

  if (curp && !curpValida(curp)) {
    avisos.push(
      `La CURP leída (${curp}) no pasa su propio dígito verificador. ` +
        'Revísala contra la credencial antes de continuar.',
    );
  }

  let valorRfc;
  try {
    const resuelto = resolverRfc(nombres, paterno, materno, fecha, curp || null);
    valorRfc = resuelto.rfc;
    if (resuelto.advertencia) avisos.push(resuelto.advertencia);
  } catch (exc) {
    valorRfc = '';
    avisos.push(`No se pudo calcular el RFC: ${exc.message}. Captúralo a mano.`);
  }

  const campos = {
    rfc: valorRfc,
    correo: generarUsuarioCorreo(nombres, paterno),
    cbCorreo: DOMINIO_CORREO,
    curp: normalizarCurp(curp),
    nombre: nombres.toUpperCase(),
    paterno: paterno.toUpperCase(),
    materno: materno.toUpperCase(),
    cbEstado: ESTADO,
    cbMunicipio: MUNICIPIO,
    cbLocalidad: LOCALIDAD,
    calle: String(lectura?.calle ?? '').trim().toUpperCase(),
    numExt: String(lectura?.numero_exterior ?? '').trim().toUpperCase(),
    cp: CP,
    colonia: COLONIA,
    numTelefono: generarCelular(),
    empresa: EMPRESA,
    ingresoMensual: INGRESO_MENSUAL,
    cbTipo_Venta: TIPO_VENTA,
  };

  const faltantes = ['curp', 'nombre', 'paterno', 'materno', 'calle', 'numExt']
    .filter((clave) => !campos[clave])
    .map((clave) => ETIQUETAS[clave]);

  if (faltantes.length) {
    avisos.push(
      `No se pudieron leer de la INE: ${faltantes.join(', ')}` +
        '. Complétalos antes de llenar el formulario.',
    );
  }

  return { campos, avisos };
}

/** Campos requeridos por Refácil que siguen vacíos. */
export function obligatoriosVacios(campos) {
  return Object.keys(ORIGENES)
    .filter((clave) => !String(campos?.[clave] ?? '').trim())
    .map((clave) => ETIQUETAS[clave]);
}
