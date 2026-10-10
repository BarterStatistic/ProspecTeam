// Verificación de paridad entre el port JS del Buró Automático y el original en
// Python (`ine-refacil/rfc.py` y `ine-refacil/datos.py`).
//
// Cada caso de aquí es el mismo que su gemelo en `ine-refacil/tests/`. Si un
// día alguien cambia la lógica de un lado y no del otro, esto falla.
//
//   node scripts/paridad-buro.mjs

import {
  ALFABETO_HOMOCLAVE,
  calcularDigitoVerificador,
  calcularHomoclave,
  curpValida,
  fechaAammdd,
  letrasIniciales,
  primeraVocalInterna,
  resolverRfc,
  rfcDesdeCurp,
  rfcDesdeNombre,
} from '../src/lib/buro/rfc.js';

import {
  construir,
  obligatoriosVacios,
  ORIGENES,
  SECCIONES,
} from '../src/lib/buro/datos.js';

let pasaron = 0;
const fallas = [];

function prueba(nombre, fn) {
  try {
    fn();
    pasaron += 1;
  } catch (error) {
    fallas.push({ nombre, mensaje: error.message });
  }
}

function igual(recibido, esperado, contexto = '') {
  const a = JSON.stringify(recibido);
  const b = JSON.stringify(esperado);
  if (a !== b) {
    throw new Error(`${contexto ? `${contexto}: ` : ''}se esperaba ${b} y llegó ${a}`);
  }
}

function cierto(condicion, contexto) {
  if (!condicion) throw new Error(contexto);
}

function lanza(fn, contexto) {
  let lanzo = false;
  try {
    fn();
  } catch {
    lanzo = true;
  }
  if (!lanzo) throw new Error(`${contexto}: se esperaba un error y no lo hubo`);
}

// ===========================================================================
// test_rfc.py
// ===========================================================================

// --- Cuatro letras iniciales --------------------------------------------------

const CASOS_INICIALES = [
  // Caso base: inicial + primera vocal interna del paterno, inicial del
  // materno, inicial del nombre.
  ['Juan', 'Barrios', 'Fernández', 'BAFJ'],
  ['Eva', 'Martínez', 'López', 'MALE'],
  // JOSE y MARIA se omiten cuando hay un segundo nombre.
  ['José Antonio', 'Ramírez', 'Soto', 'RASA'],
  ['María Guadalupe', 'Núñez', 'Ortiz', 'NUOG'],
  // ...pero se usan cuando son el único nombre.
  ['José', 'Hernández', 'Cruz', 'HECJ'],
  // Partículas ignoradas en apellidos.
  ['Luis', 'de la Cruz', 'del Valle', 'CUVL'],
  ['Ana', 'Mc Gregor', 'Van Damme', 'GEDA'],
  // Ñ se sustituye por X en las iniciales.
  ['Ñoño', 'Ñañez', 'Peña', 'XAPX'],
  // Acentos y diéresis no cambian la letra.
  ['Ángel', 'Güémez', 'Ibáñez', 'GUIA'],
];

for (const [nombres, paterno, materno, esperado] of CASOS_INICIALES) {
  prueba(`letras_iniciales(${nombres}, ${paterno}, ${materno})`, () => {
    igual(letrasIniciales(nombres, paterno, materno), esperado);
  });
}

prueba('apellido paterno corto usa dos letras del nombre', () => {
  // Paterno de una o dos letras: una inicial por apellido y dos del nombre.
  igual(letrasIniciales('Alberto', 'Oz', 'Pérez'), 'OPAL');
  igual(letrasIniciales('Pedro', 'Ng', 'Torres'), 'NTPE');
});

prueba('sin vocal interna se usa X', () => {
  igual(primeraVocalInterna('NG'), 'X');
  igual(primeraVocalInterna('BARRIOS'), 'A');
});

prueba('sin apellido materno', () => {
  // Dos letras del paterno y dos del nombre.
  igual(letrasIniciales('Carlos', 'Solís', ''), 'SOCA');
});

prueba('sin apellido paterno', () => {
  igual(letrasIniciales('Carlos', '', 'Solís'), 'SOCA');
});

