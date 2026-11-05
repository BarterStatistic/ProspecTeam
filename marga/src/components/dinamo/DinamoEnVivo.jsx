import { useCallback, useEffect, useState } from 'react';
import { ChevronDown, Monitor, RefreshCw } from 'lucide-react';
import { useData } from '../../context/DataContext.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { ROLES } from '../../lib/constants.js';
import { estadoEnVivo, hace, LATIDO_MAXIMO_MS, proximaLectura } from '../../lib/dinamo.js';

// Franja arriba de las columnas de Procesos: si la bandeja de Dinamo está al
// día, botón «Forzar actualización» (reinicia el contador de 30 min) y, para el
// admin, las máquinas conectadas y el intervalo entre lecturas.

const TONO = {
  ok: 'bg-state-success',
  leyendo: 'bg-sky2 animate-pulse',
  apagado: 'bg-ink-faint',
  error: 'bg-state-danger',
};

/** Cada cuánto se vuelve a preguntar por el estado (y más seguido mientras lee). */
const SONDEO_MS = 30 * 1000;
const SONDEO_LEYENDO_MS = 5 * 1000;

export default function DinamoEnVivo() {
  const { dinamo } = useData();
  const { role } = useAuth();
  const admin = role === ROLES.ADMIN;
  const [panel, setPanel] = useState(null);
  const [abierto, setAbierto] = useState(false);
  const [forzando, setForzando] = useState(false);
  const [error, setError] = useState('');
  const [ahora, setAhora] = useState(Date.now());

  const leer = useCallback(async () => {
    try {
      setPanel(await dinamo.panel());
      setError('');
    } catch (err) {
      setError(err.message);
    }
    setAhora(Date.now());
  }, [dinamo]);

  const leyendo = Boolean(panel?.estado?.leyendo || panel?.estado?.solicitud_desde);
  useEffect(() => {
    if (!dinamo) return undefined;
    leer();
    const id = setInterval(leer, leyendo ? SONDEO_LEYENDO_MS : SONDEO_MS);
    return () => clearInterval(id);
  }, [dinamo, leer, leyendo]);

  if (!dinamo) return null;

  const { tono, texto } = error ? { tono: 'apagado', texto: 'Dinamo sin conectar' } : estadoEnVivo(panel, ahora);
  const proxima = proximaLectura(panel?.estado);

  async function forzar() {
    setForzando(true);
    try {
      await dinamo.forzar();
      await leer();
    } catch (err) {
      alert(err.message);
    } finally {
      setForzando(false);
    }
  }

  return (
    <div className="border-b border-white/5 px-4 py-2 sm:px-6">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs">
        <span className="flex min-w-0 items-center gap-2 text-ink-muted">
          <span className={`h-2 w-2 shrink-0 rounded-full ${TONO[tono]}`} aria-hidden="true" />
          <span className="truncate">
            <span className="font-medium text-ink">Dinamo</span> · {texto}
          </span>
        </span>
        {proxima && !leyendo && tono !== 'error' && (
          <span className="text-ink-faint">Siguiente lectura {aFuturo(proxima, ahora)}</span>
        )}
        <div className="ml-auto flex items-center gap-1.5">
          <button
            type="button"
            onClick={forzar}
            disabled={forzando || leyendo}
            className="flex items-center gap-1.5 rounded-full bg-white/5 px-3 py-1 font-medium text-sky2-light transition hover:bg-white/10 disabled:opacity-50"
          >
            <RefreshCw size={12} className={leyendo ? 'animate-spin' : ''} />
            Forzar actualización
          </button>
          {admin && (
            <button
              type="button"
              onClick={() => setAbierto((v) => !v)}
              aria-expanded={abierto}
              className="flex items-center gap-1 rounded-full bg-white/5 px-3 py-1 text-ink-muted transition hover:bg-white/10 hover:text-ink"
            >
              <Monitor size={12} /> Máquinas
              <ChevronDown size={12} className={`transition ${abierto ? 'rotate-180' : ''}`} />
            </button>
          )}
        </div>
      </div>
      {admin && abierto && panel && <PanelMaquinas panel={panel} ahora={ahora} onCambio={leer} />}
    </div>
  );
}

