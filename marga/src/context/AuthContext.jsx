import { createContext, useContext, useEffect, useState } from 'react';

// Single seeded account. This is a front-end-only gate for an internal,
// single-user tool — it is NOT real security (no backend to verify against).
const ACCOUNT = { username: 'Braulio Acosta', password: 'xbox2015' };

const REMEMBER_KEY = 'marga_remembered_user';
const SESSION_KEY = 'marga_session';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  // Session survives reloads within the tab (sessionStorage) but not a restart,
  // so the login screen is shown again next time the app is opened.
  const [user, setUser] = useState(() => {
    try {
      return sessionStorage.getItem(SESSION_KEY) || null;
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
      if (user) sessionStorage.setItem(SESSION_KEY, user);
      else sessionStorage.removeItem(SESSION_KEY);
    } catch {
      /* storage unavailable — session stays in memory only */
    }
  }, [user]);

  /** Returns { ok: true } or { ok: false, error }. */
  function login({ username, password, remember }) {
    const u = (username ?? '').trim();
    const valid = u.toLowerCase() === ACCOUNT.username.toLowerCase() && password === ACCOUNT.password;
    if (!valid) {
      return { ok: false, error: 'Usuario o contraseña incorrectos.' };
    }
    try {
      if (remember) localStorage.setItem(REMEMBER_KEY, ACCOUNT.username);
      else localStorage.removeItem(REMEMBER_KEY);
    } catch {
      /* ignore storage errors */
    }
    setUser(ACCOUNT.username);
    return { ok: true };
  }

  function logout() {
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, rememberedUser, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de <AuthProvider>');
  return ctx;
}
