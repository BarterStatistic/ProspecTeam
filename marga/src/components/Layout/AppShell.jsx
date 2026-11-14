import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Plus } from 'lucide-react';
import { UIProvider } from '../../context/UIContext.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import {
  canAddClient,
  canUsarBartersito,
  canViewSection,
  vistaInicial,
} from '../../lib/permissions.js';
import { emptyClient } from '../../lib/clients.js';
import { VIEW_META } from '../../lib/constants.js';
import Sidebar from './Sidebar.jsx';
import TopBar from './TopBar.jsx';
import BottomBar from './BottomBar.jsx';
import ShortcutsModal from './ShortcutsModal.jsx';
import BartersitoPanel from '../bartersito/BartersitoPanel.jsx';
import { DESTINOS } from './navegacion.js';
import MiDiaView from '../../views/MiDiaView.jsx';
import ProspectosView from '../../views/ProspectosView.jsx';
import ProcesosView from '../../views/ProcesosView.jsx';
import VentasView from '../../views/VentasView.jsx';
import CanceladosView from '../../views/CanceladosView.jsx';
import CitasView from '../../views/CitasView.jsx';
import DisponibilidadView from '../../views/DisponibilidadView.jsx';
import UsuariosView from '../../views/UsuariosView.jsx';
import AdminPanelView from '../../views/AdminPanelView.jsx';
import BuroAutomaticoView from '../../views/BuroAutomaticoView.jsx';
import ComisionesView from '../../views/ComisionesView.jsx';
import CotizadorView from '../../views/CotizadorView.jsx';
import ClientFormModal from '../forms/ClientFormModal.jsx';
import CancelModal from '../forms/CancelModal.jsx';
import ProfileModal from '../forms/ProfileModal.jsx';
import FacturacionModal from '../forms/FacturacionModal.jsx';
import GlobalSearch from '../Search/GlobalSearch.jsx';

const VIEWS = {
  midia: MiDiaView,
  prospectos: ProspectosView,
  procesos: ProcesosView,
  ventas: VentasView,
  cancelados: CanceladosView,
  citas: CitasView,
  usuarios: UsuariosView,
  admin: AdminPanelView,
  comisiones: ComisionesView,
  // Tools (see TOOLS in constants.js) — keyed by tool id.
  buro: BuroAutomaticoView,
  cotizador: CotizadorView,
  disponibilidad: DisponibilidadView,
};

// Atajos de una tecla → destino (ver navegacion.js). Se usan sin Ctrl porque
// Ctrl+N y Ctrl+C son del navegador (ventana nueva y copiar).
const TECLA_A_DESTINO = Object.fromEntries(
  DESTINOS.filter((d) => d.tecla).map((d) => [d.tecla.toLowerCase(), d.id]),
);

