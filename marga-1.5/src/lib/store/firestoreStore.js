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

  let clients = [];
  let users = [];
  let citas = [];
  const clientListeners = new Set();
  const userListeners = new Set();
  const citaListeners = new Set();

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
  };
}
