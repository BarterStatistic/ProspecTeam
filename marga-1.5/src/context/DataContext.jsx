import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { store } from '../lib/store/index.js';
import { useAuth } from './AuthContext.jsx';
import { canManageUsers } from '../lib/permissions.js';
import { hashPassword } from '../lib/auth.js';
import {
  createClient as dbCreateClient,
  updateClient,
  deleteClient,
  moveClient,
  applyBoardReorder,
  cancelClient,
  createCita as dbCreateCita,
  updateCita,
  deleteCita,
  exportAll,
  importAll,
} from '../lib/db.js';

const DataContext = createContext(null);

const uuid = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;

export function DataProvider({ children }) {
  const { user } = useAuth();
  const [clients, setClients] = useState(() => store.getClients());
  const [users, setUsers] = useState(() => store.getUsers());
  const [citas, setCitas] = useState(() => store.getCitas());

  // Live mirror of the shared database: any write (from this device or any
  // other) re-renders through these subscriptions.
  useEffect(() => store.onClientsChange(setClients), []);
  useEffect(() => store.onCitasChange(setCitas), []);

  // Every role subscribes to the users collection, because the per-vendedor
  // accent colour lives there and tints cards for everyone. Only admins get the
  // full records (they carry password hashes) — see `users` in the value below.
  useEffect(() => store.onUsersChange(setUsers), []);
  const admin = canManageUsers(user?.role);

  // username → colour, rebuilt on every users change so a colour edit shows up
  // instantly on every device.
  const sellerColors = useMemo(() => {
    const map = {};
    for (const u of users) if (u.username && u.color) map[u.username] = u.color;
    return map;
  }, [users]);

  const teamUsernames = useMemo(() => users.map((u) => u.username).filter(Boolean), [users]);

  const value = useMemo(
    () => ({
      clients,
      loading: false,
      createClient: (values) => dbCreateClient(values, user),
      updateClient,
      deleteClient,
      moveClient,
      applyBoardReorder,
      cancelClient,
      exportAll,
      importAll,

      // --- citas (shared agenda, both roles) ---
      citas,
      createCita: (values) => dbCreateCita(values, user),
      updateCita,
      deleteCita,

      // --- seller colours (readable by every role) ---
      sellerColors,
      // Names of everyone who can register clients, for the Panel ADMIN filter.
      teamUsernames,

      // --- user management (UI restricted to admins) ---
      users: admin ? users : [],
      async addUser({ username, password, role, color }) {
        const name = username.trim();
        const existing = await store.getUserByUsername(name);
        if (existing) throw new Error('Ya existe un usuario con ese nombre.');
        await store.setUser({
          id: uuid(),
          username: name,
          role,
          color: color || '',
          passwordHash: await hashPassword(password),
          createdAt: Date.now(),
        });
      },
      async editUser(id, { username, password, role, color }) {
        const name = username.trim();
        const existing = await store.getUserByUsername(name);
        if (existing && existing.id !== id) throw new Error('Ya existe un usuario con ese nombre.');
        const patch = { username: name, role, color: color || '' };
        if (password) patch.passwordHash = await hashPassword(password);
        await store.patchUser(id, patch);
      },
      deleteUser: (id) => store.deleteUser(id),
    }),
    [clients, users, citas, admin, user, sellerColors, teamUsernames],
  );

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useData() {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useData debe usarse dentro de <DataProvider>');
  return ctx;
}
