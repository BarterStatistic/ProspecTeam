import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { store } from '../lib/store/index.js';
import { verifyPassword, firmaSesion, verificarSesion } from '../lib/auth.js';

// App-level accounts stored in the shared database (users collection) with
// hashed passwords and a role ('admin' | 'vendedor' | 'promotor'). This gates
// the UI for an internal tool; it is not hardened auth (no server-side session).
//
// The stored session is only { id, firma } (see lib/auth.js). The signed-in
// user's name and role always come from the live users record, re-checked on
// every change to the users collection.

const REMEMBER_KEY = 'marga15_remembered_user';
const SESSION_KEY = 'marga15_session';

const SESION_CERRADA =
  'Tu sesión se cerró porque tu cuenta cambió (contraseña, permisos o baja). Inicia sesión de nuevo.';

/** Session saved in this tab, or null. Sessions from older versions (no firma) are dropped. */
function leerSesion() {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    const s = raw ? JSON.parse(raw) : null;
    return s?.id && s?.firma ? { id: s.id, firma: s.firma } : null;
  } catch {
    return null;
  }
}

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  // Session survives reloads within the tab (sessionStorage) but not a restart,
  // so the login screen is shown again next time the app is opened.
  const [session, setSession] = useState(leerSesion);
  // Verified user — never read from storage, only from the users collection.
  const [user, setUser] = useState(null);
  // True while a stored session waits for the users list to be checked.
  const [verificando, setVerificando] = useState(() => session !== null);
  // Why the last session was closed by the app (shown on the login screen).
  const [aviso, setAviso] = useState('');
  // Firma esperada tras cambiar la propia contraseña (ver renovarSesionPropia).
  const firmaNuevaRef = useRef(null);
  // Leído por renovarSesionPropia, que puede quedar memorizado en otro contexto.
  const sesionIdRef = useRef(null);
  sesionIdRef.current = session?.id ?? null;

  const rememberedUser = (() => {
    try {
      return localStorage.getItem(REMEMBER_KEY) || '';
    } catch {
      return '';
    }
  })();

  useEffect(() => {
    try {
      if (session) sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
      else sessionStorage.removeItem(SESSION_KEY);
    } catch {
      /* storage unavailable — session stays in memory only */
    }
  }, [session]);

  // Re-check the session against the live users collection on every change.
  useEffect(() => {
    if (!session) {
      setUser(null);
      setVerificando(false);
      return undefined;
    }
    let vigente = true;
    let turno = 0;
    const unsubscribe = store.onUsersChange(async (list) => {
      const mio = ++turno;
      let resultado = await verificarSesion(session, list);
      // Own password just changed: accept the new signature instead of
      // logging out the person who made the change.
      if (resultado === null && firmaNuevaRef.current) {
        const renovada = { id: session.id, firma: firmaNuevaRef.current };
        if (await verificarSesion(renovada, list)) {
          if (!vigente || mio !== turno) return;
          firmaNuevaRef.current = null;
          setSession(renovada);
          return;
        }
      }
      if (!vigente || mio !== turno || resultado === undefined) return;
      if (resultado === null) {
        setAviso(SESION_CERRADA);
        setSession(null);
        return;
      }
      setUser((prev) =>
        prev &&
        prev.id === resultado.id &&
        prev.username === resultado.username &&
        prev.role === resultado.role
          ? prev
          : resultado,
      );
      setVerificando(false);
    });
    return () => {
      vigente = false;
      unsubscribe();
    };
  }, [session]);

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
    const firma = await firmaSesion(record);
    setAviso('');
    setUser({ id: record.id, username: record.username, role: record.role });
    setVerificando(false);
    setSession({ id: record.id, firma });
    return { ok: true };
  }

  function logout() {
    setAviso('');
    setSession(null);
  }

  /**
   * Llamar ANTES de guardar una contraseña nueva. Si la cuenta es la de esta
   * sesión, la sesión se renueva con la firma nueva en lugar de cerrarse.
   */
  async function renovarSesionPropia({ id, passwordHash }) {
    if (!id || sesionIdRef.current !== id) return;
    firmaNuevaRef.current = await firmaSesion({ id, passwordHash });
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        role: user?.role ?? null,
        verificando,
        aviso,
        rememberedUser,
        login,
        logout,
        renovarSesionPropia,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de <AuthProvider>');
  return ctx;
}
