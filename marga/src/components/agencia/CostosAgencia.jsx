import { useEffect, useState } from 'react';
import { PlugZap } from 'lucide-react';
import Modal from '../ui/Modal.jsx';
import { store, storeMode } from '../../lib/store/index.js';
import { formatDate, formatDateTime } from '../../lib/format.js';
import { cargarCostos, rangoRapido, validarRango, usd, tokens } from '../../lib/costosAgencia.js';

const RAPIDOS = [
  ['hoy', 'Hoy'],
  ['7', '7 días'],
  ['30', '30 días'],
  ['mes', 'Este mes'],
  ['90', '90 días'],
];

const VISTAS = [
  ['agente', 'Por agente'],
  ['paso', 'Por paso'],
  ['modelo', 'Por modelo'],
  ['dia', 'Por día'],
  ['detalle', 'Llamadas'],
];

const chip = (activo) =>
  `rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
    activo ? 'bg-gold text-navy-900' : 'bg-navy-700 text-ink-muted hover:text-ink'
  }`;

function Total({ k, v, hint }) {
  return (
    <div className="rounded-[10px] bg-navy-700 px-3 py-2.5">
      <p className="text-[11.5px] text-ink-faint">{k}</p>
      <p className="font-head text-[20px] font-extrabold tabular-nums text-ink">{v}</p>
      {hint && <p className="text-[11px] text-ink-faint">{hint}</p>}
    </div>
  );
}

