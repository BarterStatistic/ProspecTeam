// Firestore-backed store: the shared, cross-device database for Marga 1.5.
// Keeps a live in-memory mirror of both collections via onSnapshot so reads
// are synchronous and every device sees changes in real time. Local cache is
// enabled, so the app also works offline and syncs when back online.

import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  initializeFirestore,
  getFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  collection,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  getDocs,
  onSnapshot,
  writeBatch,
} from 'firebase/firestore';
import { SEED_USERS } from '../constants.js';
import { hashPassword } from '../auth.js';

export function createFirestoreStore(config) {
  // Guarded init: on a dev-server hot reload this module can re-evaluate while
  // the Firebase app/Firestore instance already exists — reuse instead of throwing.
  const app = getApps().length ? getApp() : initializeApp(config);
  let db;
  try {
    db = initializeFirestore(app, {
      localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
    });
  } catch {
    db = getFirestore(app);
  }

  const clientsCol = collection(db, 'clients');
  const usersCol = collection(db, 'users');
  const citasCol = collection(db, 'citas');
  const buroAutorizacionesCol = collection(db, 'buroAutorizaciones');
  const comisionesCol = collection(db, 'comisiones');
  const cotizacionesCol = collection(db, 'cotizaciones');
  const notificacionesCol = collection(db, 'notificaciones');
  const configCol = collection(db, 'config');
  const configDoc = doc(configCol, 'comisiones');

  let clients = [];
  let users = [];
  let citas = [];
  let buroAutorizaciones = [];
  let comisiones = [];
  let cotizaciones = [];
  let notificaciones = [];
  // Named comisionesConfig (not "config") to avoid shadowing the Firebase
  // config parameter of createFirestoreStore above.
  let comisionesConfig = {};
  const clientListeners = new Set();
  const userListeners = new Set();
  const citaListeners = new Set();
  const buroAutorizacionListeners = new Set();
  const comisionListeners = new Set();
  const cotizacionListeners = new Set();
  const notificacionListeners = new Set();
  const configListeners = new Set();

  function notify(listeners, data) {
    for (const cb of listeners) cb(data);
  }

  async function seedUsersIfEmpty() {
    const snap = await getDocs(usersCol);
    if (!snap.empty) return;
    const batch = writeBatch(db);
    for (const seed of SEED_USERS) {
      batch.set(doc(usersCol, seed.id), {
        username: seed.username,
        role: seed.role,
        color: seed.color ?? '',
        photo: '',
        passwordHash: await hashPassword(seed.password),
        createdAt: Date.now(),
      });
    }
    await batch.commit();
  }

  // onSnapshot terminates permanently if the listen stream errors; without an
  // error callback a tab would silently stop receiving remote updates. Attach
  // with an error handler that logs and re-subscribes after a short delay.
  function listen(col, onData) {
    const attach = () =>
      onSnapshot(col, onData, (err) => {
        console.error('[marga] listener de Firestore falló, reintentando en 5 s…', err);
        setTimeout(attach, 5000);
      });
    attach();
  }

  async function init() {
    await seedUsersIfEmpty();
    listen(clientsCol, (snap) => {
      clients = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      notify(clientListeners, clients);
    });
    listen(usersCol, (snap) => {
      users = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      notify(userListeners, users);
    });
    listen(citasCol, (snap) => {
      citas = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      notify(citaListeners, citas);
    });
    listen(buroAutorizacionesCol, (snap) => {
      buroAutorizaciones = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      notify(buroAutorizacionListeners, buroAutorizaciones);
    });
    listen(comisionesCol, (snap) => {
      comisiones = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      notify(comisionListeners, comisiones);
    });
    listen(cotizacionesCol, (snap) => {
      cotizaciones = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      notify(cotizacionListeners, cotizaciones);
    });
    listen(notificacionesCol, (snap) => {
      notificaciones = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      notify(notificacionListeners, notificaciones);
    });
    // El documento de configuración es único, pero pasa por el mismo `listen`
    // que las colecciones: onSnapshot acepta igual un doc que una colección, y
    // así hereda el reintento ante error. Con un onSnapshot suelto, un fallo
    // del listener congelaría las reglas de pago hasta recargar la página.
    listen(configDoc, (snap) => {
      comisionesConfig = snap.exists() ? snap.data() : {};
      notify(configListeners, comisionesConfig);
    });
  }

  return {
    kind: 'firestore',
    init,

    // --- clients ---
    getClients: () => clients,
    onClientsChange(cb) {
      clientListeners.add(cb);
      cb(clients);
      return () => clientListeners.delete(cb);
    },
    setClient: (record) => setDoc(doc(clientsCol, record.id), record),
    patchClient: (id, patch) => updateDoc(doc(clientsCol, id), patch),
    async patchClients(patches) {
      const batch = writeBatch(db);
      for (const { id, patch } of patches) batch.update(doc(clientsCol, id), patch);
      await batch.commit();
    },
    deleteClient: (id) => deleteDoc(doc(clientsCol, id)),
    async bulkSetClients(records) {
      // Firestore batches cap at 500 ops; chunk to stay safe on big backups.
      for (let i = 0; i < records.length; i += 400) {
        const batch = writeBatch(db);
        for (const r of records.slice(i, i + 400)) batch.set(doc(clientsCol, r.id), r);
        await batch.commit();
      }
    },
    async clearClients() {
      const snap = await getDocs(clientsCol);
      const docs = snap.docs;
      for (let i = 0; i < docs.length; i += 400) {
        const batch = writeBatch(db);
        for (const d of docs.slice(i, i + 400)) batch.delete(d.ref);
        await batch.commit();
      }
    },

    // --- users ---
    getUsers: () => users,
    onUsersChange(cb) {
      userListeners.add(cb);
      cb(users);
      return () => userListeners.delete(cb);
    },
    async getUserByUsername(username) {
      // Users are mirrored locally after init; tiny collection, match in memory.
      const needle = String(username).trim().toLowerCase();
      let list = users;
      if (list.length === 0) {
        const snap = await getDocs(usersCol);
        list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      }
      return list.find((u) => u.username.toLowerCase() === needle) ?? null;
    },
    setUser: (record) => setDoc(doc(usersCol, record.id), record),
    patchUser: (id, patch) => updateDoc(doc(usersCol, id), patch),
    deleteUser: (id) => deleteDoc(doc(usersCol, id)),

    // --- citas ---
    getCitas: () => citas,
    onCitasChange(cb) {
      citaListeners.add(cb);
      cb(citas);
      return () => citaListeners.delete(cb);
    },
    setCita: (record) => setDoc(doc(citasCol, record.id), record),
    patchCita: (id, patch) => updateDoc(doc(citasCol, id), patch),
    deleteCita: (id) => deleteDoc(doc(citasCol, id)),
    async bulkSetCitas(records) {
      for (let i = 0; i < records.length; i += 400) {
        const batch = writeBatch(db);
        for (const r of records.slice(i, i + 400)) batch.set(doc(citasCol, r.id), r);
        await batch.commit();
      }
    },

    // --- buroAutorizaciones (log de solo-apéndice, sin patch/delete) ---
    getBuroAutorizaciones: () => buroAutorizaciones,
    onBuroAutorizacionesChange(cb) {
      buroAutorizacionListeners.add(cb);
      cb(buroAutorizaciones);
      return () => buroAutorizacionListeners.delete(cb);
    },
    setBuroAutorizacion: (record) => setDoc(doc(buroAutorizacionesCol, record.id), record),

    // --- comisiones ---
    getComisiones: () => comisiones,
    onComisionesChange(cb) {
      comisionListeners.add(cb);
      cb(comisiones);
      return () => comisionListeners.delete(cb);
    },
    setComision: (record) => setDoc(doc(comisionesCol, record.id), record),
    patchComision: (id, patch) => updateDoc(doc(comisionesCol, id), patch),
    deleteComision: (id) => deleteDoc(doc(comisionesCol, id)),
    async patchComisiones(patches) {
      const batch = writeBatch(db);
      for (const { id, patch } of patches) batch.update(doc(comisionesCol, id), patch);
      await batch.commit();
    },

    // --- cotizaciones (log de solo-apéndice) ---
    getCotizaciones: () => cotizaciones,
    onCotizacionesChange(cb) {
      cotizacionListeners.add(cb);
      cb(cotizaciones);
      return () => cotizacionListeners.delete(cb);
    },
    setCotizacion: (record) => setDoc(doc(cotizacionesCol, record.id), record),

    // --- notificaciones ---
    getNotificaciones: () => notificaciones,
    onNotificacionesChange(cb) {
      notificacionListeners.add(cb);
      cb(notificaciones);
      return () => notificacionListeners.delete(cb);
    },
    setNotificacion: (record) => setDoc(doc(notificacionesCol, record.id), record),
    async patchNotificaciones(patches) {
      if (!patches.length) return;
      const batch = writeBatch(db);
      for (const { id, patch } of patches) batch.update(doc(notificacionesCol, id), patch);
      await batch.commit();
    },
    async deleteNotificaciones(ids) {
      if (!ids.length) return;
      const batch = writeBatch(db);
      for (const id of ids) batch.delete(doc(notificacionesCol, id));
      await batch.commit();
    },

    // --- config (documento único config/comisiones) ---
    getConfig: () => comisionesConfig,
    onConfigChange(cb) {
      configListeners.add(cb);
      cb(comisionesConfig);
      return () => configListeners.delete(cb);
    },
    setConfig: (patch) => setDoc(configDoc, patch, { merge: true }),
  };
}
