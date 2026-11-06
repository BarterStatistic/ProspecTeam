import { useCallback, useMemo, useState } from 'react';
import { CalendarDays } from 'lucide-react';
import Card from './Card.jsx';
import { useData } from '../../context/DataContext.jsx';
import {
  etiquetaMes,
  mesVenta,
  mesesDisponibles,
  periodoPorClave,
  TODO_EL_HISTORICO,
} from '../../lib/comisiones.js';
import { formatDateShort } from '../../lib/format.js';

/**
 * Selector del mes de venta (los que registra el admin en el Panel ADMIN).
 * Las vistas arrancan en el mes en curso; "Todo el histórico" quita el filtro.
 * `total` es lo que se está mostrando y `unidad` su nombre en singular/plural.
 */
export default function SelectorMes({
  id,
  mes,
  meses,
  claveHoy,
  periodo,
  onChange,
  total,
  unidad = ['venta', 'ventas'],
  children,
}) {
  return (
    <Card className="flex flex-wrap items-center gap-2 p-4">
      <CalendarDays size={14} className="text-sky2" />
      <label htmlFor={id} className="text-xs font-medium text-ink-muted">
        Mes de venta
      </label>
      <select
        id={id}
        value={mes}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-lg border border-white/10 bg-navy-900 px-2 py-1.5 text-xs text-ink"
      >
        {meses.map((clave) => (
          <option key={clave} value={clave}>
            {etiquetaMes(clave)}
            {clave === claveHoy ? ' (en curso)' : ''}
          </option>
        ))}
        <option value={TODO_EL_HISTORICO}>Todo el histórico</option>
      </select>
      {mes !== claveHoy && (
        <button
          type="button"
          onClick={() => onChange(claveHoy)}
          className="rounded-full bg-gold/15 px-3 py-1 text-xs font-medium text-gold hover:bg-gold/25"
        >
          Volver al mes en curso
        </button>
      )}
      {children}
      <span className="ml-auto text-[11px] text-ink-faint">
        {periodo ? `${formatDateShort(periodo.inicio)} – ${formatDateShort(periodo.fin)} · ` : ''}
        {total} {total === 1 ? unidad[0] : unidad[1]}
      </span>
    </Card>
  );
}

/**
 * Estado del selector de mes para una lista de registros fechados.
 * `fechaDe(registro)` da el timestamp que decide su mes de venta (entrega,
 * cancelación…). Arranca en el mes en curso según los meses del Panel ADMIN.
 */
export function useMesVenta(registros, fechaDe) {
  const { configComisiones } = useData();
  const claveHoy = mesVenta(Date.now(), configComisiones);
  const [mes, setMes] = useState(claveHoy);

  const claveDe = useMemo(() => {
    const cache = new Map();
    return (r) => {
      const ts = fechaDe(r);
      if (typeof ts !== 'number' || !Number.isFinite(ts)) return null;
      if (!cache.has(ts)) cache.set(ts, mesVenta(ts, configComisiones));
      return cache.get(ts);
    };
    // fechaDe es estable por vista (función de módulo).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [configComisiones]);

  const meses = useMemo(
    () => mesesDisponibles(registros.map(claveDe), claveHoy),
    [registros, claveDe, claveHoy],
  );

  const enMes = useCallback(
    (r) => mes === TODO_EL_HISTORICO || claveDe(r) === mes,
    [mes, claveDe],
  );

  return {
    mes,
    setMes,
    meses,
    claveHoy,
    periodo: mes === TODO_EL_HISTORICO ? null : periodoPorClave(mes, configComisiones),
    enMes,
  };
}
