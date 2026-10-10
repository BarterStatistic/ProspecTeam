// Store sobre Supabase: misma interfaz que firestoreStore.js, sobre las tablas
// `marga_*` del proyecto de Supabase de Dinamo (ver supabase/marga_tablas.sql).
//
// Cada tabla guarda documentos (`id`, `data` jsonb), igual que una colección de
// Firestore. Se mantiene un espejo en memoria por tabla para que las lecturas
// sean síncronas, y se actualiza por dos vías:
//   - Realtime (postgres_changes): lo que escriben los demás dispositivos.
//   - Escritura optimista: lo que escribe este dispositivo se aplica al espejo
//     antes de mandarlo, como hace Firestore con su caché local. Así un drag en
//     el tablero no rebota mientras responde el servidor. Si la escritura
//     falla, se recarga la tabla para volver a la verdad y se relanza el error.

import { createClient } from '@supabase/supabase-js';
import { SEED_USERS } from '../constants.js';
import { hashPassword } from '../auth.js';

const TABLAS = {
  clients: 'marga_clients',
  users: 'marga_users',
  citas: 'marga_citas',
  buroAutorizaciones: 'marga_buro_autorizaciones',
  comisiones: 'marga_comisiones',
  cotizaciones: 'marga_cotizaciones',
  notificaciones: 'marga_notificaciones',
  config: 'marga_config',
};

/** PostgREST corta cada respuesta en 1000 filas; se pide por páginas. */
const PAGINA = 1000;

/**
 * Espejo de una tabla. `docs()` devuelve los documentos como los entregaba
 * Firestore: `{ id, ...data }`, ordenados por id.
 */
export function crearEspejo() {
  let filas = new Map(); // id → data
  let cache = null;
  let cargando = false;
  let pendientes = [];

  function aplicar(evento) {
    if (evento.tipo === 'DELETE') filas.delete(evento.id);
    else filas.set(evento.id, evento.data);
    cache = null;
  }

  return {
    docs() {
      if (!cache) {
        cache = [...filas.entries()]
          .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
          .map(([id, data]) => ({ id, ...data }));
      }
      return cache;
    },
    get(id) {
      return filas.get(id);
    },
    /** Mientras se recarga, los eventos de Realtime esperan a que llegue la carga. */
    empezarCarga() {
      cargando = true;
      pendientes = [];
    },
    /**
     * Reemplaza el contenido con la carga completa y luego aplica, en orden,
     * los eventos que llegaron mientras tanto: así ninguno se pierde ni lo
     * pisa una carga que salió antes que él.
     */
    terminarCarga(rows) {
      filas = new Map(rows.map((r) => [r.id, r.data ?? {}]));
      cargando = false;
      for (const e of pendientes) aplicar(e);
      pendientes = [];
      cache = null;
    },
    cancelarCarga() {
      cargando = false;
      for (const e of pendientes) aplicar(e);
      pendientes = [];
    },
    evento(e) {
      if (cargando) pendientes.push(e);
      else aplicar(e);
    },
    /** Copia del contenido, para deshacer una escritura optimista. */
    copia() {
      return new Map(filas);
    },
    restaurar(copia) {
      filas = copia;
      cache = null;
    },
    /** Escritura local (optimista o confirmada). */
    poner(id, data) {
      aplicar({ tipo: 'UPSERT', id, data });
    },
    quitar(id) {
      aplicar({ tipo: 'DELETE', id });
    },
  };
}