prueba('palabra inconveniente se censura', () => {
  // PUTA -> PUTX
  igual(letrasIniciales('Alma', 'Pulido', 'Tapia'), 'PUTX');
});

prueba('falta de datos es error', () => {
  lanza(() => letrasIniciales('', 'Pérez', 'López'), 'sin nombre de pila');
  lanza(() => letrasIniciales('Juan', '', ''), 'sin apellidos');
});

// --- Fecha --------------------------------------------------------------------

for (const [entrada, esperado] of [
  ['1970-12-12', '701212'],
  ['2001-01-05', '010105'],
  ['12/12/1970', '701212'],
]) {
  prueba(`fecha_aammdd(${entrada})`, () => igual(fechaAammdd(entrada), esperado));
}

prueba('fecha inválida es error', () => {
  lanza(() => fechaAammdd('12 de diciembre de 1970'), 'fecha en prosa');
});

// --- Homoclave y dígito verificador ------------------------------------------

prueba('homoclave tiene dos caracteres del alfabeto', () => {
  const homoclave = calcularHomoclave('Juan', 'Barrios', 'Fernández');
  igual(homoclave.length, 2);
  cierto(
    [...homoclave].every((c) => ALFABETO_HOMOCLAVE.includes(c)),
    `homoclave fuera del alfabeto: ${homoclave}`,
  );
});

prueba('homoclave es determinista e ignora acentos', () => {
  igual(
    calcularHomoclave('Juan', 'Barrios', 'Fernández'),
    calcularHomoclave('JUAN', 'BARRIOS', 'FERNANDEZ'),
  );
});

prueba('homoclave distingue personas distintas', () => {
  const a = calcularHomoclave('Juan', 'Barrios', 'Fernández');
  const b = calcularHomoclave('Juana', 'Barrios', 'Fernández');
  cierto(a !== b, `homoclaves iguales para personas distintas: ${a}`);
});

prueba('dígito verificador es un carácter válido', () => {
  const dv = calcularDigitoVerificador('BAFJ701212H1');
  cierto('0123456789A'.includes(dv), `dígito inesperado: ${dv}`);
});

prueba('dígito verificador exige doce caracteres', () => {
  lanza(() => calcularDigitoVerificador('BAFJ701212'), 'diez caracteres');
});

// --- RFC completo -------------------------------------------------------------

prueba('rfc desde nombre tiene trece posiciones', () => {
  const resultado = rfcDesdeNombre('Juan', 'Barrios', 'Fernández', '1970-12-12');
  igual(resultado.length, 13);
  igual(resultado.slice(0, 10), 'BAFJ701212');
});

prueba('rfc desde curp toma las diez primeras', () => {
  // CURP de ejemplo con dígito verificador correcto.
  const resultado = rfcDesdeCurp('BAFJ701212HDFRRN09', 'Juan', 'Barrios', 'Fernández');
  igual(resultado.slice(0, 10), 'BAFJ701212');
  igual(resultado.length, 13);
});

prueba('rfc desde curp rechaza formato inválido', () => {
  lanza(
    () => rfcDesdeCurp('NO-ES-UNA-CURP', 'Juan', 'Barrios', 'Fernández'),
    'curp basura',
  );
});

prueba('ambos caminos coinciden en las diez primeras', () => {
  const porCurp = rfcDesdeCurp('BAFJ701212HDFRRN09', 'Juan', 'Barrios', 'Fernández');
  const porNombre = rfcDesdeNombre('Juan', 'Barrios', 'Fernández', '1970-12-12');
  igual(porCurp, porNombre);
});

// --- resolver_rfc -------------------------------------------------------------

prueba('resolver prefiere la curp y no advierte si coinciden', () => {
  const { rfc, origen, advertencia } = resolverRfc(
    'Juan', 'Barrios', 'Fernández', '1970-12-12', 'BAFJ701212HDFRRN09',
  );
  igual(origen, 'curp');
  igual(advertencia, null);
  igual(rfc.slice(0, 10), 'BAFJ701212');
});

