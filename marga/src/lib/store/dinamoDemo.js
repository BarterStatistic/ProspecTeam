// Bandeja de Dinamo de mentira para el modo demo (VITE_DEMO=1): misma interfaz
// que dinamoSupabase.js, con dos créditos de ejemplo (folios 900001 y 900002)
// para ver la tarjeta, el detalle y la franja «En vivo» sin tocar la base real.

const ok = { icono: 'ok', alt: '' };
const CREDITOS = [
  {
    folio: '900001',
    cliente: 'JUAN CARLOS EJEMPLO DEMO',
    esquema: 'CREDITO',
    moto: 'DM 200',
    puntoVenta: 'SALTILLO',
    fechaCaptura: '03/11/2026 10:15',
    etapas: { Captura: ok, DOC: ok, BNC: ok, VF: { icono: 'p', alt: '' }, CC: { icono: 'na', alt: '' }, EC: null, Aut: null },
    columna: 'vfs_call_center',
    conDetalle: true,
  },
  {
    folio: '900002',
    cliente: 'ANA PRUEBA DEMO',
    esquema: 'MOTONOMINA',
    moto: 'FT 150',
    puntoVenta: 'SALTILLO',
    fechaCaptura: '04/11/2026 17:40',
    etapas: { Captura: ok, DOC: ok, BNC: { icono: 'p', alt: '' }, VF: null, CC: null, EC: null, Aut: null },
    columna: 'bnc',
    conDetalle: true,
  },
];

const DETALLE = {
  bnc: { comentarios: 'ANALISTA DEMO 03/11/2026\nBuró revisado, sin observaciones.' },
  vf: {
    estatus: 'EN PROCESO',
    visitas: [
      {
        pk: '1',
        titulo: 'DATOS DEL CLIENTE',
        estatus: 'RECOMENDADA',
        pregunta: '¿RECOMIENDA LA VENTA?',
        respuesta: 'SI',
        historial: [{ usuario: 'VERIFICADOR', fecha: '04/11/2026 12:00', comentario: 'Domicilio confirmado.', estatus: 'FINALIZADO' }],
      },
    ],
  },
  cc: { bloques: [{ titulo: 'REFERENCIAS PERSONALES O FAMILIARES 1', estatus: 'CORREGIR INF.', comentarios: 'No contesta.' }] },
};

export function crearDinamoDemo() {
  let intervalo = 30;
  let ultimaSync = new Date(Date.now() - 5 * 60000).toISOString();
  const latido = () => new Date(Date.now() - 20000).toISOString();
  return {
    getCreditos: () => CREDITOS,
    onCreditosChange(cb) {
      cb(CREDITOS);
      return () => {};
    },
    async panel() {
      return {
        estado: { ultima_sync: ultimaSync, intervalo_min: intervalo, total: CREDITOS.length },
        agentes: [
          { id: 'demo-1', nombre: 'VENTAS-1', activo: true, version: '0.4.0', ultimo_latido: latido(), ultima_sync: ultimaSync },
          { id: 'demo-2', nombre: 'VENTAS-2', activo: true, version: '0.4.0', ultimo_latido: latido() },
        ],
      };
    },
    async forzar() {
      ultimaSync = new Date().toISOString();
    },
    async intervalo(n) {
      intervalo = n;
    },
    async maquinaActiva() {},
    async detalle() {
      return { datos: DETALLE, actualizado_en: new Date(Date.now() - 60000).toISOString(), pendiente: false };
    },
    async pedirDetalle() {},
  };
}
