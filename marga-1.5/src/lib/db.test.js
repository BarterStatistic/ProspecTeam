// Pruebas de la capa de dominio (db.js) contra el store de memoria real.
//
// db.js importa el singleton `store` de ./store/index.js, que elige backend al
// cargarse leyendo `import.meta.env.VITE_DEMO`. Por eso cada prueba: fija
// VITE_DEMO=1 con `vi.stubEnv`, pone un `localStorage` de mentira (el store de
// memoria persiste ahí), limpia el registro de módulos y vuelve a importar —
// así cada caso arranca con un store vacío y no depende de los demás.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { calcularFinanciamiento } from './cotizador.js';
import { calcularComision, fechaPago, CONFIG_DEFAULT } from './comisiones.js';
import { TIPOS, mensajeFacturacion } from './notificaciones.js';

// En modo demo nunca se usa Firestore; se sustituye para no cargar el SDK de
// Firebase en cada `resetModules` (lo hacía lento sin aportar nada).
vi.mock('./store/firestoreStore.js', () => ({ createFirestoreStore: () => null }));

function localStorageDeMentira() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
    clear: () => map.clear(),
  };
}

const at = (y, m, d) => new Date(y, m - 1, d).getTime();

let db;
let store;

beforeEach(async () => {
  vi.stubEnv('VITE_DEMO', '1');
  vi.stubGlobal('localStorage', localStorageDeMentira());
  vi.resetModules();
  db = await import('./db.js');
  ({ store } = await import('./store/index.js'));
  await store.init();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const VENDEDOR = 'vend_ana';
const ADMIN = { username: 'admin_braulio' };

function sembrarCliente(extra = {}) {
  return db.createClient(
    {
      section: 'procesos',
      stage: 'credito_por_subir',
      firstName: 'Juan',
      lastName: 'Pérez',
      phone: '8441234567',
      motorcycles: 'U2, U5 (andaba viendo ambas)',
      creditScheme: 'Motonómina',
      ...extra,
    },
    { username: VENDEDOR },
  );
}

const facturacion = (fechaFacturacion, extra = {}) => ({
  fechaFacturacion,
  enganche: 3000,
  incluyeServicio: false,
  motoNombre: 'U2',
  esquemaId: 'motonomina',
  ...extra,
});

const comisionesDe = (clienteId) =>
  store.getComisiones().filter((c) => c.clienteId === clienteId);
const avisosDe = (clienteId) =>
  store
    .getNotificaciones()
    .filter((n) => n.clienteId === clienteId && n.tipo === TIPOS.FACTURACION);
const tarjeta = (id) => store.getClients().find((c) => c.id === id);

describe('registrarFacturacion', () => {
  it('crea la comisión, estampa la tarjeta, conserva motorcycles y notifica al vendedor', async () => {
    const cliente = await sembrarCliente();
    const values = facturacion(at(2026, 9, 20));

    const comision = await db.registrarFacturacion(cliente.id, values, ADMIN);

    // Importes calculados aparte, sin pasar por db.js.
    const fin = calcularFinanciamiento({
      motoNombre: 'U2',
      incluyeServicio: false,
      esquemaId: 'motonomina',
      enganche: 3000,
    });
    const esperado = calcularComision({
      montoFinanciado: fin.montoFinanciado,
      esquemaId: 'motonomina',
      numeroVenta: 1,
      tienePromotor: false,
    });
    expect(comisionesDe(cliente.id)).toHaveLength(1);
    expect(comision.vendedor).toBe(VENDEDOR);
    expect(comision.numeroVenta).toBe(1);
    expect(comision.mesVenta).toBe('2026-09');
    expect(comision.montoFinanciado).toBeCloseTo(fin.montoFinanciado, 6);
    expect(comision.comisionVendedor).toBeCloseTo(esperado.comisionVendedor, 6);

    const t = tarjeta(cliente.id);
    expect(t.fechaFacturacion).toBe(values.fechaFacturacion);
    expect(t.comisionId).toBe(comision.id);
    expect(t.motorcycles).toBe('U2, U5 (andaba viendo ambas)');
    expect(t.creditScheme).toBe('Motonómina');

    const avisos = avisosDe(cliente.id);
    expect(avisos).toHaveLength(1);
    expect(avisos[0].destinatario).toBe(VENDEDOR);
    expect(avisos[0].mensaje).toBe(
      mensajeFacturacion(
        comision.clienteNombre,
        comision.comisionVendedor,
        fechaPago(values.fechaFacturacion, CONFIG_DEFAULT),
      ),
    );
  });

  it('es idempotente: dos llamadas dejan una sola comisión, sin inflar numeroVenta ni duplicar el aviso', async () => {
    const cliente = await sembrarCliente();
    const primera = await db.registrarFacturacion(cliente.id, facturacion(at(2026, 9, 20)), ADMIN);
    const segunda = await db.registrarFacturacion(cliente.id, facturacion(at(2026, 9, 20)), ADMIN);

    expect(comisionesDe(cliente.id)).toHaveLength(1);
    expect(store.getComisiones()).toHaveLength(1);
    expect(segunda.id).toBe(primera.id);
    expect(segunda.numeroVenta).toBe(1);
    expect(avisosDe(cliente.id)).toHaveLength(1);

    // La siguiente venta del mismo vendedor es la #2, no la #3.
    const otro = await sembrarCliente({ firstName: 'Ana' });
    const siguiente = await db.registrarFacturacion(otro.id, facturacion(at(2026, 9, 21)), ADMIN);
    expect(siguiente.numeroVenta).toBe(2);
  });

  it('completa un reintento tras una escritura parcial sin crear otra comisión', async () => {
    const cliente = await sembrarCliente();
    const primera = await db.registrarFacturacion(cliente.id, facturacion(at(2026, 9, 20)), ADMIN);
    // Simula que el patch de la tarjeta nunca llegó.
    await store.patchClient(cliente.id, { comisionId: null, fechaFacturacion: null });

    await db.registrarFacturacion(cliente.id, facturacion(at(2026, 9, 20)), ADMIN);

    expect(comisionesDe(cliente.id)).toHaveLength(1);
    expect(tarjeta(cliente.id).comisionId).toBe(primera.id);
  });

  it('no notifica al vendedor cuando él mismo registra la facturación', async () => {
    const cliente = await sembrarCliente();
    await db.registrarFacturacion(cliente.id, facturacion(at(2026, 9, 20)), {
      username: VENDEDOR,
    });

    expect(comisionesDe(cliente.id)).toHaveLength(1);
    expect(avisosDe(cliente.id)).toHaveLength(0);
    expect(store.getNotificaciones()).toHaveLength(0);
  });
});

describe('actualizarFacturacion', () => {
  it('conserva numeroVenta cuando la facturación sigue en el mismo mes', async () => {
    const a = await sembrarCliente({ firstName: 'A' });
    const b = await sembrarCliente({ firstName: 'B' });
    const c = await sembrarCliente({ firstName: 'C' });
    const ca = await db.registrarFacturacion(a.id, facturacion(at(2026, 9, 5)), ADMIN);
    await db.registrarFacturacion(b.id, facturacion(at(2026, 9, 10)), ADMIN);
    await db.registrarFacturacion(c.id, facturacion(at(2026, 9, 15)), ADMIN);

    // Recontar daría 3; conservar deja la #1.
    const editada = await db.actualizarFacturacion(
      ca.id,
      facturacion(at(2026, 9, 25), { enganche: 4000 }),
      ADMIN,
    );
    expect(editada.id).toBe(ca.id);
    expect(editada.numeroVenta).toBe(1);
    expect(editada.enganche).toBe(4000);
    expect(store.getComisiones()).toHaveLength(3);
  });

  it('recalcula numeroVenta al cambiar de mes de venta, sin contarse a sí misma', async () => {
    const a = await sembrarCliente({ firstName: 'A' });
    const b = await sembrarCliente({ firstName: 'B' });
    const c = await sembrarCliente({ firstName: 'C' });
    const ca = await db.registrarFacturacion(a.id, facturacion(at(2026, 9, 5)), ADMIN);
    await db.registrarFacturacion(b.id, facturacion(at(2026, 9, 10)), ADMIN);
    await db.registrarFacturacion(c.id, facturacion(at(2026, 10, 3)), ADMIN); // #1 de octubre

    const movida = await db.actualizarFacturacion(ca.id, facturacion(at(2026, 10, 8)), ADMIN);

    expect(movida.mesVenta).toBe('2026-10');
    expect(movida.numeroVenta).toBe(2);
    const esperado = calcularComision({
      montoFinanciado: movida.montoFinanciado,
      esquemaId: 'motonomina',
      numeroVenta: 2,
      tienePromotor: false,
    });
    expect(movida.comisionVendedor).toBeCloseTo(esperado.comisionVendedor, 6);
  });
});

describe('eliminarComision', () => {
  it('borra la comisión y limpia la marca de facturación de la tarjeta', async () => {
    const cliente = await sembrarCliente();
    const comision = await db.registrarFacturacion(cliente.id, facturacion(at(2026, 9, 20)), ADMIN);

    await db.eliminarComision(comision.id);

    expect(store.getComisiones()).toHaveLength(0);
    const t = tarjeta(cliente.id);
    expect(t.comisionId).toBeNull();
    expect(t.fechaFacturacion).toBeNull();
    expect(t.motorcycles).toBe('U2, U5 (andaba viendo ambas)');
  });
});

describe('renumerarMes', () => {
  it('reordena por fecha de facturación y recalcula los importes', async () => {
    const tarde = await sembrarCliente({ firstName: 'Tarde' });
    const temprano = await sembrarCliente({ firstName: 'Temprano' });
    // Se registran al revés de su fecha: la del 20 queda #1 y la del 10, #2.
    const cTarde = await db.registrarFacturacion(tarde.id, facturacion(at(2026, 9, 20)), ADMIN);
    const cTemprano = await db.registrarFacturacion(
      temprano.id,
      facturacion(at(2026, 9, 10)),
      ADMIN,
    );
    expect(cTarde.numeroVenta).toBe(1);
    expect(cTemprano.numeroVenta).toBe(2);
    // Otro vendedor en el mismo mes, ya en orden: no se toca.
    const ajeno = await db.createClient(
      { section: 'procesos', stage: 'credito_por_subir', firstName: 'Beto' },
      { username: 'vend_beto' },
    );
    await db.registrarFacturacion(ajeno.id, facturacion(at(2026, 9, 1)), ADMIN);

    const cambios = await db.renumerarMes('2026-09');

    expect(cambios).toBe(2);
    const porId = (id) => store.getComisiones().find((c) => c.id === id);
    const nuevoTemprano = porId(cTemprano.id);
    const nuevoTarde = porId(cTarde.id);
    expect(nuevoTemprano.numeroVenta).toBe(1);
    expect(nuevoTarde.numeroVenta).toBe(2);
    for (const [c, n] of [
      [nuevoTemprano, 1],
      [nuevoTarde, 2],
    ]) {
      const esperado = calcularComision({
        montoFinanciado: c.montoFinanciado,
        esquemaId: c.esquemaId,
        numeroVenta: n,
        tienePromotor: false,
      });
      expect(c.nivelRacha).toBe(esperado.nivelRacha);
      expect(c.porcentajeRacha).toBe(esperado.porcentajeRacha);
      expect(c.comisionVendedor).toBeCloseTo(esperado.comisionVendedor, 6);
      expect(c.netoAdmin).toBeCloseTo(esperado.netoAdmin, 6);
    }
  });
});

describe('respaldo (exportAll / importAll)', () => {
  async function sembrarDinero() {
    const cliente = await sembrarCliente();
    const comision = await db.registrarFacturacion(cliente.id, facturacion(at(2026, 9, 20)), ADMIN);
    await db.guardarConfigComisiones({ diaPago: 4, notaVendedores: 'Pago los jueves' });
    await db.registrarCotizacion(
      { moto: 'U2', esquemaId: 'motonomina', precioEfectivo: 21945, enganchePct: 10, plazo: 72, parcialidad: 800 },
      { username: VENDEDOR },
    );
    return { cliente, comision };
  }

  it('un admin exporta también comisiones, su configuración y cotizaciones', async () => {
    await sembrarDinero();
    const data = await db.exportAll('admin');

    expect(data.version).toBe(3);
    expect(data.clients).toHaveLength(1);
    expect(data.comisiones).toHaveLength(1);
    expect(data.cotizaciones).toHaveLength(1);
    expect(data.configComisiones).toMatchObject({ diaPago: 4, notaVendedores: 'Pago los jueves' });
  });

  it.each(['vendedor', 'promotor', undefined])(
    'el rol %s exporta solo clientes y citas (sin nómina)',
    async (role) => {
      await sembrarDinero();
      const data = await db.exportAll(role);

      expect(data.version).toBe(3);
      expect(data.clients).toHaveLength(1);
      expect(Array.isArray(data.citas)).toBe(true);
      expect(data).not.toHaveProperty('comisiones');
      expect(data).not.toHaveProperty('configComisiones');
      expect(data).not.toHaveProperty('cotizaciones');
    },
  );

  it('importAll restaura comisiones, configuración y cotizaciones cuando vienen en el archivo', async () => {
    await sembrarDinero();
    const respaldo = JSON.parse(JSON.stringify(await db.exportAll('admin')));

    // Store vacío nuevo, como en otro dispositivo.
    vi.stubGlobal('localStorage', localStorageDeMentira());
    vi.resetModules();
    db = await import('./db.js');
    ({ store } = await import('./store/index.js'));
    await store.init();
    expect(store.getComisiones()).toHaveLength(0);

    const n = await db.importAll(respaldo, 'replace');

    expect(n).toBe(1);
    expect(store.getClients()).toHaveLength(1);
    expect(store.getComisiones()).toEqual(respaldo.comisiones);
    expect(store.getCotizaciones()).toEqual(respaldo.cotizaciones);
    expect(store.getConfig()).toMatchObject({ diaPago: 4, notaVendedores: 'Pago los jueves' });
  });

  it('acepta un respaldo viejo (v2) sin esas colecciones y no toca las existentes', async () => {
    const { comision } = await sembrarDinero();
    const viejo = {
      app: 'marga',
      version: 2,
      exportedAt: at(2026, 9, 1),
      clients: [{ id: 'viejo-1', firstName: 'Viejo', section: 'prospectos', stage: 'nuevo' }],
      citas: [],
    };

    const n = await db.importAll(viejo, 'merge');

    expect(n).toBe(1);
    expect(store.getClients()).toHaveLength(2);
    expect(store.getComisiones().map((c) => c.id)).toEqual([comision.id]);
    expect(store.getCotizaciones()).toHaveLength(1);
    expect(store.getConfig()).toMatchObject({ diaPago: 4 });
  });
});
