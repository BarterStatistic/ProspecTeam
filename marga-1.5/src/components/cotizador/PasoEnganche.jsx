import { useState } from 'react';
import { SCHEMES } from '../../lib/motos.js';
import { precioEfectivo } from '../../lib/cotizador.js';
import { formatMXN } from '../../lib/format.js';
import Checkbox from '../ui/Checkbox.jsx';

const MODOS = [
  ['pct', 'Por porcentaje'],
  ['monto', 'Por monto'],
];

/** Paso 3 del cotizador: enganche (en % o en pesos) y servicio preventivo. */
export default function PasoEnganche({
  moto,
  esquemaId,
  enganchePct,
  onEnganchePct,
  incluyeServicio,
  onIncluyeServicio,
}) {
  const [modo, setModo] = useState('pct');
  const esquema = SCHEMES[esquemaId];
  const precio = precioEfectivo(moto, incluyeServicio);
  const enganche = (precio * enganchePct) / 100;
  const fueraDeRango = enganchePct < esquema.min || enganchePct > esquema.max;

  return (
    <div className="space-y-4">
      <div className="flex gap-1.5">
        {MODOS.map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setModo(id)}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
              modo === id ? 'bg-gold/20 text-gold' : 'bg-white/5 text-ink-muted hover:text-ink'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {modo === 'pct' ? (
        <div>
          <label className="m-label" htmlFor="cot-pct">
            Enganche (%)
          </label>
          <input
            id="cot-pct"
            className="m-input"
            type="number"
            min="0"
            max="100"
            step="0.01"
            inputMode="decimal"
            value={enganchePct === 0 ? '' : enganchePct}
            onChange={(e) => onEnganchePct(Number(e.target.value) || 0)}
            placeholder={`Ej. ${esquema.min}`}
          />
        </div>
      ) : (
        <div>
          <label className="m-label" htmlFor="cot-monto">
            Enganche (pesos)
          </label>
          <input
            id="cot-monto"
            className="m-input"
            type="number"
            min="0"
            step="1"
            inputMode="decimal"
            value={enganche === 0 ? '' : Math.round(enganche)}
            onChange={(e) => onEnganchePct(((Number(e.target.value) || 0) / precio) * 100)}
            placeholder="Ej. 15000"
          />
        </div>
      )}

      <p className={`text-[11px] ${fueraDeRango ? 'text-state-danger' : 'text-ink-faint'}`}>
        {fueraDeRango
          ? `${esquema.label} acepta enganches entre ${esquema.min}% y ${esquema.max}%.`
          : `${enganchePct.toFixed(2)}% · ${formatMXN(enganche)} sobre ${formatMXN(precio)}`}
      </p>

      {moto.servicio > 0 && (
        <Checkbox
          checked={incluyeServicio}
          onChange={onIncluyeServicio}
          label={`Incluir servicio preventivo (+${formatMXN(moto.servicio)})`}
        />
      )}
    </div>
  );
}
