// Prueba del enrutado de eventos entre las dos pestañas.
//
// El bug que motivó esta prueba: los eventos de los dos primeros campos (RFC y
// correo) se perdían porque el background los enrutaba consultando
// `storage.session` de forma asíncrona y abandonaba en silencio si aún no
// estaba listo, y porque `tabs.sendMessage` rechaza mientras la pestaña de
// Marga pierde el foco. El resultado: los campos SÍ se escribían en Refácil,
// pero Marga nunca los marcaba como escritos.
//
//   node pruebas/enrutado-eventos.mjs

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, '..');

let fallas = 0;
const revisar = (ok, texto) => {
  console.log(`  ${ok ? '✓' : '✕'} ${texto}`);
  if (!ok) fallas += 1;
};

/**
 * Monta el background.js real sobre un simulacro de la API de extensiones que
 * rechaza los primeros N envíos a la pestaña de Marga, imitando la ventana en
 * que esa pestaña pierde el foco.
 */
function montar({ rechazosIniciales }) {
  const entregados = [];
  let rechazosRestantes = rechazosIniciales;
  const oyentes = [];
  const almacen = new Map();

  const chrome = {
    runtime: {
      onMessage: { addListener: (fn) => oyentes.push(fn) },
    },
    storage: {
      session: {
        set: async (obj) => { for (const [k, v] of Object.entries(obj)) almacen.set(k, v); },
        get: async (k) => (almacen.has(k) ? { [k]: almacen.get(k) } : {}),
        remove: async () => {},
      },
      local: { get: async () => ({}) },
    },
    tabs: {
      query: async () => [],
      create: async () => ({ id: 99, windowId: 1 }),
      update: async () => ({ id: 99, windowId: 1 }),
      onRemoved: { addListener: () => {} },
      sendMessage: async (idPestana, mensaje) => {
        if (rechazosRestantes > 0) {
          rechazosRestantes -= 1;
          throw new Error('Could not establish connection. Receiving end does not exist.');
        }
        entregados.push({ idPestana, evento: mensaje.evento });
      },
    },
    windows: { update: async () => {} },
  };

  const fuente = readFileSync(join(RAIZ, 'background.js'), 'utf8');
  new Function('chrome', 'console', 'setTimeout', fuente)(chrome, console, setTimeout);

  const enviar = (mensaje, remitente) =>
    new Promise((resolver) => {
      let respondio = false;
      for (const fn of oyentes) {
        const asincrono = fn(mensaje, remitente, (r) => { respondio = true; resolver(r); });
        if (!asincrono && !respondio) resolver(undefined);
      }
    });

  return { enviar, entregados };
}

async function correr(rechazosIniciales, etiqueta) {
  console.log(`\n${etiqueta}`);
  const { enviar, entregados } = montar({ rechazosIniciales });

  // 1. Marga pide el llenado.
  await enviar({ tipo: 'iniciar-llenado', campos: { rfc: 'X' } }, { tab: { id: 7 } });

  // 2. La pestaña de Refácil pide su trabajo y recibe el id de Marga.
  const trabajo = await enviar({ tipo: 'listo-para-llenar' }, { tab: { id: 99 } });
  revisar(!!trabajo?.campos, 'el trabajo llega a la pestaña de Refácil');
  revisar(trabajo?.idPestanaMarga === 7, 'el trabajo incluye el id de la pestaña de Marga');

  // 3. Se publican los 18 eventos de campo, como en una corrida real.
  const ORDEN = ['rfc', 'correo', 'cbCorreo', 'curp', 'nombre', 'paterno', 'materno',
    'cbEstado', 'cbMunicipio', 'cbLocalidad', 'calle', 'numExt', 'cp', 'colonia',
    'numTelefono', 'empresa', 'ingresoMensual', 'cbTipo_Venta'];

  for (const campo of ORDEN) {
    await enviar(
      {
        tipo: 'evento-llenado',
        idPestanaMarga: trabajo.idPestanaMarga,
        evento: { tipo: 'campo', mensaje: `${campo}: v`, campo, valor: 'v' },
      },
      { tab: { id: 99 } },
    );
  }

  // Los reintentos son asíncronos: se les da tiempo de completarse.
  await new Promise((r) => setTimeout(r, 1200));

  const recibidos = entregados.map((e) => e.evento.campo);
  revisar(recibidos.length === 18, `llegaron los 18 eventos (llegaron ${recibidos.length})`);
  revisar(recibidos.includes('rfc'), 'llegó el evento de RFC (primer campo)');
  revisar(recibidos.includes('correo'), 'llegó el evento de correo (segundo campo)');
  revisar(
    recibidos.join() === ORDEN.join(),
    'los eventos conservan el orden de la corrida',
  );
}

await correr(0, 'Caso normal: la pestaña de Marga responde siempre');
await correr(2, 'Caso del bug: los dos primeros envíos rechazan (Marga pierde el foco)');

console.log(fallas ? `\n✕ ${fallas} comprobaciones fallaron\n` : '\n✓ enrutado correcto\n');
process.exit(fallas ? 1 : 0);
