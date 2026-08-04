// Demo store: same interface as the Firestore store, backed by localStorage in
// this browser only. Used with VITE_DEMO=1 to try Marga 1.5 without a Firebase
// project. Data is NOT shared across devices in this mode.

import { SEED_USERS } from '../constants.js';
import { hashPassword } from '../auth.js';

const STORAGE_KEY = 'marga15_demo_db';

export function createMemoryStore() {
  let clients = [];
  let users = [];
  let citas = [];
  const clientListeners = new Set();
  const userListeners = new Set();
  const citaListeners = new Set();

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        clients = Array.isArray(parsed.clients) ? parsed.clients : [];
        users = Array.isArray(parsed.users) ? parsed.users : [];
        citas = Array.isArray(parsed.citas) ? parsed.citas : [];
      }
    } catch {
      /* corrupted storage — start clean */
    }
  }

  function persist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ clients, users, citas }));
    } catch {
      /* storage full/unavailable — keep working in memory */
    }
  }

  const notifyClients = () => {
    persist();
    for (const cb of clientListeners) cb(clients);
  };
  const notifyUsers = () => {
    persist();
    for (const cb of userListeners) cb(users);
  };
  const notifyCitas = () => {
    persist();
    for (const cb of citaListeners) cb(citas);
  };

  async function init() {
    load();
    if (users.length === 0) {
      users = await Promise.all(
        SEED_USERS.map(async (seed) => ({
          id: seed.id,
          username: seed.username,
          role: seed.role,
          color: seed.color ?? '',
          passwordHash: await hashPassword(seed.password),
          createdAt: Date.now(),
        })),
      );
      persist();
    }
  }

  return {
    kind: 'demo',
    init,

    // --- clients ---
    getClients: () => clients,
    onClientsChange(cb) {
      clientListeners.add(cb);
      cb(clients);
      return () => clientListeners.delete(cb);
    },
    async setClient(record) {
      clients = [...clients.filter((c) => c.id !== record.id), record];
      notifyClients();
    },
    async patchClient(id, patch) {
      clients = clients.map((c) => (c.id === id ? { ...c, ...patch } : c));
      notifyClients();
    },
    async patchClients(patches) {
      const byId = new Map(patches.map((p) => [p.id, p.patch]));
      clients = clients.map((c) => (byId.has(c.id) ? { ...c, ...byId.get(c.id) } : c));
      notifyClients();
    },
    async deleteClient(id) {
      clients = clients.filter((c) => c.id !== id);
      notifyClients();
    },
    async bulkSetClients(records) {
      const incoming = new Map(records.map((r) => [r.id, r]));
      clients = [
        ...clients.map((c) => (incoming.has(c.id) ? incoming.get(c.id) : c)),
        ...records.filter((r) => !clients.some((c) => c.id === r.id)),
      ];
      notifyClients();
    },
    async clearClients() {
      clients = [];
      notifyClients();
    },

    // --- users ---
    getUsers: () => users,
    onUsersChange(cb) {
      userListeners.add(cb);
      cb(users);
      return () => userListeners.delete(cb);
    },
    async getUserByUsername(username) {
      const needle = String(username).trim().toLowerCase();
      return users.find((u) => u.username.toLowerCase() === needle) ?? null;
    },
    async setUser(record) {
      users = [...users.filter((u) => u.id !== record.id), record];
      notifyUsers();
    },
    async patchUser(id, patch) {
      users = users.map((u) => (u.id === id ? { ...u, ...patch } : u));
      notifyUsers();
    },
    async deleteUser(id) {
      users = users.filter((u) => u.id !== id);
      notifyUsers();
    },

    // --- citas ---
    getCitas: () => citas,
    onCitasChange(cb) {
      citaListeners.add(cb);
      cb(citas);
      return () => citaListeners.delete(cb);
    },
    async setCita(record) {
      citas = [...citas.filter((c) => c.id !== record.id), record];
      notifyCitas();
    },
    async patchCita(id, patch) {
      citas = citas.map((c) => (c.id === id ? { ...c, ...patch } : c));
      notifyCitas();
    },
    async deleteCita(id) {
      citas = citas.filter((c) => c.id !== id);
      notifyCitas();
    },
    async bulkSetCitas(records) {
      const incoming = new Map(records.map((r) => [r.id, r]));
      citas = [
        ...citas.map((c) => (incoming.has(c.id) ? incoming.get(c.id) : c)),
        ...records.filter((r) => !citas.some((c) => c.id === r.id)),
      ];
      notifyCitas();
    },
  };
}
