import { forwardRef } from 'react';
import { SCHEMES } from '../../lib/motos.js';
import { precioEfectivo, parcialidad } from '../../lib/cotizador.js';
import { formatMXN, formatMXN0, formatDate } from '../../lib/format.js';

/**
 * 20 → "20%"; 15.5 → "15.50%". Igual que `pct()` del cotizador original
 * (`Cotizadores/cotizador-pt/index.html`, línea 747): dos decimales,
 * recortando el ".00" exacto — no cualquier cero de cola.
 */
function pct(n) {
  return `${Number(n).toFixed(2).replace(/\.00$/, '')}%`;
}

/**
 * Resultado del cotizador: una fila por plazo del esquema.
 *
 * El formato del dinero reproduce, valor por valor, al cotizador original
 * (`Cotizadores/cotizador-pt/index.html`, función `render()`, líneas
 * 936-964): los recuadros del encabezado (precio de lista, precio paquete,
 * enganche en pesos y monto a financiar) llevan centavos (su `mxn`); el
 * "+servicio" del paquete y todo lo que va en cada renglón de la tabla
 * (enganche y parcialidad) va sin centavos (su `mxn0`). La parcialidad se
 * redondea al peso antes de mostrarse — `Math.round()` sobre el resultado
 * de `parcialidad()`, que en sí no se toca (sigue exacta para comisiones).
 */
const Cotizacion = forwardRef(function Cotizacion(
  { moto, esquemaId, enganchePct, incluyeServicio },
  ref,
) {
  const esquema = SCHEMES[esquemaId];
  const precio = precioEfectivo(moto, incluyeServicio);
  const enganche = (precio * enganchePct) / 100;
  const montoACredito = precio - enganche;

  const filas = esquema.terms.map((plazo) => {
    const pago = Math.round(parcialidad({ esquemaId, montoACredito, enganchePct, plazo }));
    return { plazo, pago };
  });
  const pagoMax = Math.max(...filas.map((f) => f.pago));

  return (
    <div ref={ref} className="rounded-2xl border border-white/5 bg-navy-800 p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-lg font-bold text-gold">{moto.nombre}</h3>
        <span className="m-chip bg-sky2/15 text-sky2">{esquema.label}</span>
      </div>

      <dl className="mb-4 grid grid-cols-2 gap-x-4 gap-y-2 text-xs sm:grid-cols-3">
        <div>
          <dt className="text-ink-faint">Precio de lista</dt>
          <dd className="text-ink">{formatMXN(moto.precio)}</dd>
        </div>
        {incluyeServicio && (
          <div>
            <dt className="text-ink-faint">Con servicio preventivo</dt>
            <dd className="text-ink">
              {formatMXN(precio)}{' '}
              <span className="text-state-success">+{formatMXN0(moto.servicio)}</span>
            </dd>
          </div>
        )}
        <div>
          <dt className="text-ink-faint">Enganche</dt>
          <dd className="text-sky2">{pct(enganchePct)}</dd>
        </div>
        <div>
          <dt className="text-ink-faint">Enganche en pesos</dt>
          <dd className="text-gold">{formatMXN(enganche)}</dd>
        </div>
        <div>
          <dt className="text-ink-faint">Monto a financiar</dt>
          <dd className="text-ink">{formatMXN(montoACredito)}</dd>
        </div>
      </dl>

      <table className="hidden w-full text-left text-xs sm:table">
        <thead className="text-ink-faint">
          <tr className="border-b border-white/10">
            <th className="py-2 pr-3 font-medium">Plazo</th>
            <th className="py-2 pr-3 font-medium">Enganche</th>
            <th className="py-2 text-right font-medium">Parcialidad</th>
          </tr>
        </thead>
        <tbody>
          {filas.map((f) => (
            <tr key={f.plazo} className="border-b border-white/5">
              <td className="py-2 pr-3 text-ink">
                {f.plazo} {esquema.termUnit}
              </td>
              <td className="py-2 pr-3 text-ink-muted">
                <span className="font-medium text-ink">{pct(enganchePct)}</span> ·{' '}
                {formatMXN0(enganche)}
              </td>
              <td className="py-2 text-right">
                <div className="flex flex-col items-end gap-1">
                  <span className="font-semibold text-gold">{formatMXN0(f.pago)}</span>
                  <span className="h-0.5 w-16 overflow-hidden rounded-full bg-white/10">
                    <span
                      className="block h-full rounded-full bg-gradient-to-r from-gold to-gold-light"
                      style={{ width: `${Math.max(6, Math.round((f.pago / pagoMax) * 100))}%` }}
                    />
                  </span>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <ul className="space-y-2 sm:hidden">
        {filas.map((f) => (
          <li key={f.plazo} className="rounded-lg bg-navy-900/50 px-3 py-2">
            <div className="flex items-baseline justify-between">
              <span className="text-xs text-ink">
                {f.plazo} {esquema.termUnit}
              </span>
              <span className="text-sm font-semibold text-gold">{formatMXN0(f.pago)}</span>
            </div>
            <p className="text-[11px] text-ink-faint">
              Enganche: {pct(enganchePct)} · {formatMXN0(enganche)}
            </p>
            <span className="mt-1 block h-0.5 w-full overflow-hidden rounded-full bg-white/10">
              <span
                className="block h-full rounded-full bg-gradient-to-r from-gold to-gold-light"
                style={{ width: `${Math.max(6, Math.round((f.pago / pagoMax) * 100))}%` }}
              />
            </span>
          </li>
        ))}
      </ul>

      <p className="mt-4 border-t border-white/5 pt-3 text-[10px] text-ink-faint">
        Cotización generada el {formatDate(Date.now())} · Prospect Team · Dinamo Saltillo.
        Sujeta a autorización de crédito.
      </p>
    </div>
  );
});

export default Cotizacion;
