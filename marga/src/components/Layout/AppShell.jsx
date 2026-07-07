import { useCallback, useMemo, useState } from 'react';
import { UIProvider } from '../../context/UIContext.jsx';
import { emptyClient } from '../../lib/clients.js';
import Sidebar from './Sidebar.jsx';
import TopBar from './TopBar.jsx';
import ProspectosView from '../../views/ProspectosView.jsx';
import ProcesosView from '../../views/ProcesosView.jsx';
import VentasView from '../../views/VentasView.jsx';
import CanceladosView from '../../views/CanceladosView.jsx';
import ClientFormModal from '../forms/ClientFormModal.jsx';
import CancelModal from '../forms/CancelModal.jsx';
import GlobalSearch from '../Search/GlobalSearch.jsx';

const VIEWS = {
  prospectos: ProspectosView,
  procesos: ProcesosView,
  ventas: VentasView,
  cancelados: CanceladosView,
};

export default function AppShell() {
  const [active, setActive] = useState('prospectos');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [form, setForm] = useState({ open: false, initial: null });
  const [cancelTarget, setCancelTarget] = useState(null);

  const goToSection = useCallback((section) => {
    setActive(section);
    setSidebarOpen(false);
  }, []);

  const ui = useMemo(
    () => ({
      active,
      goToSection,
      openAddClient: (section) => setForm({ open: true, initial: emptyClient(section) }),
      openEditClient: (client) => setForm({ open: true, initial: client }),
      openCancelClient: (client) => setCancelTarget(client),
      openSearch: () => setSearchOpen(true),
    }),
    [active, goToSection],
  );

  const ActiveView = VIEWS[active];

  return (
    <UIProvider value={ui}>
      <div className="flex min-h-screen">
        <Sidebar
          active={active}
          onNavigate={goToSection}
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
    </UIProvider>
  );
}
