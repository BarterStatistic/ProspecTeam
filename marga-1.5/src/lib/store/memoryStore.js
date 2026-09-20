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
  let buroAutorizaciones = [];
  let comisiones = [];
  let cotizaciones = [];
  let notificaciones = [];
  let config = {};
  const clientListeners = new Set();
  const userListeners = new Set();
  const citaListeners = new Set();
  const buroAutorizacionListeners = new Set();
  const comisionListeners = new Set();
  const cotizacionListeners = new Set();
  const notificacionListeners = new Set();
  const configListeners = new Set();

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        clients = Array.isArray(parsed.clients) ? parsed.clients : [];
        users = Array.isArray(parsed.users) ? parsed.users : [];
        citas = Array.isArray(parsed.citas) ? parsed.citas : [];
        buroAutorizaciones = Array.isArray(parsed.buroAutorizaciones)
          ? parsed.buroAutorizaciones
          : [];
        comisiones = Array.isArray(parsed.comisiones) ? parsed.comisiones : [];
        cotizaciones = Array.isArray(parsed.cotizaciones) ? parsed.cotizaciones : [];
        notificaciones = Array.isArray(parsed.notificaciones) ? parsed.notificaciones : [];
        config = parsed.config && typeof parsed.config === 'object' ? parsed.config : {};
      }
    } catch {
      /* corrupted storage — start clean */
    }
  }

  function persist() {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          clients,
          users,
          citas,
          buroAutorizaciones,
          comisiones,
          cotizaciones,
          notificaciones,
          config,
        }),
      );
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
  const notifyBuroAutorizaciones = () => {
    persist();
    for (const cb of buroAutorizacionListeners) cb(buroAutorizaciones);
  };
  const notifyComisiones = () => {
    persist();
    for (const cb of comisionListeners) cb(comisiones);
  };
  const notifyCotizaciones = () => {
    persist();
    for (const cb of cotizacionListeners) cb(cotizaciones);
  };
  const notifyNotificaciones = () => {
    persist();
    for (const cb of notificacionListeners) cb(notificaciones);
  };
  const notifyConfig = () => {
    persist();
    for (const cb of configListeners) cb(config);
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
          photo: '',
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

    // --- buroAutorizaciones (log de solo-apéndice, sin patch/delete) ---
    getBuroAutorizaciones: () => buroAutorizaciones,
    onBuroAutorizacionesChange(cb) {
      buroAutorizacionListeners.add(cb);
      cb(buroAutorizaciones);
      return () => buroAutorizacionListeners.delete(cb);
    },
    async setBuroAutorizacion(record) {
      buroAutorizaciones = [
        ...buroAutorizaciones.filter((a) => a.id !== record.id),
        record,
      ];
      notifyBuroAutorizaciones();
    },

    // --- comisiones ---
    getComisiones: () => comisiones,
    onComisionesChange(cb) {
      comisionListeners.add(cb);
      cb(comisiones);
      return () => comisionListeners.delete(cb);
    },
    async setComision(record) {
      comisiones = [...comisiones.filter((c) => c.id !== record.id), record];
      notifyComisiones();
    },
    async patchComision(id, patch) {
      comisiones = comisiones.map((c) => (c.id === id ? { ...c, ...patch } : c));
      notifyComisiones();
    },
    async deleteComision(id) {
      comisiones = comisiones.filter((c) => c.id !== id);
      notifyComisiones();
    },
    async patchComisiones(patches) {
      const byId = new Map(patches.map((p) => [p.id, p.patch]));
      comisiones = comisiones.map((c) => (byId.has(c.id) ? { ...c, ...byId.get(c.id) } : c));
      notifyComisiones();
    },

    // --- cotizaciones (log de solo-apéndice) ---
    getCotizaciones: () => cotizaciones,
    onCotizacionesChange(cb) {
      cotizacionListeners.add(cb);
      cb(cotizaciones);
      return () => cotizacionListeners.delete(cb);
    },
    async setCotizacion(record) {
      cotizaciones = [...cotizaciones.filter((c) => c.id !== record.id), record];
      notifyCotizaciones();
    },

    // --- notificaciones ---
    getNotificaciones: () => notificaciones,
    onNotificacionesChange(cb) {
      notificacionListeners.add(cb);
      cb(notificaciones);
      return () => notificacionListeners.delete(cb);
    },
    async setNotificacion(record) {
      notificaciones = [...notificaciones.filter((n) => n.id !== record.id), record];
      notifyNotificaciones();
    },
    async patchNotificaciones(patches) {
      if (!patches.length) return;
      const byId = new Map(patches.map((p) => [p.id, p.patch]));
      notificaciones = notificaciones.map((n) =>
        byId.has(n.id) ? { ...n, ...byId.get(n.id) } : n,
      );
      notifyNotificaciones();
    },
    async deleteNotificaciones(ids) {
      if (!ids.length) return;
      const idSet = new Set(ids);
      notificaciones = notificaciones.filter((n) => !idSet.has(n.id));
      notifyNotificaciones();
    },

    // --- config (documento único config/comisiones) ---
    getConfig: () => config,
    onConfigChange(cb) {
      configListeners.add(cb);
      cb(config);
      return () => configListeners.delete(cb);
    },
    async setConfig(patch) {
      config = { ...config, ...patch };
      notifyConfig();
    },
  };
}
