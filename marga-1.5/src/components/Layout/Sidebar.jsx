import { useState } from 'react';
import {
  UserPlus,
  Workflow,
  CheckCircle2,
  XCircle,
  CalendarDays,
  Users,
  BarChart3,
  LogOut,
  X,
  Wrench,
  ScanLine,
  ChevronDown,
  Wallet,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext.jsx';
import { useData } from '../../context/DataContext.jsx';
import {
  SECTIONS,
  TOOLS,
  ROLE_LABELS,
  ROLE_CHIP_CLASSES,
  userColor,
} from '../../lib/constants.js';
import {
  visibleSections,
  canManageUsers,
  canViewAdminPanel,
  canViewComisiones,
} from '../../lib/permissions.js';
import Avatar from '../ui/Avatar.jsx';

const ICONS = {
  prospectos: UserPlus,
  procesos: Workflow,
  ventas: CheckCircle2,
  cancelados: XCircle,
};

// Per-tool icon, keyed by the tool id in constants.js.
const TOOL_ICONS = {
  buro: ScanLine,
};

function NavButton({ icon: Icon, label, badge, isActive, onClick, nested = false }) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-3 rounded-xl py-2.5 pr-3 text-sm font-medium transition
        ${nested ? 'pl-8' : 'pl-3'}
        ${isActive ? 'bg-gold/15 text-gold' : 'text-ink-muted hover:bg-white/5 hover:text-ink'}`}
    >
      <Icon size={18} className="shrink-0" />
      <span className="flex-1 text-left">{label}</span>
      {badge !== undefined && (
        <span className={`m-chip ${isActive ? 'bg-gold/20 text-gold' : 'bg-white/5 text-ink-faint'}`}>
          {badge}
        </span>
      )}
    </button>
  );
}

/**
 * Collapsible group of nav entries. Same visual language as NavButton so the
 * group header doesn't read as a different kind of control; the chevron is the
 * only thing that marks it as expandable.
 */
function NavGroup({ icon: Icon, label, defaultOpen, children }) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition
          ${open ? 'text-ink' : 'text-ink-muted'} hover:bg-white/5 hover:text-ink`}
      >
        <Icon size={18} className="shrink-0" />
        <span className="flex-1 text-left">{label}</span>
        <ChevronDown
          size={16}
          className={`shrink-0 text-ink-faint transition ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && <div className="mt-1 space-y-1 animate-fadeIn">{children}</div>}
    </div>
  );
}

export default function Sidebar({ active, onNavigate, onOpenProfile, open, onClose }) {
  const { user, role, logout } = useAuth();
  const { clients, citas, myProfile } = useData();

  const counts = clients.reduce((acc, c) => {
    acc[c.section] = (acc[c.section] ?? 0) + 1;
    return acc;
  }, {});

  const sections = visibleSections(role);
  const enHerramientas = TOOLS.some((t) => t.id === active);

  const content = (
    <div className="flex h-full w-64 flex-col border-r border-white/5 bg-navy-800/80 backdrop-blur-md">
      <div className="flex items-center justify-between px-5 py-5">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-gold">Marga 1.5</h1>
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
        {sections.map((id) => (
          <NavButton
            key={id}
            icon={ICONS[id]}
            label={SECTIONS[id].label}
            badge={counts[id] ?? 0}
            isActive={active === id}
            onClick={() => onNavigate(id)}
          />
        ))}

        {/* Shared agenda — visible to every role */}
        <NavButton
          icon={CalendarDays}
          label="Citas"
          badge={citas.length}
          isActive={active === 'citas'}
          onClick={() => onNavigate('citas')}
        />

        {canViewComisiones(role) && (
          <NavButton
            icon={Wallet}
            label="Comisiones"
            isActive={active === 'comisiones'}
            onClick={() => onNavigate('comisiones')}
          />
        )}

        {canManageUsers(role) && (
          <>
            <div className="mx-3 my-2 border-t border-white/5" />
            <NavButton
              icon={Users}
              label="Gestor de usuarios"
              isActive={active === 'usuarios'}
              onClick={() => onNavigate('usuarios')}
            />
          </>
        )}

        {canViewAdminPanel(role) && (
          <NavButton
            icon={BarChart3}
            label="Panel ADMIN"
            isActive={active === 'admin'}
            onClick={() => onNavigate('admin')}
          />
        )}

        {/* Tools — standalone utilities, visible to every role. Go last, after
            the admin block, so the client sections stay together up top. Opens
            by default when one of them is the active view. */}
        <div className="mx-3 my-2 border-t border-white/5" />
        <NavGroup icon={Wrench} label="Herramientas" defaultOpen={enHerramientas}>
          {TOOLS.map((tool) => (
            <NavButton
              key={tool.id}
              nested
              icon={TOOL_ICONS[tool.id] ?? Wrench}
              label={tool.label}
              isActive={active === tool.id}
              onClick={() => onNavigate(tool.id)}
            />
          ))}
        </NavGroup>
      </nav>

      <div className="border-t border-white/5 p-3">
        {/* Pressing the session block opens the profile sheet, where each user
            sets their own picture. */}
        <button
          onClick={onOpenProfile}
          aria-label={`Abrir mi perfil (${user?.username ?? ''})`}
          className="mb-2 flex w-full items-center gap-2 rounded-xl px-2 py-1.5 text-xs text-ink-faint transition hover:bg-white/5"
        >
          <Avatar
            photo={myProfile?.photo}
            name={user?.username}
            color={userColor(myProfile ?? user)}
            size={26}
            fallback="icon"
          />
          <span className="min-w-0 flex-1 truncate text-left">
            Sesión: <span className="text-ink-muted">{user?.username}</span>
          </span>
          <span
            className={`m-chip shrink-0 ${
              ROLE_CHIP_CLASSES[role] ?? ROLE_CHIP_CLASSES.vendedor
            }`}
          >
            {ROLE_LABELS[role] ?? role}
          </span>
        </button>
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
