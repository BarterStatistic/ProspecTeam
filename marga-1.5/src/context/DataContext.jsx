import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { store } from '../lib/store/index.js';
import { useAuth } from './AuthContext.jsx';
import { canManageUsers } from '../lib/permissions.js';
import { ROLES } from '../lib/constants.js';
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
  createBuroAutorizacion as dbCreateBuroAutorizacion,
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
  const [buroAutorizaciones, setBuroAutorizaciones] = useState(() =>
    store.getBuroAutorizaciones(),
  );

  // Live mirror of the shared database: any write (from this device or any
  // other) re-renders through these subscriptions.
  useEffect(() => store.onClientsChange(setClients), []);
  useEffect(() => store.onCitasChange(setCitas), []);
  useEffect(() => store.onBuroAutorizacionesChange(setBuroAutorizaciones), []);

  // Every role subscribes to the users collection, because the per-vendedor
  // accent colour and profile picture live there and mark cards for everyone.
  // Only admins get the full records (they carry password hashes) — see `users`
  // in the value below.
  useEffect(() => store.onUsersChange(setUsers), []);
  const admin = canManageUsers(user?.role);

  // username → colour, rebuilt on every users change so a colour edit shows up
  // instantly on every device.
  const sellerColors = useMemo(() => {
    const map = {};
    for (const u of users) if (u.username && u.color) map[u.username] = u.color;
    return map;
  }, [users]);

  // username → profile picture (data URL). Same idea as sellerColors: shared
  // with every role so avatars appear on the cards each person registered.
  const sellerAvatars = useMemo(() => {
    const map = {};
    for (const u of users) if (u.username && u.photo) map[u.username] = u.photo;
    return map;
  }, [users]);

  // Live record of the signed-in user. The session only stores id/username/role,
  // so the profile modal reads from here to reflect a freshly saved photo.
  const myProfile = useMemo(
    () => (user ? (users.find((u) => u.id === user.id) ?? null) : null),
    [users, user],
  );

  // Names offered by the Panel ADMIN "vendedor" filter. Promotores never
  // register clients (they only work the Procesos board), so including them
  // would add permanently empty columns to the comparison charts.
  const teamUsernames = useMemo(
    () => users.filter((u) => u.role !== ROLES.PROMOTOR).map((u) => u.username).filter(Boolean),
    [users],
  );

  // Names offered by the "Promotor encargado" selector, alphabetical.
  const promotorUsernames = useMemo(
    () =>
      users
        .filter((u) => u.role === ROLES.PROMOTOR && u.username)
        .map((u) => u.username)
        .sort((a, b) => a.localeCompare(b)),
    [users],
  );

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

      // --- Buró Automático: log de autorizaciones generadas ---
      buroAutorizaciones,
      registrarAutorizacionBuro: (values) => dbCreateBuroAutorizacion(values, user),

      // --- seller colours & avatars (readable by every role) ---
      sellerColors,
      sellerAvatars,
      // Names of everyone who can register clients, for the Panel ADMIN filter.
      teamUsernames,
      // Names of the promotores, for the "Promotor encargado" selector/filter.
      promotorUsernames,

      // --- own profile (any role edits only their own record) ---
      myProfile,
      /** Set or clear the signed-in user's profile picture ('' removes it). */
      updateOwnPhoto(dataUrl) {
        if (!user?.id) throw new Error('No hay una sesión activa.');
        return store.patchUser(user.id, { photo: dataUrl || '' });
      },

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
          photo: '',
          passwordHash: await hashPassword(password),
          createdAt: Date.now(),
        });
      },
      async editUser(id, { username, password, role, color }) {
        const name = username.trim();
        const existing = await store.getUserByUsername(name);
        if (existing && existing.id !== id) throw new Error('Ya existe un usuario con ese nombre.');
        // `photo` is deliberately absent: an admin editing a role or colour must
        // not wipe the picture the user set for themselves.
        const patch = { username: name, role, color: color || '' };
        if (password) patch.passwordHash = await hashPassword(password);
        await store.patchUser(id, patch);
      },
      deleteUser: (id) => store.deleteUser(id),
    }),
    [
      clients,
      users,
      citas,
      buroAutorizaciones,
      admin,
      user,
      sellerColors,
      sellerAvatars,
      myProfile,
      teamUsernames,
      promotorUsernames,
    ],
  );

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useData() {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useData debe usarse dentro de <DataProvider>');
  return ctx;
}
