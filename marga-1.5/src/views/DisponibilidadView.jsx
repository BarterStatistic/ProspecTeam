import { useMemo, useState } from 'react';
import { Search, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { useData } from '../context/DataContext.jsx';
import { canEditDisponibilidad } from '../lib/permissions.js';
import { MODELS } from '../lib/motos.js';
import {
  ESTADOS_DISPONIBILIDAD,
  conteoPorEstado,
  estadoDe,
  infoEstado,
  registroDe,
} from '../lib/disponibilidad.js';
import { normalizeName } from '../lib/clients.js';
import { formatMXN0, formatDateTime } from '../lib/format.js';
import Card from '../components/ui/Card.jsx';

/** Píldora de solo lectura con el color del estado. */
function EstadoPill({ estado }) {
  const info = infoEstado(estado);
  return (
    <span
      className="inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold"
      style={{ backgroundColor: `${info.color}26`, color: info.color }}
    >
      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: info.color }} />
      {info.label}
    </span>
  );
}

/** Selector de tres estados para el admin: el activo se pinta con su color. */
function EstadoSelector({ estado, onChange, disabled }) {
  return (
    <div className="flex shrink-0 gap-1" role="radiogroup" aria-label="Disponibilidad">
      {ESTADOS_DISPONIBILIDAD.map((e) => {
        const on = e.id === estado;
        return (
          <button
            key={e.id}
            role="radio"
            aria-checked={on}
            disabled={disabled}
            onClick={() => !on && onChange(e.id)}
            className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold transition disabled:opacity-60 ${
              on ? '' : 'bg-white/5 text-ink-faint hover:bg-white/10 hover:text-ink'
            }`}
            style={on ? { backgroundColor: `${e.color}26`, color: e.color } : undefined}
          >
            <span
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: on ? e.color : 'rgba(255,255,255,0.25)' }}
            />
            {e.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Disponibilidad de motos: la lista completa del catálogo con su estado
 * (Disponible, Bajo pedido, No disponible). Todos los roles la consultan; solo
 * el admin cambia estados, y el cambio se ve al instante en todos los equipos.
 */
export default function DisponibilidadView() {
  const { role } = useAuth();
  const { disponibilidad, cambiarDisponibilidad } = useData();
  const editable = canEditDisponibilidad(role);

  const [filtro, setFiltro] = useState('todas');
  const [query, setQuery] = useState('');
  const [guardando, setGuardando] = useState(''); // nombre de la moto en curso
  const [error, setError] = useState('');

  const conteo = useMemo(() => conteoPorEstado(MODELS, disponibilidad), [disponibilidad]);

  const visibles = useMemo(() => {
    const q = normalizeName(query);
    return MODELS.filter((m) => {
      if (filtro !== 'todas' && estadoDe(disponibilidad, m.nombre) !== filtro) return false;
      return !q || normalizeName(m.nombre).includes(q);
    });
  }, [disponibilidad, filtro, query]);

  async function cambiar(nombre, estado) {
    setGuardando(nombre);
    setError('');
    try {
      await cambiarDisponibilidad(nombre, estado);
    } catch (err) {
      setError(err?.message || `No se pudo cambiar la disponibilidad de ${nombre}.`);
    } finally {
      setGuardando('');
    }
  }

  const chips = [
    { id: 'todas', label: 'Todas', count: MODELS.length, color: null },
    ...ESTADOS_DISPONIBILIDAD.map((e) => ({ ...e, count: conteo[e.id] })),
  ];

  return (
    <div className="h-full overflow-y-auto px-4 py-5 sm:px-6">
      <div className="mx-auto max-w-4xl space-y-4">
        <Card className="p-4">
          <div className="flex flex-wrap items-center gap-1.5">
            {chips.map((c) => {
              const on = filtro === c.id;
              return (
                <button
                  key={c.id}
                  onClick={() => setFiltro(c.id)}
                  aria-pressed={on}
                  className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition ${
                    on && !c.color ? 'bg-gold/20 text-gold' : ''
                  } ${on ? '' : 'bg-white/5 text-ink-muted hover:bg-white/10 hover:text-ink'}`}
                  style={on && c.color ? { backgroundColor: `${c.color}26`, color: c.color } : undefined}
                >
                  {c.color && (
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: c.color }} />
                  )}
                  {c.label}
                  <span className="opacity-70">{c.count}</span>
                </button>
              );
            })}
          </div>

          <div className="relative mt-3">
            <Search
              size={14}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint"
            />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar modelo…"
              aria-label="Buscar modelo"
              className="m-input w-full pl-9"
            />
          </div>

          <p className="mt-2 text-[11px] text-ink-faint">
            {editable
              ? 'Toca un estado para cambiarlo; el equipo lo ve al instante.'
              : 'Solo el administrador cambia la disponibilidad.'}
          </p>
          {error && <p className="mt-1 text-[11px] text-state-danger">{error}</p>}
        </Card>

        {visibles.length === 0 ? (
          <p className="px-2 py-16 text-center text-sm text-ink-faint">
            Ninguna moto coincide con el filtro.
          </p>
        ) : (
          <ul className="space-y-2">
            {visibles.map((m) => {
              const estado = estadoDe(disponibilidad, m.nombre);
              const registro = registroDe(disponibilidad, m.nombre);
              return (
                <li key={m.nombre}>
                  <Card
                    className="flex flex-wrap items-center gap-x-4 gap-y-2 border-l-4 px-4 py-3"
                    style={{ borderLeftColor: infoEstado(estado).color }}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-ink">{m.nombre}</p>
                      <p className="text-[11px] text-ink-faint">
                        {formatMXN0(m.precio)}
                        {registro?.updatedAt &&
                          ` · actualizado ${formatDateTime(registro.updatedAt)}${
                            registro.updatedBy ? ` por ${registro.updatedBy}` : ''
                          }`}
                      </p>
                    </div>
                    {editable ? (
                      <EstadoSelector
                        estado={estado}
                        disabled={guardando === m.nombre}
                        onChange={(nuevo) => cambiar(m.nombre, nuevo)}
                      />
                    ) : (
                      <EstadoPill estado={estado} />
                    )}
                  </Card>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
