import { useEffect, useMemo, useState } from 'react';
import {
  FileCheck2, MessagesSquare, Gavel, CalendarDays, Megaphone, Cpu, AlertTriangle, Flame, RotateCcw, UserX,
  ScrollText, ChevronRight, ExternalLink, PlugZap, Bike,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { useData } from '../context/DataContext.jsx';
import { store, storeMode } from '../lib/store/index.js';
import { colaDelDia, sinAtender } from '../lib/seguimiento.js';
import { sellerColor } from '../lib/constants.js';
import { formatDateTime, formatMXN0 } from '../lib/format.js';
import { hace } from '../lib/publicidad.js';
import { trozosDeResumen } from '../lib/alexIA.js';
import { cargarResumen, totalDecisiones, primeraLinea, ORIGEN_REPORTE } from '../lib/resumenDia.js';
import Card from '../components/ui/Card.jsx';
import PorDecidir from '../components/agencia/PorDecidir.jsx';
import { PropuestasAlexPendientes } from '../components/alex/PropuestaAlex.jsx';

const usd = (n) => (n == null ? '—' : `US$${Number(n).toFixed(2)}`);

const PESTANAS = [
  ['resumen', 'Resumen'],
  ['decisiones', 'Decisiones'],
  ['reportes', 'Reportes'],
  ['equipo', 'Equipo'],
];

function Kpi({ icon: Icon, label, value, hint, tono = 'text-sky2', onClick }) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      onClick={onClick}
      className={`rounded-2xl border border-white/[0.08] bg-navy-800 p-3.5 text-left shadow-card ${
        onClick ? 'transition hover:border-white/20' : ''
      }`}
    >
      <p className="flex items-center gap-1.5 text-[11.5px] text-ink-muted">
        <Icon size={13} className={tono} />
        {label}
      </p>
      <p className="mt-1 font-head text-[24px] font-extrabold leading-tight tabular-nums text-ink">{value}</p>
      {hint && <p className="mt-0.5 text-[11px] leading-snug text-ink-faint">{hint}</p>}
    </Tag>
  );
}

function Bloque({ title, accion, onAccion, children }) {
  return (
    <Card className="flex flex-col p-4">
      <div className="mb-2.5 flex items-center gap-2">
        <h3 className="font-head text-[15px] font-bold text-ink">{title}</h3>
        {onAccion && (
          <button onClick={onAccion} className="ml-auto flex items-center gap-0.5 text-xs font-medium text-sky2-light hover:underline">
            {accion} <ChevronRight size={13} />
          </button>
        )}
      </div>
      {children}
    </Card>
  );
}

function Resumen({ texto }) {
  return (
    <p className="whitespace-pre-line text-[13px] leading-relaxed text-ink-muted">
      {trozosDeResumen(texto).map((t, i) =>
        t.negrita ? <b key={i} className="text-ink">{t.texto}</b> : <span key={i}>{t.texto}</span>,
      )}
    </p>
  );
}

/** Pendientes del equipo por vendedor, en números (el detalle está en la pestaña Equipo). */
function EquipoCorto({ cola, sinAtenderPorVendedor, sellerColors, onVer }) {
  const filas = [
    { icon: AlertTriangle, tono: 'text-state-danger', label: 'Requieren acción', items: cola.urgentes },
    { icon: Flame, tono: 'text-state-danger', label: 'Calientes sin tocar 24 h', items: cola.rezagados },
    { icon: Flame, tono: 'text-orange-400', label: 'Calientes por contactar', items: cola.calientes },
    { icon: RotateCcw, tono: 'text-sky2-light', label: 'Dar seguimiento', items: cola.seguimiento },
  ];
  const porVendedor = (items) => {
    const m = new Map();
    for (const c of items) {
      const v = c.createdBy || 'Sin asignar';
      m.set(v, (m.get(v) ?? 0) + 1);
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  };
  const totalSinAtender = sinAtenderPorVendedor.reduce((n, [, k]) => n + k, 0);
  return (
    <Bloque title="Equipo hoy" accion="Ver clientes" onAccion={onVer}>
      <ul className="space-y-2">
        {[...filas, { icon: UserX, tono: 'text-state-danger', label: 'Sin atender en Prospectos', porV: sinAtenderPorVendedor, total: totalSinAtender }].map((f) => {
          const pv = f.porV ?? porVendedor(f.items);
          const total = f.total ?? f.items.length;
          return (
            <li key={f.label} className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px]">
              <f.icon size={14} className={f.tono} />
              <span className="text-ink-muted">{f.label}</span>
              <span className="font-semibold tabular-nums text-ink">{total}</span>
              <span className="ml-auto flex flex-wrap gap-1">
                {pv.map(([v, n]) => (
                  <span key={v} className="flex items-center gap-1 rounded-full bg-white/5 px-2 py-0.5 text-[11px] text-ink-muted">
                    <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: sellerColor(v === 'Sin asignar' ? '' : v, sellerColors) }} />
                    {v.split(' ')[0]} {n}
                  </span>
                ))}
              </span>
            </li>
          );
        })}
      </ul>
    </Bloque>
  );
}

