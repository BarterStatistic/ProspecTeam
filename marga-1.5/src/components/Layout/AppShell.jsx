import { useCallback, useEffect, useMemo, useState } from 'react';
import { UIProvider } from '../../context/UIContext.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { canViewSection } from '../../lib/permissions.js';
import { emptyClient } from '../../lib/clients.js';
import Sidebar from './Sidebar.jsx';
import TopBar from './TopBar.jsx';
import ProspectosView from '../../views/ProspectosView.jsx';
import ProcesosView from '../../views/ProcesosView.jsx';
import VentasView from '../../views/VentasView.jsx';
import CanceladosView from '../../views/CanceladosView.jsx';
import CitasView from '../../views/CitasView.jsx';
import UsuariosView from '../../views/UsuariosView.jsx';
import AdminPanelView from '../../views/AdminPanelView.jsx';
import ClientFormModal from '../forms/ClientFormModal.jsx';
import CancelModal from '../forms/CancelModal.jsx';
import ProfileModal from '../forms/ProfileModal.jsx';
import GlobalSearch from '../Search/GlobalSearch.jsx';

const VIEWS = {
  prospectos: ProspectosView,
  procesos: ProcesosView,
  ventas: VentasView,
  cancelados: CanceladosView,
  citas: CitasView,
  usuarios: UsuariosView,
  admin: AdminPanelView,
};

export default function AppShell() {
  const { role } = useAuth();
  const [active, setActive] = useState('prospectos');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [form, setForm] = useState({ open: false, initial: null });
  const [cancelTarget, setCancelTarget] = useState(null);
  const [profileOpen, setProfileOpen] = useState(false);

  // If the role loses access to the current view (e.g. after a role change),
  // fall back to the board everyone can see.
  useEffect(() => {
    if (!canViewSection(role, active)) setActive('prospectos');
  }, [role, active]);

  const goToSection = useCallback(
    (section) => {
      if (!canViewSection(role, section)) return;
      setActive(section);
      setSidebarOpen(false);
    },
    [role],
  );

  const ui = useMemo(
    () => ({
      active,
      goToSection,
      openAddClient: (section) => setForm({ open: true, initial: emptyClient(section) }),
      openEditClient: (client) => setForm({ open: true, initial: client }),
      openCancelClient: (client) => setCancelTarget(client),
      openSearch: () => setSearchOpen(true),
      openProfile: () => setProfileOpen(true),
    }),
    [active, goToSection],
  );

  const ActiveView = VIEWS[active] ?? ProspectosView;

  return (
    <UIProvider value={ui}>
      {/* h-screen (not min-h-screen): pins the shell to the viewport so the
          board columns scroll internally instead of stretching the whole page.
          Otherwise a column with many cards grows past the screen, pushing the
          headers and neighbouring columns out of view and making drags hard. */}
      <div className="m-app-height flex overflow-hidden">
        <Sidebar
          active={active}
          onNavigate={goToSection}
          onOpenProfile={() => {
            setProfileOpen(true);
            setSidebarOpen(false);
          }}
          open={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
        />

        <div className="flex min-w-0 flex-1 flex-col">
          <TopBar
            section={active}
            onOpenSidebar={() => setSidebarOpen(true)}
            onOpenSearch={() => setSearchOpen(true)}
          />
          <main className="min-h-0 flex-1 overflow-hidden">
            <ActiveView />
          </main>
        </div>
      </div>

      <ClientFormModal
        open={form.open}
        initial={form.initial}
        onClose={() => setForm({ open: false, initial: null })}
      />
      <CancelModal client={cancelTarget} onClose={() => setCancelTarget(null)} />
      <GlobalSearch open={searchOpen} onClose={() => setSearchOpen(false)} />
      <ProfileModal open={profileOpen} onClose={() => setProfileOpen(false)} />
    </UIProvider>
  );
}
