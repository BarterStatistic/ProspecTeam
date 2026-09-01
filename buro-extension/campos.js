// Orden y clasificación de los 18 campos del formulario de Refácil.
//
// Port de `ine-refacil/automatizacion.py` (ORDEN, SELECTS, SELECTS_DINAMICOS) y
// de `datos.py` (ETIQUETAS). Si cambian allá, cambian aquí.

// Orden de llenado: el mismo que sigue una persona, y estado antes que
// municipio porque municipio depende de lo que cargue el AJAX del estado.
const ORDEN = [
  'rfc', 'correo', 'cbCorreo', 'curp', 'nombre', 'paterno', 'materno',
  'cbEstado', 'cbMunicipio', 'cbLocalidad', 'calle', 'numExt', 'cp',
  'colonia', 'numTelefono', 'empresa', 'ingresoMensual', 'cbTipo_Venta',
];

// Todos los selects se eligen por texto visible, no por value: el value es un
// número interno de Refácil que cambiaría sin aviso y que nadie puede verificar
// al revisar la pantalla.
const SELECTS = new Set(['cbCorreo', 'cbEstado', 'cbMunicipio', 'cbLocalidad', 'cbTipo_Venta']);

// Estos dos los puebla un AJAX, así que hay que esperar a que carguen.
const SELECTS_DINAMICOS = new Set(['cbMunicipio', 'cbLocalidad']);

const ETIQUETAS = {
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

// Milisegundos entre campo y campo. El equivalente de PAUSA_ENTRE_CAMPOS.
const PAUSA_ENTRE_CAMPOS = 400;
