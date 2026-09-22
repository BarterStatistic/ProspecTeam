import { useMemo, useState } from 'react';
import { Search, Check } from 'lucide-react';
import { MODELS } from '../../lib/motos.js';
import { formatMXN0 } from '../../lib/format.js';

function slug(str) {
  return String(str)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

/** Paso 1 del cotizador: buscar y elegir el modelo. */
export default function PasoMoto({ value, onChange }) {
  const [query, setQuery] = useState('');

  const visibles = useMemo(() => {
    const q = slug(query.trim());
    return q ? MODELS.filter((m) => slug(m.nombre).includes(q)) : MODELS;
  }, [query]);

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search
          size={15}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint"
        />
        <input
          className="m-input pl-9"
          placeholder="Buscar modelo…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      <p className="text-[11px] text-ink-faint">
        {visibles.length} modelo{visibles.length === 1 ? '' : 's'} disponible
        {visibles.length === 1 ? '' : 's'}
      </p>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
        {visibles.map((m) => {
          const on = value === m.nombre;
          return (
            <button
              key={m.nombre}
              type="button"
              onClick={() => onChange(m.nombre)}
              className={`relative rounded-xl border px-3 py-3 text-left transition ${
                on
                  ? 'border-gold bg-gold/10'
                  : 'border-white/10 bg-navy-900/50 hover:border-sky2/40'
              }`}
            >
              <span className="block text-xs font-semibold text-ink">{m.nombre}</span>
              <span className="block text-[11px] text-ink-faint">{formatMXN0(m.precio)}</span>
              {on && (
                <Check size={14} strokeWidth={3} className="absolute right-2 top-2 text-gold" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