prueba('resolver advierte cuando los caminos difieren', () => {
  // Fecha de nacimiento distinta a la de la CURP.
  const { rfc, origen, advertencia } = resolverRfc(
    'Juan', 'Barrios', 'Fernández', '1985-03-04', 'BAFJ701212HDFRRN09',
  );
  igual(origen, 'curp');
  igual(rfc.slice(0, 10), 'BAFJ701212');
  cierto(advertencia?.includes('no coincide'), `advertencia inesperada: ${advertencia}`);
});

prueba('resolver usa el nombre cuando no hay curp', () => {
  const { rfc, origen, advertencia } = resolverRfc(
    'Juan', 'Barrios', 'Fernández', '1970-12-12', null,
  );
  igual(origen, 'nombre');
  cierto(advertencia?.includes('No se leyó la CURP'), `advertencia inesperada: ${advertencia}`);
  igual(rfc.slice(0, 10), 'BAFJ701212');
});

prueba('resolver cae al nombre si la curp es ilegible', () => {
  const { origen, advertencia } = resolverRfc(
    'Juan', 'Barrios', 'Fernández', '1970-12-12', 'BAFJ7012??HDF',
  );
  igual(origen, 'nombre');
  cierto(advertencia?.includes('no es utilizable'), `advertencia inesperada: ${advertencia}`);
});

// --- Validación de CURP -------------------------------------------------------

prueba('curp válida acepta dígito correcto', () => {
  cierto(curpValida('BAFJ701212HDFRRN09'), 'rechazó una CURP correcta');
});

prueba('curp válida rechaza dígito alterado', () => {
  cierto(!curpValida('BAFJ701212HDFRRN08'), 'aceptó un dígito verificador malo');
});

prueba('curp válida rechaza basura', () => {
  cierto(!curpValida('HOLA'), 'aceptó basura como CURP');
});

// ===========================================================================
// test_datos.py
// ===========================================================================

const LECTURA_COMPLETA = {
  nombres: 'Juan',
  apellido_paterno: 'Barrios',
  apellido_materno: 'Fernández',
  curp: 'BAFJ701212HDFRRN09',
  fecha_nacimiento: '1970-12-12',
  calle: 'Av. Universidad',
  numero_exterior: '123',
};

prueba('construye los dieciocho campos', () => {
  const { campos } = construir(LECTURA_COMPLETA);
  igual(Object.keys(campos).sort(), Object.keys(ORIGENES).sort());
  igual(Object.keys(campos).length, 18);
});

prueba('orden de la pantalla de revisión', () => {
  // Cada sección es una fila en pantalla, en este orden.
  igual(
    SECCIONES.map((s) => s.titulo),
    ['Identidad', 'Ubicación', 'Domicilio', 'Contacto', 'Claves fiscales', 'Datos del crédito'],
  );

  const porTitulo = Object.fromEntries(SECCIONES.map((s) => [s.titulo, s.campos]));
  igual(porTitulo['Identidad'], ['nombre', 'paterno', 'materno']);
  igual(porTitulo['Ubicación'], ['cbEstado', 'cbLocalidad', 'cbMunicipio']);
  igual(porTitulo['Claves fiscales'], ['curp', 'rfc']);
});

prueba('las secciones cubren todos los campos sin repetir', () => {
  // Si un campo se cae de las secciones, desaparece de la pantalla sin avisar.
  const enSecciones = SECCIONES.flatMap((s) => s.campos);
  igual(enSecciones.length, new Set(enSecciones).size, 'hay un campo repetido');
  igual(enSecciones.slice().sort(), Object.keys(ORIGENES).sort());
});

prueba('ninguna sección excede cuatro columnas', () => {
  // Más de cuatro campos por fila deja las cajas demasiado angostas.
  for (const { titulo, campos } of SECCIONES) {
    cierto(
      campos.length >= 1 && campos.length <= 4,
      `la sección ${titulo} tiene ${campos.length} campos`,
    );
  }
});