export function createSupabaseStore({ url, key }) {
  const sb = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const espejos = {};
  const listeners = {};
  for (const nombre of Object.keys(TABLAS)) {
    espejos[nombre] = crearEspejo();
    listeners[nombre] = new Set();
  }

  // Los documentos únicos config/comisiones y config/disponibilidad viven en
  // la misma tabla; cada uno tiene sus propios suscriptores.
  const configListeners = new Set();
  const disponibilidadListeners = new Set();
  const getConfig = () => espejos.config.get('comisiones') ?? {};
  const getDisponibilidad = () => espejos.config.get('disponibilidad') ?? {};

  function notify(nombre) {
    if (nombre === 'config') {
      for (const cb of configListeners) cb(getConfig());
      for (const cb of disponibilidadListeners) cb(getDisponibilidad());
      return;
    }
    const docs = espejos[nombre].docs();
    for (const cb of listeners[nombre]) cb(docs);
  }

  function revisar({ error }) {
    if (error) throw new Error(`[marga] Supabase: ${error.message}`);
  }

  async function leerTabla(nombre) {
    const rows = [];
    for (let desde = 0; ; desde += PAGINA) {
      const res = await sb
        .from(TABLAS[nombre])
        .select('id, data')
        .order('id')
        .range(desde, desde + PAGINA - 1);
      revisar(res);
      rows.push(...res.data);
      if (res.data.length < PAGINA) return rows;
    }
  }

  async function recargar(nombre) {
    const espejo = espejos[nombre];
    espejo.empezarCarga();
    try {
      espejo.terminarCarga(await leerTabla(nombre));
    } catch (err) {
      espejo.cancelarCarga();
      throw err;
    }
    notify(nombre);
  }

  const recargarTodo = () => Promise.all(Object.keys(TABLAS).map(recargar));

  // Escrituras pendientes, como las de Firestore. Mientras un documento tiene
  // una escritura local en curso (y un rato después), sus eventos de Realtime
  // no se aplican: se guarda solo el último y se aplica al soltar. Sin esto, el
  // eco de un cambio anterior de este mismo dispositivo llega después del
  // siguiente y la tarjeta "regresa" un instante (p. ej. dos drags seguidos).
  // Realtime entrega en orden de commit, así que el último evento retenido es
  // el estado más reciente del servidor, sea nuestro o de otro dispositivo.
  const RETENCION_MS = 1500;
  const retenidos = new Map(); // "tabla:id" → { pendientes, timer, ultimo }

  function retener(nombre, ids) {
    for (const id of ids) {
      const llave = `${nombre}:${id}`;
      const r = retenidos.get(llave) ?? { pendientes: 0, timer: null, ultimo: null };
      r.pendientes += 1;
      clearTimeout(r.timer);
      retenidos.set(llave, r);
    }
  }

  function soltar(nombre, ids) {
    for (const id of ids) {
      const llave = `${nombre}:${id}`;
      const r = retenidos.get(llave);
      if (!r) continue;
      r.pendientes -= 1;
      if (r.pendientes > 0) continue;
      r.timer = setTimeout(() => {
        retenidos.delete(llave);
        if (r.ultimo) {
          espejos[nombre].evento(r.ultimo);
          notify(nombre);
        }
      }, RETENCION_MS);
    }
  }

  /**
   * Aplica el cambio al espejo, lo manda y, si falla, deshace lo optimista con
   * la copia previa (funciona aun sin red) y luego intenta ponerse al día con
   * el servidor. `local` recibe el espejo y lo modifica; `ids` son los
   * documentos que toca.
   */
  async function escribir(nombre, ids, local, remoto) {
    const espejo = espejos[nombre];
    const antes = espejo.copia();
    retener(nombre, ids);
    local(espejo);
    notify(nombre);
    try {
      revisar(await remoto());
    } catch (err) {
      espejo.restaurar(antes);
      notify(nombre);
      recargar(nombre).catch((e) => console.error('[marga] no se pudo recargar', nombre, e));
      throw err;
    } finally {
      soltar(nombre, ids);
    }
  }

  const rpc = (fn, args) => () => sb.rpc(fn, args);

  // --- operaciones genéricas por colección ---
  const set = (nombre, record) =>
    escribir(
      nombre,
      [record.id],
      (e) => e.poner(record.id, record),
      () => sb.from(TABLAS[nombre]).upsert({ id: record.id, data: record }),
    );

  const setMany = async (nombre, records) => {
    if (!records.length) return;
    await escribir(
      nombre,
      records.map((r) => r.id),
      (e) => records.forEach((r) => e.poner(r.id, r)),
      rpc('marga_set_many', { t: TABLAS[nombre], rows: records }),
    );
  };

  // Como updateDoc: mezcla el primer nivel y falla si el documento no existe
  // (todo el lote, igual que un writeBatch).
  const patchMany = async (nombre, patches) => {
    if (!patches.length) return;
    await escribir(
      nombre,
      patches.map((p) => p.id),
      (e) => {
        for (const { id, patch } of patches) {
          const actual = e.get(id);
          if (actual) e.poner(id, { ...actual, ...patch });
        }
      },
      rpc('marga_patch_many', { t: TABLAS[nombre], items: patches }),
    );
  };
  const patch = (nombre, id, p) => patchMany(nombre, [{ id, patch: p }]);

  const removeMany = async (nombre, ids) => {
    if (!ids.length) return;
    await escribir(
      nombre,
      ids,
      (e) => ids.forEach((id) => e.quitar(id)),
      rpc('marga_delete_many', { t: TABLAS[nombre], ids }),
    );
  };
  const remove = (nombre, id) => removeMany(nombre, [id]);

  // setDoc con { merge: true } sobre un documento único de config.
  const mergeConfig = (docId, p) =>
    escribir(
      'config',
      [docId],
      (e) => e.poner(docId, { ...(e.get(docId) ?? {}), ...p }),
      rpc('marga_merge', { t: TABLAS.config, doc_id: docId, patch: p }),
    );

  function suscribir(nombre, cb) {
    listeners[nombre].add(cb);
    cb(espejos[nombre].docs());
    return () => listeners[nombre].delete(cb);
  }

  async function seedUsersIfEmpty() {
    const res = await sb.from(TABLAS.users).select('id').limit(1);
    revisar(res);
    if (res.data.length) return;
    const rows = [];
    for (const seed of SEED_USERS) {
      rows.push({
        id: seed.id,
        username: seed.username,
        role: seed.role,
        color: seed.color ?? '',
        photo: '',
        passwordHash: await hashPassword(seed.password),
        createdAt: Date.now(),
      });
    }
    revisar(await sb.rpc('marga_set_many', { t: TABLAS.users, rows }));
  }

  // Un canal para todas las tablas. Si se cae (red, suspensión del celular),
  // se vuelve a abrir a los 5 s; al quedar suscrito se recarga todo, porque
  // los cambios que pasaron con el canal cerrado no llegan como eventos.
  const porTabla = Object.fromEntries(Object.entries(TABLAS).map(([k, v]) => [v, k]));

  function abrirCanal() {
    let reintentoProgramado = false;
    const canal = sb.channel('marga');
    for (const tabla of Object.values(TABLAS)) {
      canal.on('postgres_changes', { event: '*', schema: 'public', table: tabla }, (payload) => {
        const nombre = porTabla[payload.table];
        if (!nombre) return;
        const evento =
          payload.eventType === 'DELETE'
            ? { tipo: 'DELETE', id: payload.old?.id }
            : { tipo: 'UPSERT', id: payload.new.id, data: payload.new.data ?? {} };
        const retenido = retenidos.get(`${nombre}:${evento.id}`);
        if (retenido) {
          retenido.ultimo = evento;
          return;
        }
        espejos[nombre].evento(evento);
        notify(nombre);
      });
    }
    canal.subscribe((status, err) => {
      if (status === 'SUBSCRIBED') {
        recargarTodo().catch((e) => console.error('[marga] recarga tras suscribir falló', e));
      } else if (
        (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') &&
        !reintentoProgramado
      ) {
        reintentoProgramado = true;
        console.error('[marga] canal de Supabase cerrado, reintentando en 5 s…', status, err);
        sb.removeChannel(canal);
        setTimeout(abrirCanal, 5000);
      }
    });
  }

  // Una sola vez aunque se llame varias (StrictMode monta App dos veces): un
  // segundo canal con el mismo nombre es el mismo canal, ya suscrito.
  let iniciado = null;
  function init() {
    iniciado ??= (async () => {
      await seedUsersIfEmpty();
      await recargarTodo();
      abrirCanal();
    })().catch((err) => {
      iniciado = null; // que un reintento vuelva a probar
      throw err;
    });
    return iniciado;
  }

  return {
    kind: 'supabase',
    init,

    // --- clients ---
    getClients: () => espejos.clients.docs(),
    onClientsChange: (cb) => suscribir('clients', cb),
    setClient: (record) => set('clients', record),
    patchClient: (id, p) => patch('clients', id, p),
    patchClients: (patches) => patchMany('clients', patches),
    deleteClient: (id) => remove('clients', id),
    // Una sola transacción: o se borran el cliente y sus comisiones, o nada.
    async deleteClientConComisiones(id, comisionIds) {
      const comisionesAntes = espejos.comisiones.copia();
      retener('comisiones', comisionIds);
      for (const cid of comisionIds) espejos.comisiones.quitar(cid);
      notify('comisiones');
      try {
        await escribir(
          'clients',
          [id],
          (e) => e.quitar(id),
          rpc('marga_delete_client', { client_id: id, comision_ids: comisionIds }),
        );
      } catch (err) {
        espejos.comisiones.restaurar(comisionesAntes);
        notify('comisiones');
        throw err;
      } finally {
        soltar('comisiones', comisionIds);
      }
    },
    bulkSetClients: (records) => setMany('clients', records),
    async clearClients() {
      await removeMany('clients', espejos.clients.docs().map((c) => c.id));
    },

    // --- users ---
    getUsers: () => espejos.users.docs(),
    onUsersChange: (cb) => suscribir('users', cb),
    async getUserByUsername(username) {
      // Se busca en el espejo; si aún está vacío (login antes de cargar), se lee.
      const needle = String(username).trim().toLowerCase();
      let list = espejos.users.docs();
      if (list.length === 0) {
        list = (await leerTabla('users')).map((r) => ({ id: r.id, ...r.data }));
      }
      return list.find((u) => u.username.toLowerCase() === needle) ?? null;
    },
    setUser: (record) => set('users', record),
    patchUser: (id, p) => patch('users', id, p),
    deleteUser: (id) => remove('users', id),

    // --- citas ---
    getCitas: () => espejos.citas.docs(),
    onCitasChange: (cb) => suscribir('citas', cb),
    setCita: (record) => set('citas', record),
    patchCita: (id, p) => patch('citas', id, p),
    deleteCita: (id) => remove('citas', id),
    bulkSetCitas: (records) => setMany('citas', records),

    // --- buroAutorizaciones (log de solo-apéndice, sin patch/delete) ---
    getBuroAutorizaciones: () => espejos.buroAutorizaciones.docs(),
    onBuroAutorizacionesChange: (cb) => suscribir('buroAutorizaciones', cb),
    setBuroAutorizacion: (record) => set('buroAutorizaciones', record),

    // --- comisiones ---
    getComisiones: () => espejos.comisiones.docs(),
    onComisionesChange: (cb) => suscribir('comisiones', cb),
    setComision: (record) => set('comisiones', record),
    patchComision: (id, p) => patch('comisiones', id, p),
    deleteComision: (id) => remove('comisiones', id),
    patchComisiones: (patches) => patchMany('comisiones', patches),

    // --- cotizaciones (log de solo-apéndice) ---
    getCotizaciones: () => espejos.cotizaciones.docs(),
    onCotizacionesChange: (cb) => suscribir('cotizaciones', cb),
    setCotizacion: (record) => set('cotizaciones', record),

    // --- notificaciones ---
    getNotificaciones: () => espejos.notificaciones.docs(),
    onNotificacionesChange: (cb) => suscribir('notificaciones', cb),
    setNotificacion: (record) => set('notificaciones', record),
    patchNotificaciones: (patches) => patchMany('notificaciones', patches),
    deleteNotificaciones: (ids) => removeMany('notificaciones', ids),

    // --- config (documento único config/comisiones) ---
    getConfig,
    onConfigChange(cb) {
      configListeners.add(cb);
      cb(getConfig());
      return () => configListeners.delete(cb);
    },
    setConfig: (p) => mergeConfig('comisiones', p),

    // --- disponibilidad de motos (documento único config/disponibilidad) ---
    getDisponibilidad,
    onDisponibilidadChange(cb) {
      disponibilidadListeners.add(cb);
      cb(getDisponibilidad());
      return () => disponibilidadListeners.delete(cb);
    },
    // Un campo por moto; el nombre ("DNM 2.5") es una llave literal del jsonb.
    setDisponibilidadMoto: (nombre, registro) => mergeConfig('disponibilidad', { [nombre]: registro }),
  };
}
