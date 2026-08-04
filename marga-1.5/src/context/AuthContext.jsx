import { createContext, useContext, useEffect, useState } from 'react';
import { store } from '../lib/store/index.js';
import { verifyPassword } from '../lib/auth.js';

// App-level accounts stored in the shared database (users collection) with
// hashed passwords and a role ('admin' | 'vendedor'). This gates the UI for an
// internal tool; it is not hardened auth (no server-side session).

const REMEMBER_KEY = 'marga15_remembered_user';
const SESSION_KEY = 'marga15_session';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  // Session survives reloads within the tab (sessionStorage) but not a restart,
  // so the login screen is shown again next time the app is opened.
  const [user, setUser] = useState(() => {
    try {
      const raw = sessionStorage.getItem(SESSION_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  });

  const rememberedUser = (() => {
    try {
      return localStorage.getItem(REMEMBER_KEY) || '';
    } catch {
      return '';
    }
  })();

  useEffect(() => {
    try {
      if (user) sessionStorage.setItem(SESSION_KEY, JSON.stringify(user));
      else sessionStorage.removeItem(SESSION_KEY);
    } catch {
      /* storage unavailable — session stays in memory only */
    }
  }, [user]);

  /** Returns { ok: true } or { ok: false, error }. */
  async function login({ username, password, remember }) {
    let record;
    try {
      record = await store.getUserByUsername(username);
    } catch {
      return { ok: false, error: 'No se pudo conectar con la base de datos. Intenta de nuevo.' };
    }
    if (!record || !(await verifyPassword(password, record.passwordHash))) {
      return { ok: false, error: 'Usuario o contraseña incorrectos.' };
    }
    try {
      if (remember) localStorage.setItem(REMEMBER_KEY, record.username);
      else localStorage.removeItem(REMEMBER_KEY);
    } catch {
      /* ignore storage errors */
    }
    setUser({ id: record.id, username: record.username, role: record.role });
    return { ok: true };
  }

  function logout() {
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, role: user?.role ?? null, rememberedUser, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de <AuthProvider>');
  return ctx;
}