function CitasCorto({ citasHoy, sinCerrar, onVer }) {
  return (
    <Bloque title="Citas de hoy" accion="Ver" onAccion={onVer}>
      {citasHoy.length === 0 ? (
        <p className="py-3 text-center text-xs text-ink-faint">No hay citas para hoy.</p>
      ) : (
        <ul className="space-y-1.5">
          {citasHoy.slice(0, 6).map((c) => (
            <li key={c.id} className="flex items-baseline gap-2 text-[13px]">
              <span className="w-12 shrink-0 tabular-nums text-ink-faint">
                {c.hasTime ? new Date(c.fechaCita).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }) : '—'}
              </span>
              <span className="min-w-0 truncate text-ink">{c.clientName || 'Sin nombre'}</span>
              {c.motorcycle && (
                <span className="ml-auto flex shrink-0 items-center gap-1 text-[11px] text-ink-faint">
                  <Bike size={11} /> {c.motorcycle}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
      {sinCerrar > 0 && (
        <p className="mt-2 text-[11.5px] text-state-warning">{sinCerrar} citas pasadas sin cerrar.</p>
      )}
    </Bloque>
  );
}

function ReportesCorto({ reportes, onVer }) {
  return (
    <Bloque title="Últimos reportes" accion="Ver todos" onAccion={onVer}>
      {reportes.length === 0 ? (
        <p className="py-3 text-center text-xs text-ink-faint">Todavía no hay reportes.</p>
      ) : (
        <ul className="space-y-2.5">
          {reportes.slice(0, 4).map((r) => (
            <li key={r.id} className="text-[13px]">
              <p className="flex items-baseline gap-2">
                <span className="font-semibold text-ink">{r.titulo}</span>
                <span className="ml-auto shrink-0 text-[11px] text-ink-faint">{hace(r.creado)}</span>
              </p>
              {r.resumen && <p className="line-clamp-2 text-[12px] text-ink-muted">{primeraLinea(r.resumen)}</p>}
            </li>
          ))}
        </ul>
      )}
    </Bloque>
  );
}

function ListaReportes({ reportes }) {
  const [abierto, setAbierto] = useState(reportes[0]?.id ?? null);
  if (reportes.length === 0) return <Card className="p-6 text-center text-sm text-ink-faint">Todavía no hay reportes.</Card>;
  return (
    <Card className="p-4">
      <ul>
        {reportes.map((r) => (
          <li key={r.id} className="border-b border-white/[0.08] py-2.5 last:border-0 last:pb-0">
            <button
              type="button"
              onClick={() => setAbierto(abierto === r.id ? null : r.id)}
              className="flex w-full flex-wrap items-center gap-x-2 text-left"
              aria-expanded={abierto === r.id}
            >
              <ScrollText size={15} className={r.origen === 'supervisor' ? 'text-gold' : 'text-sky2'} />
              <span className="font-semibold text-ink">{r.titulo}</span>
              <span className="text-xs text-ink-faint">
                {ORIGEN_REPORTE[r.origen] ?? r.origen} · {r.creado ? formatDateTime(r.creado) : ''}
              </span>
            </button>
            {abierto === r.id && (
              <div className="mt-2 pl-6">
                {r.url ? (
                  <a href={r.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm text-sky2-light hover:underline">
                    Abrir en Drive <ExternalLink size={13} />
                  </a>
                ) : (
                  <Resumen texto={r.resumen} />
                )}
              </div>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}

/**
 * "Mi día" del administrador: un resumen del día pensado para laptop (sin descuidar el teléfono).
 * Resumen = todo en una mirada; Decisiones, Reportes y Equipo = el detalle de cada parte.
 * `equipo` es la vista de pendientes de clientes de siempre (la misma que ven los vendedores).
 */
export default function MiDiaAdmin({ equipo }) {
  const { user } = useAuth();
  const { clients, citas, sellerColors } = useData();
  const [pestana, setPestana] = useState('resumen');
  const [estado, setEstado] = useState(undefined);
  const [recarga, setRecarga] = useState(0);

  useEffect(() => {
    let vivo = true;
    cargarResumen(storeMode, store)
      .then((r) => vivo && setEstado(r))
      .catch((err) => vivo && setEstado({ error: err?.message || 'No se pudo leer el resumen.' }));
    return () => {
      vivo = false;
    };
  }, [recarga]);

  const cola = useMemo(
    () => colaDelDia(clients, citas, { username: user?.username, esAdmin: true }),
    [clients, citas, user?.username],
  );
  const sinAtenderPorVendedor = useMemo(() => {
    const m = new Map();
    for (const c of clients) {
      if (!sinAtender(c)) continue;
      const v = c.createdBy || 'Sin asignar';
      m.set(v, (m.get(v) ?? 0) + 1);
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [clients]);

  const r = estado?.datos ?? null;
  const decisiones = totalDecisiones(r);
  const fechaLarga = new Date().toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' });
  const fecha = fechaLarga.charAt(0).toUpperCase() + fechaLarga.slice(1);

  const pestanas = (
    <div className="flex items-center gap-4 overflow-x-auto border-b border-white/[0.08]">
      {PESTANAS.map(([id, label]) => (
        <button
          key={id}
          onClick={() => setPestana(id)}
          aria-current={pestana === id ? 'page' : undefined}
          className={`-mb-px flex items-center gap-1.5 whitespace-nowrap border-b-2 px-0.5 py-2.5 text-sm font-semibold transition ${
            pestana === id ? 'border-gold text-ink' : 'border-transparent text-ink-faint hover:text-ink-muted'
          }`}
        >
          {label}
          {id === 'decisiones' && decisiones > 0 && <span className="m-chip bg-gold/20 text-gold">{decisiones}</span>}
        </button>
      ))}
      <span className="ml-auto hidden whitespace-nowrap text-xs text-ink-faint md:inline">{fecha}</span>
    </div>
  );

  let cuerpo;
  if (pestana === 'equipo') {
    cuerpo = equipo;
  } else if (pestana === 'decisiones') {
    cuerpo = (
      <div className="grid grid-cols-1 items-start gap-3.5 lg:grid-cols-2">
        <PorDecidir modo={storeMode} store={store} />
        <PropuestasAlexPendientes onCambio={() => setRecarga((n) => n + 1)} />
      </div>
    );
  } else if (pestana === 'reportes') {
    cuerpo = r ? <ListaReportes reportes={r.reportes} /> : null;
  } else {
    cuerpo = (
      <div className="space-y-3.5">
        <div className="grid grid-cols-2 gap-2 md:grid-cols-3 md:gap-3 xl:grid-cols-6">
          <Kpi
            icon={FileCheck2}
            tono="text-gold"
            label="Aptos con documentos hoy"
            value={r ? r.alex.hoy.aptos : '—'}
            hint={r ? `${r.alex.semana.aptos} en 7 días · ${r.alex.semanaAnterior.aptos} los 7 anteriores` : ''}
          />
          <Kpi
            icon={MessagesSquare}
            label="Conversaciones de Alex hoy"
            value={r ? r.alex.hoy.conversaciones : '—'}
            hint={r ? `${r.alex.hoy.conDocumentos} mandaron documentos` : ''}
          />
          <Kpi
            icon={Gavel}
            tono="text-gold"
            label="Por decidir"
            value={r ? decisiones : '—'}
            hint={r ? `Agencia ${r.decisiones.agencia ?? '—'} · Supervisor ${r.decisiones.alex}` : ''}
            onClick={() => setPestana('decisiones')}
          />
          <Kpi
            icon={CalendarDays}
            tono="text-gold"
            label="Citas hoy"
            value={cola.citasHoy.length}
            hint={cola.citasSinCerrar.length ? `${cola.citasSinCerrar.length} pasadas sin cerrar` : 'Agenda al día'}
          />
          <Kpi
            icon={Megaphone}
            label="Gasto en anuncios ayer"
            value={r ? formatMXN0(r.gasto.ayer) : '—'}
            hint={r ? `${formatMXN0(r.gasto.semana)} en 7 días · ${formatMXN0(r.gasto.mes)} en el mes` : ''}
          />
          <Kpi
            icon={Cpu}
            label="Costo de IA en el mes"
            value={r ? usd(r.ia.agenciaUsdMes + (r.ia.alexUsdMes ?? 0)) : '—'}
            hint={r ? `Agencia ${usd(r.ia.agenciaUsdMes)} · Alex ~${usd(r.ia.alexUsdMes)}${r.ia.alexPreliminar ? ' (preliminar)' : ''}` : ''}
          />
        </div>

        {estado && !estado.datos && (
          <Card className="flex items-start gap-3 p-3.5 text-sm text-ink-muted">
            <PlugZap size={18} className="mt-0.5 shrink-0 text-state-warning" />
            {estado.error ?? 'Falta instalar en la base el resumen del día (supabase/marga_resumen_dia.sql). Lo de clientes y citas sí está al día.'}
          </Card>
        )}

        <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-3">
          <EquipoCorto cola={cola} sinAtenderPorVendedor={sinAtenderPorVendedor} sellerColors={sellerColors} onVer={() => setPestana('equipo')} />
          <CitasCorto citasHoy={cola.citasHoy} sinCerrar={cola.citasSinCerrar.length} onVer={() => setPestana('equipo')} />
          <ReportesCorto reportes={r?.reportes ?? []} onVer={() => setPestana('reportes')} />
        </div>
        {r?.esDemo && <p className="text-[11px] text-ink-faint">Datos de ejemplo (modo demo).</p>}
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto px-3 py-3 sm:px-6 md:py-5">
      <div className="mx-auto max-w-6xl space-y-3.5">
        {pestanas}
        {estado === undefined && pestana !== 'equipo' && pestana !== 'decisiones' ? (
          <p className="py-16 text-center text-sm text-ink-faint">Cargando…</p>
        ) : (
          cuerpo
        )}
      </div>
    </div>
  );
}

