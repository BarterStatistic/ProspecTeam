import { useEffect, useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext.jsx';
import { DataProvider } from './context/DataContext.jsx';
import { storeMode, initStore } from './lib/store/index.js';
import AnimatedBackground from './components/AnimatedBackground.jsx';
import Login from './components/Login.jsx';
import AppShell from './components/Layout/AppShell.jsx';
import SetupScreen from './components/SetupScreen.jsx';

function Gate() {
  const { user } = useAuth();
  if (!user) return <Login />;
  return (
    <DataProvider>
      <AppShell />
    </DataProvider>
  );
}

export default function App() {
  const [ready, setReady] = useState(false);
  const [initError, setInitError] = useState('');

  useEffect(() => {
    if (storeMode === 'unconfigured') return;
    initStore()
      .then(() => setReady(true))
      .catch((err) => setInitError(err?.message || 'No se pudo conectar con la base de datos.'));
  }, []);

  if (storeMode === 'unconfigured') {
    return (
      <>
        <AnimatedBackground />
        <SetupScreen />
      </>
    );
  }

  return (
    <AuthProvider>
      <AnimatedBackground />
      {initError ? (
        <div className="flex min-h-screen items-center justify-center px-4">
          <p className="m-glass max-w-md rounded-2xl p-6 text-center text-sm text-state-danger">
            {initError}
          </p>
        </div>
      ) : !ready ? (
        <div className="flex min-h-screen items-center justify-center">
          <p className="animate-pulse text-sm text-ink-muted">Conectando con la base de datos…</p>
        </div>
      ) : (
        <Gate />
      )}
    </AuthProvider>
  );
}
