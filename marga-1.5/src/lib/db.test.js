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

describe('updateClient — promotor de una venta ya facturada', () => {
  it('asignar un promotor después de facturar pone su 10% y baja el neto admin', async () => {
    const cliente = await sembrarCliente();
    const comision = await db.registrarFacturacion(cliente.id, facturacion(at(2026, 9, 20)), ADMIN);
    expect(comision.promotor).toBe('');
    expect(comision.comisionPromotor).toBe(0);

    await db.updateClient(cliente.id, { promotorEncargado: 'Promotor Nuevo' }, ADMIN);

    const actualizada = comisionesDe(cliente.id)[0];
    const esperado = calcularComision({
      montoFinanciado: comision.montoFinanciado,
      esquemaId: comision.esquemaId,
      numeroVenta: comision.numeroVenta,
      tienePromotor: true,
    });
    expect(actualizada.promotor).toBe('Promotor Nuevo');
    expect(actualizada.comisionPromotor).toBeCloseTo(esperado.comisionPromotor, 6);
    expect(actualizada.netoAdmin).toBeCloseTo(esperado.netoAdmin, 6);
    expect(actualizada.netoAdmin).toBeLessThan(comision.netoAdmin);
    // Nada más se toca: vendedor y comisión total quedan congelados.
    expect(actualizada.comisionVendedor).toBeCloseTo(comision.comisionVendedor, 6);
    expect(actualizada.comisionTotal).toBeCloseTo(comision.comisionTotal, 6);
    expect(actualizada.montoFinanciado).toBeCloseTo(comision.montoFinanciado, 6);
  });

  it('quitar el promotor de una venta facturada regresa su comisión a 0', async () => {
    const cliente = await sembrarCliente({ promotorEncargado: 'Promotor Viejo' });
    const comision = await db.registrarFacturacion(cliente.id, facturacion(at(2026, 9, 20)), ADMIN);
    expect(comision.promotor).toBe('Promotor Viejo');
    expect(comision.comisionPromotor).toBeGreaterThan(0);

    await db.updateClient(cliente.id, { promotorEncargado: '' }, ADMIN);

    const actualizada = comisionesDe(cliente.id)[0];
    expect(actualizada.promotor).toBe('');
    expect(actualizada.comisionPromotor).toBe(0);
    expect(actualizada.netoAdmin).toBeCloseTo(
      actualizada.comisionTotal - actualizada.comisionVendedor,
      6,
    );
  });

  it('cambiar otro campo del cliente no toca su comisión', async () => {
    const cliente = await sembrarCliente({ promotorEncargado: 'Promotor Fijo' });
    const comision = await db.registrarFacturacion(cliente.id, facturacion(at(2026, 9, 20)), ADMIN);

    await db.updateClient(cliente.id, { notes: 'Cliente contento' }, ADMIN);

    const sinCambios = comisionesDe(cliente.id)[0];
    expect(sinCambios).toEqual(comision);
    expect(tarjeta(cliente.id).notes).toBe('Cliente contento');
  });

  it('no toca la comisión de un cliente sin facturar aunque cambie su promotor', async () => {
    const cliente = await sembrarCliente();
    await db.updateClient(cliente.id, { promotorEncargado: 'Promotor Nuevo' }, ADMIN);
    expect(comisionesDe(cliente.id)).toHaveLength(0);
    expect(tarjeta(cliente.id).promotorEncargado).toBe('Promotor Nuevo');
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

describe('deleteClient', () => {
  const ADMIN_ROL = { username: 'admin_braulio', role: 'admin' };

  it('el admin elimina un cliente facturado junto con su comisión', async () => {
    const cliente = await sembrarCliente();
    await db.registrarFacturacion(cliente.id, facturacion(at(2026, 9, 20)), ADMIN);

    await db.deleteClient(cliente.id, ADMIN_ROL);

    expect(tarjeta(cliente.id)).toBeUndefined();
    expect(store.getComisiones()).toHaveLength(0);
  });

  it('también borra una comisión huérfana ligada solo por clienteId', async () => {
    const cliente = await sembrarCliente();
    const comision = await db.registrarFacturacion(cliente.id, facturacion(at(2026, 9, 20)), ADMIN);
    // Escritura parcial: la comisión existe pero la tarjeta no quedó estampada.
    await store.patchClient(cliente.id, { comisionId: null });

    await db.deleteClient(cliente.id, ADMIN_ROL);

    expect(store.getComisiones().find((c) => c.id === comision.id)).toBeUndefined();
  });

  it('no deja que un vendedor elimine un cliente con comisión', async () => {
    const cliente = await sembrarCliente();
    await db.registrarFacturacion(cliente.id, facturacion(at(2026, 9, 20)), ADMIN);
    await db.moveClient(cliente.id, 'prospectos', 'envio_docs_cita', ADMIN);

    await expect(
      db.deleteClient(cliente.id, { username: VENDEDOR, role: 'vendedor' }),
    ).rejects.toThrow(/solo el administrador/);
    expect(tarjeta(cliente.id)).toBeDefined();
    expect(comisionesDe(cliente.id)).toHaveLength(1);
  });

  it('un cliente sin comisión se elimina igual que antes y no toca otras comisiones', async () => {
    const facturado = await sembrarCliente();
    await db.registrarFacturacion(facturado.id, facturacion(at(2026, 9, 20)), ADMIN);
    const otro = await sembrarCliente({ firstName: 'Luis', phone: '8440000000' });

    await db.deleteClient(otro.id, { username: VENDEDOR, role: 'vendedor' });

    expect(tarjeta(otro.id)).toBeUndefined();
    expect(store.getComisiones()).toHaveLength(1);
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

describe('avisos al admin por lo que hace un vendedor', () => {
  const VEND = { username: VENDEDOR, role: 'vendedor' };
  const ADMIN_SEMILLA = 'Braulio Acosta'; // admin de SEED_USERS
  const avisosAdmin = (tipo) =>
    store.getNotificaciones().filter((n) => n.destinatario === ADMIN_SEMILLA && n.tipo === tipo);

  it('pasar un prospecto a Procesos avisa a cada admin', async () => {
    const p = await db.createClient(
      { section: 'prospectos', stage: 'primer_contacto', firstName: 'Ana', lastName: 'Ruiz' },
      VEND,
    );
    await db.moveClient(p.id, 'prospectos', 'proceso_comenzado', VEND);

    const avisos = avisosAdmin(TIPOS.PROCESO_NUEVO);
    expect(avisos).toHaveLength(1);
    expect(avisos[0].clienteId).toBe(p.id);
    expect(avisos[0].mensaje).toBe(`${VENDEDOR} pasó a Ana Ruiz a Procesos`);
  });

  it('capturar un prospecto directo en "Proceso comenzado" también avisa', async () => {
    await db.createClient(
      { section: 'prospectos', stage: 'proceso_comenzado', firstName: 'Luis', lastName: 'Mora' },
      VEND,
    );
    expect(avisosAdmin(TIPOS.PROCESO_NUEVO)).toHaveLength(1);
  });

  it('mover dentro de Prospectos o que lo haga el admin no avisa', async () => {
    const p = await db.createClient(
      { section: 'prospectos', stage: 'primer_contacto', firstName: 'Ana', lastName: 'Ruiz' },
      VEND,
    );
    await db.moveClient(p.id, 'prospectos', 'preguntas', VEND);
    await db.moveClient(p.id, 'prospectos', 'proceso_comenzado', {
      username: 'Otro Admin',
      role: 'admin',
    });
    expect(avisosAdmin(TIPOS.PROCESO_NUEVO)).toHaveLength(0);
  });

  it('agendar una cita avisa a cada admin con la fecha', async () => {
    const fechaCita = new Date(2026, 9, 2, 11, 30).getTime();
    const cita = await db.createCita(
      { clientName: 'Pedro Gil', phone: '8440000000', fechaCita, hasTime: true },
      VEND,
    );

    const avisos = avisosAdmin(TIPOS.CITA_NUEVA);
    expect(avisos).toHaveLength(1);
    expect(avisos[0].citaId).toBe(cita.id);
    expect(avisos[0].mensaje).toContain(`${VENDEDOR} agendó una cita con Pedro Gil para el`);
  });

  it('una cita del admin o de un promotor no avisa', async () => {
    const fechaCita = at(2026, 10, 2);
    await db.createCita({ clientName: 'X', phone: '1', fechaCita }, { username: ADMIN_SEMILLA, role: 'admin' });
    await db.createCita({ clientName: 'Y', phone: '2', fechaCita }, { username: 'Pro', role: 'promotor' });
    expect(avisosAdmin(TIPOS.CITA_NUEVA)).toHaveLength(0);
  });
});

describe('guardarPeriodosVenta', () => {
  it('reacomoda las ventas ya facturadas al mes de venta que les toca y renumera las rachas', async () => {
    // Con la regla por día (1), el 28 y el 29 de sept son de septiembre.
    const a = await sembrarCliente({ firstName: 'A' });
    const b = await sembrarCliente({ firstName: 'B' });
    const c = await sembrarCliente({ firstName: 'C' });
    await db.registrarFacturacion(a.id, facturacion(at(2026, 9, 10)), ADMIN);
    await db.registrarFacturacion(b.id, facturacion(at(2026, 9, 28)), ADMIN);
    await db.registrarFacturacion(c.id, facturacion(at(2026, 10, 2)), ADMIN);
    expect(comisionesDe(b.id)[0]).toMatchObject({ mesVenta: '2026-09', numeroVenta: 2 });
    expect(comisionesDe(c.id)[0]).toMatchObject({ mesVenta: '2026-10', numeroVenta: 1 });

    // Octubre arranca el 26 de septiembre: B se pasa a octubre, antes que C.
    const movidas = await db.guardarPeriodosVenta([
      { id: 'oct', clave: '2026-10', inicio: at(2026, 9, 26), fin: at(2026, 10, 25) },
    ]);

    expect(movidas).toBe(1);
    expect(comisionesDe(a.id)[0]).toMatchObject({ mesVenta: '2026-09', numeroVenta: 1 });
    expect(comisionesDe(b.id)[0]).toMatchObject({ mesVenta: '2026-10', numeroVenta: 1 });
    const comC = comisionesDe(c.id)[0];
    expect(comC).toMatchObject({ mesVenta: '2026-10', numeroVenta: 2 });
    const esperado = calcularComision({
      montoFinanciado: comC.montoFinanciado,
      esquemaId: comC.esquemaId,
      numeroVenta: 2,
      tienePromotor: false,
    });
    expect(comC.comisionVendedor).toBeCloseTo(esperado.comisionVendedor, 6);
    expect(store.getConfig().periodosVenta).toHaveLength(1);
  });

  it('registrar un mes a futuro no toca ninguna comisión', async () => {
    const a = await sembrarCliente();
    await db.registrarFacturacion(a.id, facturacion(at(2026, 9, 10)), ADMIN);
    const antes = comisionesDe(a.id)[0];

    const movidas = await db.guardarPeriodosVenta([
      { id: 'nov', clave: '2026-11', inicio: at(2026, 10, 26), fin: at(2026, 11, 25) },
    ]);

    expect(movidas).toBe(0);
    expect(comisionesDe(a.id)[0]).toEqual(antes);
  });

  it('una facturación nueva dentro del rango cae en su mes de venta', async () => {
    await db.guardarPeriodosVenta([
      { id: 'oct', clave: '2026-10', inicio: at(2026, 9, 26), fin: at(2026, 10, 25) },
    ]);
    const a = await sembrarCliente();
    const com = await db.registrarFacturacion(a.id, facturacion(at(2026, 9, 29)), ADMIN);
    expect(com.mesVenta).toBe('2026-10');
  });
});

describe('cambiarDisponibilidad', () => {
  it('guarda el estado de la moto con quién y cuándo lo cambió', async () => {
    await db.cambiarDisponibilidad('DNM 2.5', 'bajo_pedido', ADMIN);
    const r = store.getDisponibilidad()['DNM 2.5'];
    expect(r.estado).toBe('bajo_pedido');
    expect(r.updatedBy).toBe(ADMIN.username);
    expect(typeof r.updatedAt).toBe('number');

    await db.cambiarDisponibilidad('DNM 2.5', 'no_disponible', ADMIN);
    expect(store.getDisponibilidad()['DNM 2.5'].estado).toBe('no_disponible');
  });

  it('rechaza una moto fuera del catálogo o un estado inválido', async () => {
    await expect(db.cambiarDisponibilidad('MOTO FANTASMA', 'disponible', ADMIN)).rejects.toThrow(
      /no está en el catálogo/,
    );
    await expect(db.cambiarDisponibilidad('U2', 'agotada', ADMIN)).rejects.toThrow(/inválido/);
    expect(store.getDisponibilidad()).toEqual({});
  });

  it('viaja en el respaldo y se restaura', async () => {
    await db.cambiarDisponibilidad('U2', 'no_disponible', ADMIN);
    const respaldo = await db.exportAll('vendedor');
    expect(respaldo.disponibilidad.U2.estado).toBe('no_disponible');

    vi.resetModules();
    vi.stubGlobal('localStorage', localStorageDeMentira());
    db = await import('./db.js');
    ({ store } = await import('./store/index.js'));
    await store.init();
    await db.importAll(respaldo);
    expect(store.getDisponibilidad().U2.estado).toBe('no_disponible');
  });
});
