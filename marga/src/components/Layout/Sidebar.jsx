import { UserPlus, Workflow, CheckCircle2, XCircle, LogOut, X } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.jsx';
import { useData } from '../../context/DataContext.jsx';
import { SECTION_ORDER, SECTIONS } from '../../lib/constants.js';

const ICONS = {
  prospectos: UserPlus,
  procesos: Workflow,
  ventas: CheckCircle2,
  cancelados: XCircle,
};

export default function Sidebar({ active, onNavigate, open, onClose }) {
  const { user, logout } = useAuth();
  const { clients } = useData();

  const counts = clients.reduce((acc, c) => {
    acc[c.section] = (acc[c.section] ?? 0) + 1;
    return acc;
  }, {});

  const content = (
    <div className="flex h-full w-64 flex-col border-r border-white/5 bg-navy-800/80 backdrop-blur-md">
      <div className="flex items-center justify-between px-5 py-5">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-gold">Marga</h1>
          <p className="text-[11px] text-ink-faint">Dinamo Saltillo</p>
        </div>
        <button
          onClick={onClose}
          className="rounded-lg p-1.5 text-ink-muted hover:bg-white/5 md:hidden"
          aria-label="Cerrar menú"
        >
          <X size={20} />
        </button>
      </div>

      <nav className="flex-1 space-y-1 px-3">
        {SECTION_ORDER.map((id) => {
          const Icon = ICONS[id];
          const isActive = active === id;
          return (
            <button
              key={id}
              onClick={() => onNavigate(id)}
              className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition
                ${
                  isActive
                    ? 'bg-gold/15 text-gold'
                    : 'text-ink-muted hover:bg-white/5 hover:text-ink'
                }`}
            >
              <Icon size={18} className="shrink-0" />
              <span className="flex-1 text-left">{SECTIONS[id].label}</span>
              <span
                className={`m-chip ${isActive ? 'bg-gold/20 text-gold' : 'bg-white/5 text-ink-faint'}`}
              >
                {counts[id] ?? 0}
              </span>
            </button>
          );
        })}
      </nav>

      <div className="border-t border-white/5 p-3">
        <div className="mb-2 px-2 text-xs text-ink-faint">
          Sesión: <span className="text-ink-muted">{user}</span>
        </div>
        <button
          onClick={logout}
          className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-ink-muted transition hover:bg-state-danger/10 hover:text-state-danger"
        >
          <LogOut size={18} /> Cerrar sesión
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop: static column */}
      <aside className="hidden md:block">{content}</aside>

      {/* Mobile: slide-over drawer */}
      {open && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-navy-900/70 backdrop-blur-sm" onClick={onClose} />
          <div className="absolute inset-y-0 left-0 animate-fadeIn">{content}</div>
        </div>
      )}
    </>
  );
}
