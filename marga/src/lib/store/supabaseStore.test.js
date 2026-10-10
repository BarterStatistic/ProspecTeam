import { describe, it, expect, vi, beforeEach } from 'vitest';

// Cliente de Supabase de mentira: tablas en memoria, RPCs con la misma
// semántica que supabase/marga_tablas.sql y un canal que se suscribe solo.
const servidor = { tablas: {}, fallar: false, canal: null };

function tabla(nombre) {
  return (servidor.tablas[nombre] ??= new Map());
}

function respuesta(data = null) {
  return servidor.fallar ? { data: null, error: { message: 'sin red' } } : { data, error: null };
}

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from(nombre) {
      const filas = () =>
        [...tabla(nombre).entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([id, data]) => ({ id, data }));
      const consulta = {
        select: () => consulta,
        order: () => consulta,
        limit: (n) => Promise.resolve(respuesta(filas().slice(0, n))),
        range: (a, b) => Promise.resolve(respuesta(filas().slice(a, b + 1))),
        upsert(row) {
          if (!servidor.fallar) tabla(nombre).set(row.id, row.data);
          return Promise.resolve(respuesta());
        },
      };
      return consulta;
    },
    rpc(fn, args) {
      if (servidor.fallar) return Promise.resolve(respuesta());
      const t = tabla(args.t ?? '');
      if (fn === 'marga_set_many') for (const r of args.rows) t.set(r.id, r);
      if (fn === 'marga_patch_many') {
        if (args.items.some(({ id }) => !t.has(id))) {
          return Promise.resolve({ data: null, error: { message: 'No existe el documento' } });
        }
        for (const { id, patch } of args.items) t.set(id, { ...t.get(id), ...patch });
      }
      if (fn === 'marga_merge') t.set(args.doc_id, { ...(t.get(args.doc_id) ?? {}), ...args.patch });
      if (fn === 'marga_delete_many') for (const id of args.ids) t.delete(id);
      if (fn === 'marga_delete_client') {
        for (const id of args.comision_ids) tabla('marga_comisiones').delete(id);
        tabla('marga_clients').delete(args.client_id);
      }
      return Promise.resolve(respuesta());
    },
    channel() {
      const canal = {
        handlers: [],
        on(_tipo, filtro, cb) {
          canal.handlers.push({ tabla: filtro.table, cb });
          return canal;
        },
        subscribe() {
          servidor.canal = canal;
          return canal;
        },
        /** Simula un cambio hecho desde otro dispositivo. */
        emitir(nombreTabla, payload) {
          for (const h of canal.handlers) if (h.tabla === nombreTabla) h.cb({ table: nombreTabla, ...payload });
        },
      };
      return canal;
    },
    removeChannel() {},
  }),
}));

const { crearEspejo, createSupabaseStore } = await import('./supabaseStore.js');

describe('crearEspejo', () => {
  it('entrega los documentos como Firestore: { id, ...data } ordenados por id', () => {
    const e = crearEspejo();
    e.poner('b', { nombre: 'B' });
    e.poner('a', { nombre: 'A' });
    expect(e.docs()).toEqual([
      { id: 'a', nombre: 'A' },
      { id: 'b', nombre: 'B' },
    ]);
  });

  it('aplica después de la carga los eventos que llegaron durante ella', () => {
    const e = crearEspejo();
    e.empezarCarga();
    e.evento({ tipo: 'UPSERT', id: 'x', data: { v: 2 } });
    e.evento({ tipo: 'DELETE', id: 'y' });
    // La carga salió antes de esos eventos: trae x viejo y todavía trae y.
    e.terminarCarga([
      { id: 'x', data: { v: 1 } },
      { id: 'y', data: { v: 1 } },
    ]);
    expect(e.docs()).toEqual([{ id: 'x', v: 2 }]);
  });
});