/** «en 12 min» / «en un momento». */
function aFuturo(iso, ahora) {
  const min = Math.ceil((Date.parse(iso) - ahora) / 60000);
  if (min <= 1) return 'en un momento';
  if (min < 60) return `en ${min} min`;
  return `en ${Math.floor(min / 60)} h ${min % 60} min`;
}

function PanelMaquinas({ panel, ahora, onCambio }) {
  const { dinamo } = useData();
  const [intervalo, setIntervalo] = useState(String(panel.estado?.intervalo_min ?? 30));
  const [guardando, setGuardando] = useState(false);

  async function guardarIntervalo(e) {
    e.preventDefault();
    const n = Number(intervalo);
    if (!Number.isInteger(n) || n < 1 || n > 1440) return alert('El intervalo va de 1 a 1440 minutos.');
    setGuardando(true);
    try {
      await dinamo.intervalo(n);
      await onCambio();
    } catch (err) {
      alert(err.message);
    } finally {
      setGuardando(false);
    }
  }

  async function cambiarActiva(maquina) {
    const accion = maquina.activo ? 'Revocar' : 'Reactivar';
    if (!confirm(`¿${accion} la máquina «${maquina.nombre}»?`)) return;
    try {
      await dinamo.maquinaActiva(maquina.id, !maquina.activo);
      await onCambio();
    } catch (err) {
      alert(err.message);
    }
  }

  return (
    <div className="mt-2 space-y-3 rounded-xl bg-navy-900/50 p-3 text-xs">
      <form onSubmit={guardarIntervalo} className="flex flex-wrap items-center gap-2">
        <label htmlFor="dinamo-intervalo" className="text-ink-muted">
          Leer la bandeja cada
        </label>
        <input
          id="dinamo-intervalo"
          type="number"
          min={1}
          max={1440}
          value={intervalo}
          onChange={(e) => setIntervalo(e.target.value)}
          className="w-20 rounded-md border border-white/10 bg-navy-800 px-2 py-1 font-cifra text-ink"
        />
        <span className="text-ink-muted">min (24 h al día)</span>
        <button
          type="submit"
          disabled={guardando || intervalo === String(panel.estado?.intervalo_min)}
          className="rounded-full bg-gold/20 px-3 py-1 font-medium text-gold transition hover:bg-gold/30 disabled:opacity-40"
        >
          Guardar
        </button>
      </form>

      {panel.agentes.length === 0 ? (
        <p className="text-ink-faint">
          Ninguna máquina dada de alta. Instala el agente con la línea del README de bandeja-dinamo.
        </p>
      ) : (
        <ul className="divide-y divide-white/5">
          {panel.agentes.map((m) => {
            const viva = m.activo && m.ultimo_latido && ahora - Date.parse(m.ultimo_latido) < LATIDO_MAXIMO_MS;
            return (
              <li key={m.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
                <span
                  className={`h-2 w-2 rounded-full ${viva ? 'bg-state-success' : m.activo ? 'bg-ink-faint' : 'bg-state-danger'}`}
                  aria-hidden="true"
                />
                <span className="font-medium text-ink">{m.nombre || m.id}</span>
                <span className="font-cifra text-ink-faint">{m.version ?? '—'}</span>
                <span className="text-ink-faint">
                  {!m.activo ? 'Revocada' : viva ? 'Conectada' : `Sin latido ${m.ultimo_latido ? hace(m.ultimo_latido, ahora) : ''}`}
                  {m.ultima_sync && ` · leyó ${hace(m.ultima_sync, ahora)}`}
                </span>
                {m.ultimo_error && <span className="w-full truncate text-state-danger">{m.ultimo_error}</span>}
                <button
                  type="button"
                  onClick={() => cambiarActiva(m)}
                  className={`ml-auto rounded-md px-2 py-0.5 transition hover:bg-white/5 ${
                    m.activo ? 'text-state-danger' : 'text-sky2-light'
                  }`}
                >
                  {m.activo ? 'Revocar' : 'Reactivar'}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