/** Tabla de grupos (agente / paso / modelo): costo, % del total, llamadas y tokens. */
function TablaGrupos({ filas, total, columnaPaso }) {
  if (!filas.length) return <p className="py-6 text-center text-xs text-ink-faint">Sin costos en estas fechas.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[520px] text-[12.5px]">
        <thead className="text-left text-[11px] uppercase tracking-[0.06em] text-ink-faint">
          <tr>
            <th className="py-1.5 pr-2 font-semibold">{columnaPaso}</th>
            <th className="px-2 text-right font-semibold">Costo</th>
            <th className="px-2 text-right font-semibold">%</th>
            <th className="px-2 text-right font-semibold">Llamadas</th>
            <th className="px-2 text-right font-semibold">Tokens ent.</th>
            <th className="pl-2 text-right font-semibold">Tokens sal.</th>
          </tr>
        </thead>
        <tbody>
          {filas.map((f) => (
            <tr key={`${f.agente ?? ''}|${f.nombre}`} className="border-t border-white/[0.08] text-ink">
              <td className="py-1.5 pr-2">{f.nombre}</td>
              <td className="px-2 text-right font-semibold tabular-nums">{usd(f.usd)}</td>
              <td className="px-2 text-right tabular-nums text-ink-muted">
                {f.usd != null && total > 0 ? `${Math.round((f.usd / total) * 100)}%` : '—'}
              </td>
              <td className="px-2 text-right tabular-nums">{f.llamadas}</td>
              <td className="px-2 text-right tabular-nums">{tokens(f.tokensEntrada)}</td>
              <td className="pl-2 text-right tabular-nums">{tokens(f.tokensSalida)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TablaDias({ dias }) {
  const max = Math.max(0.0001, ...dias.map((d) => d.usd));
  return (
    <ul className="space-y-1">
      {[...dias].reverse().map((d) => (
        <li key={d.fecha} className="flex items-center gap-3 text-[12.5px]">
          <span className="w-28 shrink-0 text-ink-muted">{formatDate(d.fecha)}</span>
          <span className="h-3 min-w-0 flex-1 overflow-hidden rounded bg-navy-700">
            <span className="block h-full rounded bg-sky2" style={{ width: `${(d.usd / max) * 100}%`, minWidth: d.usd > 0 ? 3 : 0 }} />
          </span>
          <span className="w-20 shrink-0 text-right font-semibold tabular-nums text-ink">{usd(d.usd)}</span>
        </li>
      ))}
    </ul>
  );
}

function TablaLlamadas({ filas, total }) {
  if (!filas.length) return <p className="py-6 text-center text-xs text-ink-faint">Sin llamadas en estas fechas.</p>;
  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-[12.5px]">
          <thead className="text-left text-[11px] uppercase tracking-[0.06em] text-ink-faint">
            <tr>
              <th className="py-1.5 pr-2 font-semibold">Cuándo</th>
              <th className="px-2 font-semibold">Agente · paso</th>
              <th className="px-2 font-semibold">Modelo</th>
              <th className="px-2 text-right font-semibold">Tokens ent.</th>
              <th className="px-2 text-right font-semibold">Tokens sal.</th>
              <th className="pl-2 text-right font-semibold">Costo</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((f, i) => (
              <tr key={i} className="border-t border-white/[0.08] text-ink">
                <td className="whitespace-nowrap py-1.5 pr-2 text-ink-muted">{formatDateTime(f.cuando)}</td>
                <td className="px-2">{f.flujo}</td>
                <td className="px-2 text-ink-muted">{f.modelo}</td>
                <td className="px-2 text-right tabular-nums">{tokens(f.tokensEntrada)}</td>
                <td className="px-2 text-right tabular-nums">
                  {f.unidades != null && !f.tokensSalida ? `${tokens(f.unidades)} car.` : tokens(f.tokensSalida)}
                </td>
                <td className="pl-2 text-right font-semibold tabular-nums">{usd(f.usd)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {total > filas.length && (
        <p className="mt-2 text-[11.5px] text-ink-faint">
          Se muestran las {filas.length} llamadas más recientes de {total}. Los totales de arriba sí incluyen todas.
        </p>
      )}
    </>
  );
}

/**
 * Desglose del costo de IA de la agencia, con filtro por fechas. Se abre al tocar el costo en Publicidad.
 * Solo administrador (la base lo vuelve a comprobar).
 */
export default function CostosAgencia({ open, onClose }) {
  const [rango, setRango] = useState(() => rangoRapido('30'));
  const [rapido, setRapido] = useState('30');
  const [vista, setVista] = useState('agente');
  // undefined = cargando · { datos } · { sinConectar } · { error }
  const [estado, setEstado] = useState(undefined);
  const errorRango = validarRango(rango.desde, rango.hasta);

  useEffect(() => {
    if (!open || errorRango) return undefined;
    let vivo = true;
    setEstado(undefined);
    cargarCostos(storeMode, store, rango.desde, rango.hasta)
      .then((r) => vivo && setEstado(r))
      .catch((err) => vivo && setEstado({ error: err?.message || 'No se pudo leer el desglose de costos.' }));
    return () => {
      vivo = false;
    };
  }, [open, rango.desde, rango.hasta, errorRango]);

  const elegirRapido = (clave) => {
    setRapido(clave);
    setRango(rangoRapido(clave));
  };
  const cambiarFecha = (campo) => (e) => {
    setRapido(null);
    setRango((r) => ({ ...r, [campo]: e.target.value }));
  };

  const d = estado?.datos;

  return (
    <Modal open={open} onClose={onClose} title="Costo de la agencia" size="xl">
      <div className="mb-3 flex flex-wrap items-end gap-2">
        {RAPIDOS.map(([k, t]) => (
          <button key={k} type="button" onClick={() => elegirRapido(k)} className={chip(rapido === k)}>
            {t}
          </button>
        ))}
        <label className="ml-auto flex items-center gap-1.5 text-xs text-ink-faint">
          Del
          <input type="date" value={rango.desde} max={rango.hasta || undefined} onChange={cambiarFecha('desde')}
            className="rounded-lg border border-white/10 bg-navy-700 px-2 py-1 text-xs text-ink" />
        </label>
        <label className="flex items-center gap-1.5 text-xs text-ink-faint">
          al
          <input type="date" value={rango.hasta} min={rango.desde || undefined} onChange={cambiarFecha('hasta')}
            className="rounded-lg border border-white/10 bg-navy-700 px-2 py-1 text-xs text-ink" />
        </label>
      </div>

      {errorRango && <p className="py-6 text-center text-sm text-state-warning">{errorRango}</p>}
      {!errorRango && estado === undefined && <p className="py-10 text-center text-sm text-ink-faint">Cargando…</p>}
      {!errorRango && estado && !d && (
        <div className="flex items-start gap-3 py-4 text-sm text-ink-muted">
          <PlugZap size={20} className="mt-0.5 shrink-0 text-state-warning" />
          <p>
            {estado.error ??
              'Falta instalar en la base la función del desglose (supabase/marga_costos_agencia.sql). En cuanto esté, aquí aparece de dónde sale el gasto.'}
          </p>
        </div>
      )}

      {!errorRango && d && (
        <>
          <div className="mb-3 grid grid-cols-2 gap-2 md:grid-cols-4">
            <Total k="Gasto total" v={usd(d.totalUsd)} hint={`${formatDate(d.desde)} → ${formatDate(d.hasta)}`} />
            <Total k="Llamadas a IA" v={d.llamadas} hint={d.sinPrecio ? `${d.sinPrecio} sin precio conocido` : undefined} />
            <Total k="Tokens de entrada" v={tokens(d.tokensEntrada)} />
            <Total k="Tokens de salida" v={tokens(d.tokensSalida)} />
          </div>

          <div className="mb-3 flex flex-wrap gap-1.5">
            {VISTAS.map(([k, t]) => (
              <button key={k} type="button" onClick={() => setVista(k)} className={chip(vista === k)}>
                {t}
              </button>
            ))}
          </div>

          {vista === 'agente' && <TablaGrupos filas={d.porAgente} total={d.totalUsd} columnaPaso="Agente" />}
          {vista === 'paso' && <TablaGrupos filas={d.porPaso} total={d.totalUsd} columnaPaso="Paso" />}
          {vista === 'modelo' && <TablaGrupos filas={d.porModelo} total={d.totalUsd} columnaPaso="Modelo" />}
          {vista === 'dia' && <TablaDias dias={d.porDia} />}
          {vista === 'detalle' && <TablaLlamadas filas={d.detalle} total={d.llamadas} />}

          <p className="mt-3 text-[11.5px] text-ink-faint">
            En dólares, según el precio por modelo guardado en la agencia. Lo que no tiene precio conocido (p. ej. la voz
            de Speko) aparece con “—” y no suma al total.
            {d.esDemo && ' Datos de ejemplo (modo demo).'}
          </p>
        </>
      )}
    </Modal>
  );
}