describe('createSupabaseStore', () => {
  let store;

  beforeEach(async () => {
    servidor.tablas = {};
    servidor.fallar = false;
    store = createSupabaseStore({ url: 'https://x.supabase.co', key: 'k' });
    await store.init();
  });

  it('siembra los usuarios cuando la tabla está vacía', () => {
    expect(store.getUsers().length).toBeGreaterThan(0);
    expect(store.getUsers()[0].passwordHash).toBeTruthy();
  });

  it('escribe de forma optimista y notifica antes de que responda el servidor', async () => {
    const vistos = [];
    store.onClientsChange((c) => vistos.push(c.length));
    const pendiente = store.setClient({ id: 'c1', nombre: 'Ana' });
    expect(store.getClients()).toEqual([{ id: 'c1', nombre: 'Ana' }]);
    await pendiente;
    expect(tabla('marga_clients').get('c1')).toEqual({ id: 'c1', nombre: 'Ana' });
    expect(vistos).toEqual([0, 1]);
  });

  it('patch mezcla el primer nivel, como updateDoc', async () => {
    await store.setClient({ id: 'c1', nombre: 'Ana', notas: 'x' });
    await store.patchClient('c1', { etapa: 'contactado' });
    expect(store.getClients()[0]).toEqual({ id: 'c1', nombre: 'Ana', notas: 'x', etapa: 'contactado' });
  });

  it('si la escritura falla, deshace lo optimista y relanza el error', async () => {
    await store.setClient({ id: 'c1', nombre: 'Ana' });
    servidor.fallar = true;
    await expect(store.patchClient('c1', { nombre: 'Otra' })).rejects.toThrow('sin red');
    servidor.fallar = false;
    await vi.waitFor(() => expect(store.getClients()[0].nombre).toBe('Ana'));
  });

  it('borra el cliente junto con sus comisiones', async () => {
    await store.setClient({ id: 'c1', nombre: 'Ana' });
    await store.setComision({ id: 'k1', clientId: 'c1' });
    await store.setComision({ id: 'k2', clientId: 'otro' });
    await store.deleteClientConComisiones('c1', ['k1']);
    expect(store.getClients()).toEqual([]);
    expect(store.getComisiones().map((c) => c.id)).toEqual(['k2']);
    expect([...tabla('marga_comisiones').keys()]).toEqual(['k2']);
  });

  it('config y disponibilidad se mezclan sin pisarse', async () => {
    const configs = [];
    store.onConfigChange((c) => configs.push(c));
    await store.setConfig({ diaPago: 5 });
    await store.setConfig({ diaCorte: 2 });
    await store.setDisponibilidadMoto('DNM 2.5', { estado: 'bajo_pedido' });
    expect(store.getConfig()).toEqual({ diaPago: 5, diaCorte: 2 });
    expect(store.getDisponibilidad()).toEqual({ 'DNM 2.5': { estado: 'bajo_pedido' } });
    expect(configs.at(-1)).toEqual({ diaPago: 5, diaCorte: 2 });
  });

  it('el eco atrasado de un cambio propio no revierte uno más nuevo', async () => {
    vi.useFakeTimers();
    try {
      await store.setClient({ id: 'c1', etapa: 'a' });
      await store.patchClient('c1', { etapa: 'b' });
      await store.patchClient('c1', { etapa: 'c' });
      // Llegan los ecos en orden de commit, después de los dos cambios locales.
      for (const etapa of ['a', 'b', 'c']) {
        servidor.canal.emitir('marga_clients', {
          eventType: 'UPDATE',
          new: { id: 'c1', data: { id: 'c1', etapa } },
        });
        expect(store.getClients()[0].etapa).toBe('c');
      }
      await vi.advanceTimersByTimeAsync(2000);
      expect(store.getClients()[0].etapa).toBe('c');
      // Pasada la retención, otro dispositivo sí puede cambiarlo.
      servidor.canal.emitir('marga_clients', {
        eventType: 'UPDATE',
        new: { id: 'c1', data: { id: 'c1', etapa: 'd' } },
      });
      expect(store.getClients()[0].etapa).toBe('d');
    } finally {
      vi.useRealTimers();
    }
  });

  it('aplica los cambios que llegan por Realtime desde otro dispositivo', () => {
    servidor.canal.emitir('marga_citas', { eventType: 'INSERT', new: { id: 'ci1', data: { id: 'ci1', hora: '10:00' } } });
    expect(store.getCitas()).toEqual([{ id: 'ci1', hora: '10:00' }]);
    servidor.canal.emitir('marga_citas', { eventType: 'DELETE', old: { id: 'ci1' } });
    expect(store.getCitas()).toEqual([]);
  });
});
