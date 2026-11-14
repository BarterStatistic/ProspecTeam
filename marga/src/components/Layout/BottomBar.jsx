import { createPortal } from 'react-dom';
import { LayoutGrid, LogOut, Bot } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.jsx';
import { useData } from '../../context/DataContext.jsx';
import { ROLE_LABELS, userColor } from '../../lib/constants.js';
import { canUsarBartersito } from '../../lib/permissions.js';
import Avatar from '../ui/Avatar.jsx';
import BackupMenu from './BackupMenu.jsx';
import { destinosDe, destinosDeBarra } from './navegacion.js';
import { useBadges } from './useBadges.js';

const TAB =
  'relative flex min-h-[52px] flex-1 flex-col items-center justify-center gap-0.5 text-[10.5px] font-semibold transition';

/**
 * Navegación del celular: lo de todos los días fijo abajo, al alcance del
 * pulgar, y el resto en la hoja "Más". Sustituye al menú lateral deslizable.
 */
export default function BottomBar({
  active,
  onNavigate,
  moreOpen,
  onToggleMore,
  onOpenProfile,
  onOpenBartersito,
}) {
  const { user, role, logout } = useAuth();
  const { myProfile } = useData();
  const { badges, destacado } = useBadges();
  const enBarra = destinosDeBarra(role);
  const idsBarra = new Set(enBarra.map((d) => d.id));
  const enMas = destinosDe(role).filter((d) => !idsBarra.has(d.id));
  const masActivo = moreOpen || !idsBarra.has(active);

  return (
    <>
      <nav
        className="z-30 flex shrink-0 border-t border-white/[0.08] bg-navy-800 px-1 pt-1 md:hidden"
        style={{ paddingBottom: 'calc(4px + env(safe-area-inset-bottom))' }}
        aria-label="Secciones"
      >
        {enBarra.map((d) => {
          const on = active === d.id && !moreOpen;
          return (
            <button
              key={d.id}
              onClick={() => onNavigate(d.id)}
              aria-current={on ? 'page' : undefined}
              className={`${TAB} ${on ? 'text-ink' : 'text-ink-faint'}`}
            >
              <d.icon size={22} className={on ? 'text-gold' : ''} />
              {d.label}
              {destacado[d.id] && (
                <span className="absolute left-1/2 top-0.5 ml-1.5 min-w-[16px] rounded-full bg-gold px-1 text-center text-[10px] font-bold text-navy-900">
                  {badges[d.id]}
                </span>
              )}
            </button>
          );
        })}
        <button
          onClick={onToggleMore}
          aria-expanded={moreOpen}
          className={`${TAB} ${masActivo ? 'text-ink' : 'text-ink-faint'}`}
        >
          <LayoutGrid size={22} className={masActivo ? 'text-gold' : ''} />
          Más
        </button>
      </nav>

      {moreOpen &&
        createPortal(
          <div
            className="fixed inset-0 z-40 flex items-end bg-navy-900/70 md:hidden"
            onMouseDown={(e) => e.target === e.currentTarget && onToggleMore()}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-label="Más secciones"
              className="m-sheet-up max-h-[86dvh] w-full overflow-y-auto rounded-t-[22px] border-t border-white/[0.08] bg-navy-800 px-3.5 pt-2"
              style={{ paddingBottom: 'calc(16px + env(safe-area-inset-bottom))' }}
            >
              <div className="mx-auto mb-2 h-1 w-10 rounded bg-white/15" />
              <button
                onClick={onOpenProfile}
                className="mb-3 flex w-full items-center gap-3 rounded-xl px-1.5 py-1.5 text-left"
              >
                <Avatar
                  photo={myProfile?.photo}
                  name={user?.username}
                  color={userColor(myProfile ?? user)}
                  size={38}
                  fallback="icon"
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-head text-[17px] font-extrabold text-ink">
                    {user?.username}
                  </span>
                  <span className="block text-xs text-ink-faint">
                    {ROLE_LABELS[role] ?? role} · ver mi perfil
                  </span>
                </span>
              </button>

              <div className="grid grid-cols-3 gap-2">
                {enMas.map((d) => (
                  <button
                    key={d.id}
                    onClick={() => onNavigate(d.id)}
                    className={`relative flex flex-col items-center gap-1.5 rounded-[13px] px-1.5 py-3.5 text-center text-xs font-medium transition ${
                      active === d.id ? 'bg-gold/15 text-ink' : 'bg-navy-700 text-ink-muted'
                    }`}
                  >
                    <d.icon size={22} className={active === d.id ? 'text-gold' : 'text-ink'} />
                    <span className="leading-tight">{d.label}</span>
                    {badges[d.id] > 0 && (
                      <span className="absolute right-2 top-2 text-[10.5px] font-semibold tabular-nums text-ink-faint">
                        {badges[d.id]}
                      </span>
                    )}
                  </button>
                ))}
                {/* Bartersito es solo del administrador (canUsarBartersito). */}
                {canUsarBartersito(role) && (
                  <button
                    onClick={onOpenBartersito}
                    className="flex flex-col items-center gap-1.5 rounded-[13px] bg-navy-700 px-1.5 py-3.5 text-center text-xs font-medium text-ink-muted"
                  >
                    <Bot size={22} className="text-sky2" />
                    Bartersito
                  </button>
                )}
              </div>

              <div className="mt-3 border-t border-white/[0.08] pt-2">
                <BackupMenu variant="sidebar" />
                <button
                  onClick={logout}
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium text-ink-muted transition hover:bg-state-danger/10 hover:text-state-danger"
                >
                  <LogOut size={18} /> Cerrar sesión
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
