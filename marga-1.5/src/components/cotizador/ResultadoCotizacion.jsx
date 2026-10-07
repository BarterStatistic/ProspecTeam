import { Calendar, Check, Download } from 'lucide-react';
import { precioEfectivo } from '../../lib/cotizador.js';
import { formatMXN, formatMXN0, formatPct as pct } from '../../lib/format.js';

/**
 * Tarjeta de resultado del cotizador, recalculada en vivo. Misma estructura que
 * el cotizador original: lista de pendientes mientras falten datos; con todo
 * listo, encabezado + chips + tabla de plazos con barra de magnitud + pie con
 * el botón de descarga.
 *
 * Formato del dinero igual que el original: chips con centavos, "+servicio" y
 * renglones de la tabla sin centavos; parcialidades ya redondeadas al peso.
 */
export default function ResultadoCotizacion({
  moto,
  esquema,
  dp,
  dpOk,
  incluyeServicio,
  calculo,
  vendedor,
  onDescargar,
}) {
  if (!calculo) {
    const pendientes = [
      ['Elige un modelo', !!moto],
      ['Elige un esquema de crédito', !!esquema],
      ['Fija el enganche dentro del rango', dpOk],
    ];
    return (
      <div className="m-glass rounded-2xl px-5 py-10 text-center">
        <div className="mx-auto mb-3.5 grid h-[46px] w-[46px] place-items-center rounded-full border border-gold/30 bg-gold/10 text-gold">
          <Calendar size={20} strokeWidth={1.6} />
        </div>
        <p className="mb-4 font-head text-lg font-bold text-ink-muted">Faltan datos para calcular</p>
        <div className="inline-flex flex-col gap-2 text-left">
          {pendientes.map(([label, ok]) => (
            <div key={label} className={`flex items-center gap-2 text-sm ${ok ? 'text-ink-muted' : 'text-ink-faint'}`}>
              <span
                className={`grid h-4 w-4 flex-none place-items-center rounded border ${
                  ok ? 'border-state-success bg-state-success text-navy-900' : 'border-white/20'
                }`}
              >
                {ok && <Check size={10} strokeWidth={4} />}
              </span>
              {label}
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (calculo.error) {
    return (
      <div className="m-glass rounded-2xl p-5">
        <p className="text-sm text-state-danger">No se pudo calcular la cotización. {calculo.error}</p>
      </div>
    );
  }

  const precio = precioEfectivo(moto, incluyeServicio);
  const { enganche, montoACredito, pagos } = calculo;
  const conServicio = incluyeServicio && moto.servicio > 0;
  const pagoMax = Math.max(...Object.values(pagos));
  const fecha = new Date().toLocaleString('es-MX', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  const chips = [
    { l: 'Precio de Lista', v: formatMXN(moto.precio) },
    ...(conServicio ? [{ l: 'Precio Paquete', v: formatMXN(precio), svc: moto.servicio }] : []),
    { l: 'Enganche', v: pct(dp), cls: 'text-sky2-light' },
    { l: 'Monto Enganche', v: formatMXN(enganche), cls: 'text-gold-light' },
    { l: 'A Financiar', v: formatMXN(montoACredito) },
  ];

  return (
    <div className="m-glass overflow-hidden rounded-2xl">
      <div className="border-b border-white/10 p-4 sm:px-5">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-xs text-ink-faint">Cotización para</div>
            <div className="font-head text-[22px] font-extrabold leading-tight text-ink">{moto.nombre}</div>
          </div>
          <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-sky2/40 bg-sky2/15 px-3 py-1 text-xs font-semibold text-sky2-light">
            <span className="h-1.5 w-1.5 rounded-full bg-sky2" aria-hidden="true" />
            {esquema.label}
          </span>
        </div>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(128px,1fr))] gap-2">
          {chips.map((c) => (
            <div key={c.l} className="rounded-lg border border-white/10 bg-navy-900/60 px-3 py-2">
              <div className="text-xs text-ink-faint">{c.l}</div>
              <div className={`break-words font-cifra text-[15px] tabular-nums ${c.cls || 'text-ink'}`}>
                {c.v}{' '}
                {c.svc ? <span className="text-xs text-state-success">+{formatMXN0(c.svc)}</span> : null}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Escritorio: tabla. Móvil: cada plazo es una ficha. */}
      <div className="hidden px-1.5 pb-1 pt-2 sm:block">
        <table className="w-full">
          <thead>
            <tr className="font-cifra text-xs text-ink-faint">
              <th className="px-3 py-2 text-left font-normal">Plazo</th>
              <th className="px-3 py-2 text-left font-normal">Enganche</th>
              <th className="px-3 py-2 text-right font-normal">Parcialidad</th>
            </tr>
          </thead>
          <tbody>
            {esquema.terms.map((t) => (
              <tr key={t} className="transition hover:bg-white/[.03]">
                <td className="rounded-l-lg px-3 py-2.5">
                  <span className="inline-flex items-baseline gap-1.5">
                    <span className="font-head text-lg font-bold leading-none tabular-nums text-sky2-light">{t}</span>
                    <span className="text-xs text-ink-faint">{esquema.termUnit}</span>
                  </span>
                </td>
                <td className="whitespace-nowrap px-3 py-2.5 font-cifra text-[13px] tabular-nums text-ink-muted">
                  <b className="font-medium text-ink">{pct(dp)}</b> · {formatMXN0(enganche)}
                </td>
                <td className="rounded-r-lg px-3 py-2.5">
                  <div className="flex flex-col items-end gap-1">
                    <span className="whitespace-nowrap font-cifra text-[22px] font-medium leading-tight tabular-nums text-gold-light">
                      {formatMXN0(pagos[t])}
                    </span>
                    <Barra valor={pagos[t]} max={pagoMax} className="w-[84px]" />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="space-y-2 px-3.5 pb-1 pt-3 sm:hidden">
        {esquema.terms.map((t) => (
          <li key={t} className="rounded-lg border border-white/10 bg-navy-900/60 px-3.5 py-3">
            <div className="flex items-baseline justify-between gap-3">
              <span className="inline-flex items-baseline gap-1.5">
                <span className="font-head text-lg font-bold leading-none text-sky2-light">{t}</span>
                <span className="text-xs text-ink-faint">{esquema.termUnit}</span>
              </span>
              <span className="font-cifra text-xl font-medium text-gold-light">{formatMXN0(pagos[t])}</span>
            </div>
            <div className="mt-1.5 flex items-baseline justify-between gap-3 font-cifra text-[13px] text-ink-muted">
              <span className="font-sans text-xs text-ink-faint">Enganche</span>
              <span>
                <b className="font-medium text-ink">{pct(dp)}</b> · {formatMXN0(enganche)}
              </span>
            </div>
            <Barra valor={pagos[t]} max={pagoMax} className="mt-2 w-full" />
          </li>
        ))}
      </ul>

      <div className="flex flex-wrap items-end justify-between gap-3.5 border-t border-white/10 p-4 sm:px-5">
        <div className="flex flex-col gap-0.5 text-xs text-ink-faint">
          <span>Parcialidades redondeadas al entero más cercano</span>
          <span className="font-semibold text-gold">
            Cotizado por {vendedor || 'Prospect Team'} · {fecha}
          </span>
          <span>Vigencia de 5 días a partir de la emisión</span>
        </div>
        <button
          type="button"
          onClick={onDescargar}
          className="inline-flex items-center gap-2 whitespace-nowrap rounded-lg bg-gold px-4 py-2.5 font-head text-sm font-bold text-navy-900 transition hover:-translate-y-px hover:bg-gold-light"
        >
          <Download size={14} strokeWidth={2.4} />
          Descargar JPG
        </button>
      </div>
    </div>
  );
}

/** Barra de magnitud: largo proporcional a la parcialidad mayor. Es dato, no adorno. */
function Barra({ valor, max, className = '' }) {
  return (
    <span className={`block h-0.5 overflow-hidden rounded-full bg-white/10 ${className}`} aria-hidden="true">
      <span
        className="block h-full rounded-full bg-gradient-to-r from-gold-dark to-gold-light"
        style={{ width: `${Math.max(6, Math.round((valor / max) * 100))}%` }}
      />
    </span>
  );
}