export default function AppShell() {
  const { role } = useAuth();
  // Land on the first section this role can actually open: a promotor has no
  // access to Prospectos, so hardcoding it would leave them on a blank shell.
  const [active, setActive] = useState(() => vistaInicial(role));
  const [moreOpen, setMoreOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [bartersitoOpen, setBartersitoOpen] = useState(false);
  const [form, setForm] = useState({ open: false, initial: null });
  const [cancelTarget, setCancelTarget] = useState(null);
  const [profileOpen, setProfileOpen] = useState(false);
  // `onCancel` deja al que abrió el modal deshacer lo que lo provocó: el
  // tablero lo usa para regresar la tarjeta a su columna anterior.
  const [factura, setFactura] = useState({ cliente: null, onCancel: null });
  // Aviso breve al pie ("María → Preguntas · Deshacer").
  const [aviso, setAviso] = useState(null);
  const avisoTimer = useRef(null);

  const puedeBartersito = canUsarBartersito(role);

  // If the role loses access to the current view (e.g. after a role change),
  // fall back to the first board this role can open.
  useEffect(() => {
    if (!canViewSection(role, active)) setActive(vistaInicial(role));
  }, [role, active]);

  // Bartersito es solo del administrador: si el rol cambia, se cierra.
  useEffect(() => {
    if (!puedeBartersito) setBartersitoOpen(false);
  }, [puedeBartersito]);

  const goToSection = useCallback(
    (section) => {
      if (!canViewSection(role, section)) return;
      setActive(section);
      setMoreOpen(false);
    },
    [role],
  );

  const avisar = useCallback((texto, onUndo = null) => {
    clearTimeout(avisoTimer.current);
    setAviso({ texto, onUndo });
    avisoTimer.current = setTimeout(() => setAviso(null), 4500);
  }, []);
  useEffect(() => () => clearTimeout(avisoTimer.current), []);

  const openAddClient = useCallback(
    (section) => setForm({ open: true, initial: emptyClient(section) }),
    [],
  );

  const ui = useMemo(
    () => ({
      active,
      goToSection,
      openAddClient,
      openEditClient: (client) => setForm({ open: true, initial: client }),
      openCancelClient: (client) => setCancelTarget(client),
      openSearch: () => setSearchOpen(true),
      openProfile: () => setProfileOpen(true),
      openFacturacion: (cliente, onCancel = null) => setFactura({ cliente, onCancel }),
      // Solo abre para el administrador; para los demás no hace nada.
      openBartersito: () => puedeBartersito && setBartersitoOpen(true),
      avisar,
    }),
    [active, goToSection, openAddClient, puedeBartersito, avisar],
  );

  // Sección donde "Nuevo cliente" agrega: el tablero abierto si este rol puede
  // agregar ahí; si no, el primero donde sí pueda.
  const seccionParaAgregar = canAddClient(role, active)
    ? active
    : ['prospectos', 'procesos'].find((s) => canAddClient(role, s)) ?? null;

  // Atajos de teclado (solo computadora). Nunca mientras se escribe ni con una
  // ventana abierta, para no abrir un formulario encima de otro.
  useEffect(() => {
    function onKey(e) {
      if (window.innerWidth < 768) return;
      const k = e.key.toLowerCase();
      if ((e.ctrlKey || e.metaKey) && k === 'k') {
        e.preventDefault();
        setSearchOpen(true);
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target;
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable) return;
      if (k === 'escape') {
        setBartersitoOpen(false);
        return;
      }
      if (document.querySelector('[role="dialog"][aria-modal="true"]')) return;

      if (k === '?' || (k === '/' && e.shiftKey)) setShortcutsOpen(true);
      else if (k === '/') setSearchOpen(true);
      else if (k === 'n' && seccionParaAgregar) openAddClient(seccionParaAgregar);
      else if (k === 'b' && puedeBartersito) setBartersitoOpen((v) => !v);
      else if (TECLA_A_DESTINO[k] && canViewSection(role, TECLA_A_DESTINO[k]))
        goToSection(TECLA_A_DESTINO[k]);
      else return;
      e.preventDefault();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [role, seccionParaAgregar, puedeBartersito, goToSection, openAddClient]);

  const ActiveView = VIEWS[active] ?? ProspectosView;
  const esTablero = VIEW_META[active]?.type === 'board';
  const mostrarFab = esTablero && canAddClient(role, active);

  return (
    <UIProvider value={ui}>
      {/* h-screen (not min-h-screen): pins the shell to the viewport so the
          board columns scroll internally instead of stretching the whole page.
          Otherwise a column with many cards grows past the screen, pushing the
          headers and neighbouring columns out of view and making drags hard. */}
      <div className="m-app-height flex animate-fadeIn overflow-hidden">
        <Sidebar
          active={active}
          onNavigate={goToSection}
          onOpenProfile={() => setProfileOpen(true)}
          onOpenShortcuts={() => setShortcutsOpen(true)}
        />

        <div className="flex min-w-0 flex-1 flex-col">
          <TopBar section={active} onOpenSearch={() => setSearchOpen(true)} />
          <main className="relative min-h-0 flex-1 overflow-hidden">
            <ActiveView />
            {/* Celular: agregar cliente al alcance del pulgar. */}
            {mostrarFab && (
              <button
                onClick={() => openAddClient(active)}
                aria-label="Agregar cliente"
                className="absolute bottom-4 right-4 z-20 grid h-14 w-14 place-items-center rounded-[18px] bg-gold text-navy-900 shadow-[0_8px_20px_-6px_rgba(255,209,26,0.5)] transition active:scale-95 md:hidden"
              >
                <Plus size={26} />
              </button>
            )}
          </main>
          <BottomBar
            active={active}
            onNavigate={goToSection}
            moreOpen={moreOpen}
            onToggleMore={() => setMoreOpen((v) => !v)}
            onOpenProfile={() => {
              setMoreOpen(false);
              setProfileOpen(true);
            }}
            onOpenBartersito={() => {
              setMoreOpen(false);
              setBartersitoOpen(true);
            }}
          />
        </div>
      </div>

      {aviso && (
        <div
          role="status"
          className="fixed bottom-24 left-1/2 z-[60] flex max-w-[94vw] -translate-x-1/2 animate-fadeIn items-center gap-3 whitespace-nowrap rounded-xl bg-ink px-3.5 py-2.5 text-sm font-medium text-navy-900 shadow-card md:bottom-6"
        >
          <span className="truncate">{aviso.texto}</span>
          {aviso.onUndo && (
            <button
              onClick={() => {
                aviso.onUndo();
                setAviso(null);
              }}
              className="font-bold underline"
            >
              Deshacer
            </button>
          )}
        </div>
      )}

      {/* El panel no se monta siquiera para vendedores o promotores. */}
      {puedeBartersito && (
        <BartersitoPanel open={bartersitoOpen} onClose={() => setBartersitoOpen(false)} />
      )}

      <ClientFormModal
        open={form.open}
        initial={form.initial}
        onClose={() => setForm({ open: false, initial: null })}
      />
      <CancelModal client={cancelTarget} onClose={() => setCancelTarget(null)} />
      <GlobalSearch open={searchOpen} onClose={() => setSearchOpen(false)} />
      <ProfileModal open={profileOpen} onClose={() => setProfileOpen(false)} />
      <ShortcutsModal open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
      <FacturacionModal
        cliente={factura.cliente}
        onClose={(guardado) => {
          if (!guardado) factura.onCancel?.();
          setFactura({ cliente: null, onCancel: null });
        }}
      />
    </UIProvider>
  );
}