prueba('constantes del negocio', () => {
  // Los selects van por texto visible, no por el value interno de Refácil.
  const { campos } = construir(LECTURA_COMPLETA);
  igual(campos.cbEstado, 'COAHUILA DE ZARAGOZA');
  igual(campos.cbMunicipio, 'SALTILLO');
  igual(campos.cbLocalidad, 'SALTILLO');
  igual(campos.cp, '25000');
  igual(campos.colonia, 'ZONA CENTRO');
  igual(campos.empresa, 'STELLANTIS');
  igual(campos.ingresoMensual, '20000');
  igual(campos.cbTipo_Venta, 'MOTO NOMINA');
  igual(campos.cbCorreo, 'YOPMAIL.COM');
});

prueba('datos de la INE van en mayúsculas', () => {
  const { campos } = construir(LECTURA_COMPLETA);
  igual(campos.nombre, 'JUAN');
  igual(campos.paterno, 'BARRIOS');
  igual(campos.materno, 'FERNÁNDEZ');
  igual(campos.calle, 'AV. UNIVERSIDAD');
  igual(campos.numExt, '123');
});

prueba('rfc se calcula desde la curp', () => {
  const { campos, avisos } = construir(LECTURA_COMPLETA);
  igual(campos.rfc.slice(0, 10), 'BAFJ701212');
  igual(campos.rfc.length, 13);
  igual(avisos, []);
});

prueba('celular tiene diez dígitos con lada de Saltillo', () => {
  const { campos } = construir(LECTURA_COMPLETA);
  cierto(/^844\d{7}$/.test(campos.numTelefono), `celular inesperado: ${campos.numTelefono}`);
});

prueba('correo sale del nombre y no trae acentos', () => {
  const { campos } = construir({ ...LECTURA_COMPLETA, nombres: 'José Ángel' });
  cierto(/^[a-z.]+\d{3}$/.test(campos.correo), `correo inesperado: ${campos.correo}`);
  cierto(campos.correo.startsWith('jose.barrios'), `correo inesperado: ${campos.correo}`);
});

prueba('avisa cuando la curp no pasa su dígito', () => {
  const { avisos } = construir({ ...LECTURA_COMPLETA, curp: 'BAFJ701212HDFRRN08' });
  cierto(
    avisos.some((a) => a.includes('dígito verificador')),
    `avisos inesperados: ${JSON.stringify(avisos)}`,
  );
});

prueba('avisa cuando faltan datos de la INE', () => {
  const { campos, avisos } = construir({
    ...LECTURA_COMPLETA,
    calle: null,
    numero_exterior: null,
  });
  igual(campos.calle, '');
  cierto(avisos.some((a) => a.includes('No se pudieron leer de la INE')), 'falta el aviso');
  cierto(avisos.some((a) => a.includes('Calle')), 'no menciona Calle');
});

prueba('sin curp el rfc sale del nombre y lo advierte', () => {
  const { campos, avisos } = construir({ ...LECTURA_COMPLETA, curp: null });
  igual(campos.rfc.slice(0, 10), 'BAFJ701212');
  cierto(avisos.some((a) => a.includes('No se leyó la CURP')), 'falta la advertencia');
});

prueba('sin datos para el rfc no truena', () => {
  const { campos, avisos } = construir({
    ...LECTURA_COMPLETA,
    curp: null,
    nombres: null,
    apellido_paterno: null,
    apellido_materno: null,
  });
  igual(campos.rfc, '');
  cierto(avisos.some((a) => a.includes('No se pudo calcular el RFC')), 'falta el aviso');
});

prueba('obligatorios vacíos detecta faltantes', () => {
  const { campos } = construir(LECTURA_COMPLETA);
  igual(obligatoriosVacios(campos), []);

  campos.calle = '';
  campos.curp = '   ';
  const faltantes = obligatoriosVacios(campos);
  cierto(faltantes.includes('Calle'), 'no detectó Calle');
  cierto(faltantes.includes('CURP'), 'no detectó CURP');
});

// ===========================================================================

if (fallas.length) {
  console.error(`\n✕ ${fallas.length} de ${pasaron + fallas.length} casos fallaron:\n`);
  for (const { nombre, mensaje } of fallas) console.error(`  ✕ ${nombre}\n    ${mensaje}`);
  process.exit(1);
}

console.log(`✓ ${pasaron} casos de paridad con ine-refacil/tests pasaron.`);
