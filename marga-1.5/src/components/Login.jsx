import { useState } from 'react';
import { LogIn, Lock, User } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import Button from './ui/Button.jsx';
import Checkbox from './ui/Checkbox.jsx';

export default function Login() {
  const { login, rememberedUser } = useAuth();
  const [username, setUsername] = useState(rememberedUser);
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(!!rememberedUser);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const res = await login({ username, password, remember });
      if (!res.ok) setError(res.error);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <form
        onSubmit={handleSubmit}
        className="m-glass w-full max-w-sm animate-fadeIn rounded-2xl p-8"
      >
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-extrabold tracking-tight">
            <span className="text-gold">Marga 2.0</span>
          </h1>
          <p className="mt-1 text-sm text-ink-muted">Organizador de clientes · Dinamo Saltillo</p>
        </div>

        <label className="m-label" htmlFor="login-user">
          Usuario
        </label>
        <div className="relative mb-4">
          <User size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint" />
          <input
            id="login-user"
            className="m-input pl-9"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Ingresa un usuario"
            autoComplete="username"
            autoFocus
          />
        </div>

        <label className="m-label" htmlFor="login-pass">
          Contraseña
        </label>
        <div className="relative mb-4">
          <Lock size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint" />
          <input
            id="login-pass"
            type="password"
            className="m-input pl-9"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Tu contraseña"
            autoComplete="current-password"
          />
        </div>

        <div className="mb-5 flex items-center justify-between">
          <Checkbox checked={remember} onChange={setRemember} label="Recordarme" />
        </div>

        {error && (
          <p className="mb-4 rounded-lg bg-state-danger/10 px-3 py-2 text-sm text-state-danger">
            {error}
          </p>
        )}

        <Button type="submit" variant="gold" size="lg" className="w-full" disabled={busy}>
          <LogIn size={18} /> {busy ? 'Verificando…' : 'Iniciar sesión'}
        </Button>
      </form>
    </div>
  );
}
