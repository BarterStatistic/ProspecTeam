import { Keyboard, LogOut } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.jsx';
import { useData } from '../../context/DataContext.jsx';
import { ROLE_LABELS, userColor } from '../../lib/constants.js';
import Avatar from '../ui/Avatar.jsx';
import { GRUPOS, destinosDe } from './navegacion.js';
import { useBadges } from './useBadges.js';

function NavButton({ icon: Icon, label, badge, destacado, isActive, onClick }) {
  return (
    <button
      onClick={onClick}
      aria-current={isActive ? 'page' : undefined}
      className={`relative flex w-full items-center gap-2.5 rounded-[10px] px-2.5 py-2 text-sm transition
        ${isActive ? 'bg-navy-700 font-semibold text-ink' : 'font-medium text-ink-muted hover:bg-navy-700 hover:text-ink'}`}
    >
      {isActive && (
        <span className="absolute -left-3 bottom-2 top-2 w-[3px] rounded-r bg-gold" aria-hidden="true" />
      )}
      <Icon size={18} className={`shrink-0 ${isActive ? 'text-gold' : ''}`} />
      <span className="flex-1 truncate text-left">{label}</span>
      {badge !== undefined &&
        (destacado ? (
          <span className="rounded-full bg-gold px-1.5 text-[11px] font-bold tabular-nums text-navy-900">
            {badge}
          </span>
        ) : (
          <span className="text-[11.5px] font-semibold tabular-nums text-ink-faint">{badge}</span>
        ))}
    </button>
  );
}

/**
 * Menú lateral, solo en computadora. En celular la navegación vive en la
 * barra inferior y en la hoja "Más" (BottomBar.jsx).
 */
export default function Sidebar({ active, onNavigate, onOpenProfile, onOpenShortcuts }) {
  const { user, role, logout } = useAuth();
  const { myProfile } = useData();
  const { badges, destacado } = useBadges();
  const destinos = destinosDe(role);

  return (
    <aside className="hidden h-full w-[232px] shrink-0 flex-col border-r border-white/[0.08] bg-navy-800 px-3 pb-3 pt-5 md:flex">
      {/* Solo el nombre: Marga no lleva logo ni número de versión. */}
      <div className="px-2 pb-4">
        <h1 className="font-head text-[27px] font-extrabold leading-none tracking-tight text-ink">
          Marga
        </h1>
        <p className="mt-1 text-[11px] text-ink-faint">Dinamo Saltillo</p>
      </div>

      <nav className="-ml-3 min-h-0 flex-1 overflow-y-auto pl-3">
        {GRUPOS.map((grupo) => {
          const items = destinos.filter((d) => d.grupo === grupo.id);
          if (items.length === 0) return null;
          return (
            <div key={grupo.id}>
              <p className="px-2.5 pb-1.5 pt-3.5 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-ink-faint">
                {grupo.label}
              </p>
              <div className="space-y-0.5">
                {items.map((d) => (
                  <NavButton
                    key={d.id}
                    icon={d.icon}
                    label={d.label}
                    badge={badges[d.id]}
                    destacado={destacado[d.id]}
                    isActive={active === d.id}
                    onClick={() => onNavigate(d.id)}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </nav>

      {/* Glosario de atajos: discreto, en gris, justo arriba del usuario. */}
      <button
        onClick={onOpenShortcuts}
        className="mt-2 flex items-center gap-2 rounded-lg px-2.5 py-2 text-xs text-ink-faint transition hover:bg-navy-700 hover:text-ink-muted"
      >
        <Keyboard size={14} />
        Atajos de teclado
        <kbd className="m-kbd ml-auto">?</kbd>
      </button>

      <div className="mt-1.5 flex items-center gap-1 border-t border-white/[0.08] pt-2.5">
        <button
          onClick={onOpenProfile}
          aria-label={`Abrir mi perfil (${user?.username ?? ''})`}
          className="flex min-w-0 flex-1 items-center gap-2.5 rounded-lg px-1.5 py-1.5 text-left transition hover:bg-navy-700"
        >
          <Avatar
            photo={myProfile?.photo}
            name={user?.username}
            color={userColor(myProfile ?? user)}
            size={30}
            fallback="icon"
          />
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold text-ink">{user?.username}</span>
            <span className="block text-[11px] text-ink-faint">{ROLE_LABELS[role] ?? role}</span>
          </span>
        </button>
        <button
          onClick={logout}
          aria-label="Cerrar sesión"
          title="Cerrar sesión"
          className="rounded-lg p-2 text-ink-faint transition hover:bg-state-danger/10 hover:text-state-danger"
        >
          <LogOut size={17} />
        </button>
      </div>
    </aside>
  );
}
