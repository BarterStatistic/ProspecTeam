import { useState } from 'react';

/**
 * Una medida con su propia escala: total a la izquierda y barras por periodo.
 * Se apilan varias (Registrados, Ventas, Cancelados) en vez de una sola
 * gráfica de tres líneas, donde las ventas (pocas) quedaban aplastadas contra
 * los registros (muchos).
 *
 * `points` = [{ label, value }]. Al pasar el cursor o tocar una barra se
 * muestra su dato; `formato` da forma al número (p. ej. dinero).
 */
export default function MiniBars({
  label,
  color,
  points,
  total,
  unidad = 'periodo',
  formato = (v) => v,
  alto = 62,
}) {
  const [sel, setSel] = useState(null);
  const max = Math.max(1, ...points.map((p) => p.value));
  const activo = sel != null ? points[sel] : null;

  return (
    <div className="grid gap-1.5 md:grid-cols-[118px_1fr] md:items-end md:gap-3">
      <div className="flex items-baseline gap-2 md:block">
        <p className="flex items-center gap-1.5 text-[12.5px] text-ink-muted">
          <span className="h-2.5 w-2.5 rounded-[3px]" style={{ backgroundColor: color }} />
          {label}
        </p>
        <p className="font-head text-[22px] font-extrabold tabular-nums leading-tight text-ink">
          {formato(total)}
        </p>
        <p className="ml-auto text-[11px] text-ink-faint md:ml-0" aria-live="polite">
          {activo
            ? `${activo.label}: ${formato(activo.value)}`
            : `máx. ${formato(max)} por ${unidad}`}
        </p>
      </div>
      <div
        className="flex items-end gap-0.5 border-b border-white/[0.08]"
        style={{ height: alto }}
        onMouseLeave={() => setSel(null)}
      >
        {points.map((p, i) => (
          <button
            key={i}
            type="button"
            onMouseEnter={() => setSel(i)}
            onFocus={() => setSel(i)}
            onClick={() => setSel(i)}
            aria-label={`${p.label}: ${formato(p.value)} ${label.toLowerCase()}`}
            className="group flex h-full min-w-[2px] flex-1 items-end"
          >
            <span
              className={`block w-full rounded-t-[3px] transition-opacity ${
                sel === i ? 'opacity-100' : 'opacity-80 group-hover:opacity-100'
              }`}
              style={{
                height: p.value ? `${Math.max((p.value / max) * 100, 6)}%` : '2%',
                backgroundColor: p.value ? color : 'rgba(148,170,210,0.18)',
              }}
            />
          </button>
        ))}
      </div>
    </div>
  );
}
