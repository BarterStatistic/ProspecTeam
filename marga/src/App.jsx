import { AuthProvider, useAuth } from './context/AuthContext.jsx';
import { DataProvider } from './context/DataContext.jsx';
import AnimatedBackground from './components/AnimatedBackground.jsx';
import Login from './components/Login.jsx';
import AppShell from './components/Layout/AppShell.jsx';

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
  return (
    <AuthProvider>
      <AnimatedBackground />
      <Gate />
    </AuthProvider>
  );
}
