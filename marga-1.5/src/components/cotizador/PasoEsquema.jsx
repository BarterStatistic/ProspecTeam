import { SCHEMES, SCHEME_IDS } from '../../lib/motos.js';

/** Paso 2 del cotizador: elegir el esquema de financiamiento. */
export default function PasoEsquema({ value, onChange }) {
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {SCHEME_IDS.map((id) => {
        const s = SCHEMES[id];
        const on = value === id;
        return (
          <button
            key={id}
            type="button"
            onClick={() => onChange(id)}
            className={`rounded-xl border px-4 py-3 text-left transition ${
              on
                ? 'border-gold bg-gold/10'
                : 'border-white/10 bg-navy-900/50 hover:border-sky2/40'
            }`}
          >
            <span className="block text-sm font-semibold text-ink">{s.label}</span>
            <span className="block text-[11px] text-ink-faint">
              Enganche {s.min}%–{s.max}% · hasta {s.terms.at(-1)} {s.termUnit}
            </span>
          </button>
        );
      })}
    </div>
  );
}
