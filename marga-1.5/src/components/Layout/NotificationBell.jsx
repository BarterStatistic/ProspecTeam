import { useEffect, useRef, useState } from 'react';
import { Bell } from 'lucide-react';
import { useData } from '../../context/DataContext.jsx';

const horaFmt = new Intl.DateTimeFormat('es-MX', { hour: '2-digit', minute: '2-digit' });
const diaFmt = new Intl.DateTimeFormat('es-MX', { day: '2-digit', month: 'short' });

/** Hoy → "14:30"; cualquier otro día → "18 sep 14:30". */
function cuando(ts) {
  const d = new Date(ts);
  const hoy = new Date();
  const mismoDia =
    d.getFullYear() === hoy.getFullYear() &&
    d.getMonth() === hoy.getMonth() &&
    d.getDate() === hoy.getDate();
  return mismoDia ? horaFmt.format(d) : `${diaFmt.format(d)} ${horaFmt.format(d)}`;
}

/**
 * Timbre de la barra superior. Abrir el panel marca como leídas las
 * notificaciones visibles, así el badge refleja lo que aún no se ha mirado.
 */
export default function NotificationBell() {
  const { misNotificaciones, noLeidas, marcarNotificacionesLeidas } = useData();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => {
      if (!ref.current?.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  function toggle() {
    const abriendo = !open;
    setOpen(abriendo);
    if (abriendo) {
      const pendientes = misNotificaciones.filter((n) => !n.leida).map((n) => n.id);
      if (pendientes.length) marcarNotificacionesLeidas(pendientes);
    }
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={toggle}
        aria-label={`Notificaciones${noLeidas ? ` (${noLeidas} sin leer)` : ''}`}
        className="relative rounded-lg p-2 text-ink-muted transition hover:bg-white/5 hover:text-ink"
      >
        <Bell size={18} />
        {noLeidas > 0 && (
          <span className="absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-gold px-1 text-[10px] font-bold text-navy-900">
            {noLeidas > 9 ? '9+' : noLeidas}
          </span>
        )}
      </button>

      {open && (
        <div className="m-glass fixed inset-x-4 top-16 z-40 w-auto animate-fadeIn rounded-xl p-1 sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-2 sm:w-80">
          <p className="px-3 py-2 text-xs font-semibold text-ink">Notificaciones</p>
          <div className="max-h-80 overflow-y-auto">
            {misNotificaciones.length === 0 ? (
              <p className="px-3 py-6 text-center text-xs text-ink-faint">
                Todavía no tienes notificaciones.
              </p>
            ) : (
              misNotificaciones.map((n) => (
                <div
                  key={n.id}
                  className={`flex items-start gap-2 rounded-lg px-3 py-2 ${
                    n.leida ? '' : 'bg-gold/5'
                  }`}
                >
                  <p className="min-w-0 flex-1 text-xs text-ink-muted">{n.mensaje}</p>
                  <span className="shrink-0 pt-0.5 text-[10px] text-ink-faint">
                    {cuando(n.createdAt)}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
