import { useEffect, useState } from 'react';
import { Megaphone, Bot, Users, CheckCircle2, AlertTriangle, PlugZap, Info } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { useUI } from '../context/UIContext.jsx';
import { store, storeMode } from '../lib/store/index.js';
import { canViewPublicidad, canUsarBartersito } from '../lib/permissions.js';
import { formatMXN0, formatDate } from '../lib/format.js';
import { cargarPublicidad, resumenPublicidad, hace, AUDITORIA } from '../lib/publicidad.js';
import Card from '../components/ui/Card.jsx';
import MiniBars from '../components/charts/MiniBars.jsx';
import HBarChart from '../components/charts/HBarChart.jsx';

const usd = (n) => `US$${Number(n ?? 0).toFixed(2)}`;

function Kpi({ icon: Icon, label, value, hint }) {
  return (
    <Card className="p-4">
      <p className="flex items-center gap-2 text-xs text-ink-muted">
        <Icon size={14} className="text-sky2" />
        {label}
      </p>
      <p className="mt-1 font-head text-[28px] font-extrabold leading-tight tabular-nums text-ink">{value}</p>
      {hint && <p className="text-[11px] text-ink-faint">{hint}</p>}
    </Card>
  );
}

function Panel({ title, hint, children, className = '' }) {
  return (
    <Card className={`p-4 ${className}`}>
      <div className="mb-3 flex flex-wrap items-baseline gap-x-2.5">
        <h3 className="font-head text-[15.5px] font-bold text-ink">{title}</h3>
        {hint && <p className="text-xs text-ink-faint">{hint}</p>}
      </div>
      {children}
    </Card>
  );
}

function Nota({ icon: Icon = Info, tono = 'text-ink-faint', children }) {
  return (
    <p className="mt-3 flex items-start gap-2 rounded-[10px] bg-navy-700 px-3 py-2 text-[12.5px] text-ink-muted">
      <Icon size={15} className={`mt-px shrink-0 ${tono}`} />
      <span>{children}</span>
    </p>
  );
}

/** Resumen fijo de la auditoría: se muestra con o sin conexión a la agencia. */
function Auditoria() {
  return (
    <Panel title="Auditoría del ecosistema Dinamo" hint={`${AUDITORIA.fecha} · Marga, Alex 3.2 y la agencia`}>
      <blockquote className="mb-3 max-w-[62ch] font-head text-[17px] font-bold leading-snug text-ink">
        {AUDITORIA.hallazgo}
      </blockquote>
      <div className="mb-4 grid grid-cols-2 gap-2 md:grid-cols-4">
        {AUDITORIA.datos.map((d) => (
          <div key={d.texto} className="rounded-[10px] bg-navy-700 px-3 py-2.5">
            <p className="font-head text-[22px] font-extrabold tabular-nums text-ink">{d.valor}</p>
            <p className="text-xs text-ink-muted">{d.texto}</p>
          </div>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <div>
          <p className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-ink-faint">
            De anuncio a venta · {AUDITORIA.periodo}
          </p>
          <HBarChart rows={AUDITORIA.embudo.map((f) => ({ ...f, color: '#56C6FA' }))} />
          <Nota icon={AlertTriangle} tono="text-state-warning">
            El corte está entre <b className="text-ink">Docs / Cita</b> y <b className="text-ink">Proceso</b>: 30
            esperaban, 0 habían pasado.
          </Nota>
        </div>
        <div>
          <p className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-ink-faint">
            Plan, en el orden recomendado
          </p>
          <ol className="space-y-1.5">
            {AUDITORIA.plan.map((p) => (
              <li
                key={p.fase}
                className={`border-l-[3px] py-0.5 pl-2.5 text-[12.5px] text-ink-muted ${
                  p.enCurso ? 'border-gold' : 'border-white/10'
                }`}
              >
                <span className="font-semibold text-ink">
                  {p.fase} · {p.titulo}
                </span>
                {p.enCurso && <span className="ml-2 text-[11px] font-semibold text-gold">En curso</span>}
                <span className="block">{p.detalle}</span>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </Panel>
  );
}

const TIPO_EVENTO = {
  alerta: 'text-state-warning',
  idea: 'text-gold',
  propuesta: 'text-gold',
};

/**
 * Publicidad y agencia: lo que cuesta la publicidad y la mini agencia de
 * marketing, y qué regresa. Es la primera etapa del "Centro de mando" de la
 * auditoría. Solo administrador (y la base lo vuelve a comprobar).
 */
export default function PublicidadView() {
  const { role } = useAuth();
  const { openBartersito } = useUI();
  // undefined = cargando · { datos } · { sinConectar } · { error }
  const [estado, setEstado] = useState(undefined);

  useEffect(() => {
    let vivo = true;
    cargarPublicidad(storeMode, store)
      .then((r) => vivo && setEstado(r))
      .catch((err) => vivo && setEstado({ error: err?.message || 'No se pudo leer la publicidad.' }));
    return () => {
      vivo = false;
    };
  }, []);

  if (!canViewPublicidad(role)) return null;

  const fab = canUsarBartersito(role) && (
    <button
      onClick={openBartersito}
      aria-label="Hablar con Bartersito"
      className="fixed bottom-24 right-4 z-20 grid h-[52px] w-[52px] place-items-center rounded-full border border-white/[0.08] bg-navy-700 text-sky2 shadow-card md:hidden"
    >
      <Bot size={24} />
    </button>
  );

  if (estado === undefined) {
    return <p className="py-16 text-center text-sm text-ink-faint">Cargando…</p>;
  }

  if (!estado.datos) {
    return (
      <div className="space-y-3.5 pb-24 md:pb-4">
        <Card className="flex items-start gap-3 p-4">
          <PlugZap size={20} className="mt-0.5 shrink-0 text-state-warning" />
          <div className="text-sm text-ink-muted">
            <p className="font-semibold text-ink">
              {estado.error ? 'No se pudo leer la publicidad' : 'La publicidad todavía no está conectada'}
            </p>
            <p className="mt-1">
              {estado.error ??
                'Falta instalar en la base la función que resume los anuncios y la agencia (supabase/marga_publicidad.sql). En cuanto esté, aquí aparecen el gasto, los leads por anuncio y lo que está pasando.'}
            </p>
          </div>
        </Card>
        <Auditoria />
        {fab}
      </div>
    );
  }

  const d = estado.datos;
  const r = resumenPublicidad(d);
  const conGasto = d.anuncios.filter((a) => a.gasto != null);
  const maxLeads = Math.max(1, ...d.anuncios.map((a) => a.leads));
  const maxCosto = Math.max(0.0001, ...d.costosUsd.map((c) => c.usd));
  const dias = d.gastoPorDia.length;

  return (
    <div className="space-y-3.5 pb-24 md:pb-4">
      <div className="flex flex-wrap items-center gap-2 text-xs text-ink-faint">
        <span className="rounded-lg bg-gold px-3 py-1.5 font-semibold text-navy-900">Últimos {dias} días</span>
        {d.esDemo && (
          <span className="rounded-md border border-dashed border-white/15 px-2 py-0.5">
            Datos de ejemplo (modo demo)
          </span>
        )}
        <span className="ml-auto hidden md:inline">
          {formatDate(d.desde)} → {formatDate(d.hasta)}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2 md:gap-3 lg:grid-cols-4">
        <Kpi
          icon={Megaphone}
          label="Gasto en anuncios"
          value={formatMXN0(d.gastoAnuncios)}
          hint={`Cuenta propia · ${conGasto.length} ${conGasto.length === 1 ? 'anuncio' : 'anuncios'}`}
        />
        <Kpi icon={Bot} label="Costo de la agencia" value={usd(r.costoAgenciaUsd)} hint="IA de los agentes, en dólares" />
        <Kpi
          icon={Users}
          label="Costo por lead"
          value={r.costoPorLead == null ? '—' : formatMXN0(r.costoPorLead)}
          hint={`${r.leadsConGasto} leads de la cuenta propia`}
        />
        <Kpi
          icon={CheckCircle2}
          label="Costo por venta"
          value={r.costoPorVenta == null ? '—' : formatMXN0(r.costoPorVenta)}
          hint={
            r.costoPorVenta == null
              ? 'Sin ventas ligadas a la cuenta propia'
              : 'Ventas ligadas a anuncios de la cuenta propia'
          }
        />
      </div>

      <Card className="grid grid-cols-3 md:grid-cols-5">
        {[
          ['Leads hoy', d.hoy.leads],
          ['Calientes hoy', d.hoy.calientes],
          ['Requieren acción', d.hoy.sinAtender],
          ['Por decidir', d.hoy.porDecidir],
          ['Leads del periodo', d.leads],
        ].map(([k, v]) => (
          <div key={k} className="px-3.5 py-2.5 md:border-l md:border-white/[0.08] md:first:border-l-0">
            <p className="text-[11.5px] text-ink-faint">{k}</p>
            <p className="font-head text-[17px] font-bold tabular-nums text-ink">{v}</p>
          </div>
        ))}
      </Card>

      <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-[1.15fr_1fr]">
        <Panel title="Gasto por día" hint="Cuenta propia de anuncios. Toca una barra para ver el dato.">
          <MiniBars
            label="Anuncios"
            color="#FFD11A"
            total={d.gastoAnuncios}
            unidad="día"
            formato={formatMXN0}
            alto={96}
            points={d.gastoPorDia.map((g) => ({ label: formatDate(g.fecha), value: g.monto }))}
          />
          <p className="mb-1.5 mt-4 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-ink-faint">
            Costo de IA por agente
          </p>
          {d.costosUsd.length === 0 ? (
            <p className="text-xs text-ink-faint">Sin costos registrados en el periodo.</p>
          ) : (
            <ul className="space-y-1.5">
              {d.costosUsd.map((c) => (
                <li key={c.label} className="flex items-center gap-3 text-[12.5px]">
                  <span className="w-32 shrink-0 truncate text-ink-muted">{c.label}</span>
                  <span className="h-3 min-w-0 flex-1 overflow-hidden rounded bg-navy-700">
                    <span className="block h-full min-w-[3px] rounded bg-sky2" style={{ width: `${(c.usd / maxCosto) * 100}%` }} />
                  </span>
                  <span className="w-16 shrink-0 text-right font-semibold tabular-nums text-ink">{usd(c.usd)}</span>
                </li>
              ))}
            </ul>
          )}
          <Nota>
            El costo de la agencia está en dólares y solo cuenta desde que se empezó a registrar; no se suma al
            gasto en pesos.
          </Nota>
        </Panel>

        <Panel title="En vivo" hint="Lo más reciente">
          {d.enVivo.length === 0 ? (
            <p className="py-6 text-center text-xs text-ink-faint">Sin movimiento reciente.</p>
          ) : (
            <ul>
              {d.enVivo.map((e, i) => (
                <li
                  key={i}
                  className="grid grid-cols-[76px_1fr] gap-2.5 border-b border-white/[0.08] py-2 text-[13px] last:border-0 last:pb-0"
                >
                  <time className="pt-px text-xs text-ink-faint">{hace(e.cuando)}</time>
                  <div className="min-w-0">
                    <p className={`font-semibold ${TIPO_EVENTO[e.tipo] ?? 'text-ink'}`}>{e.titulo}</p>
                    <p className="break-words text-[12.5px] text-ink-muted">{e.detalle}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
          {d.hoy.porDecidir > 0 && <Nota>Las ideas y propuestas se aprueban desde Telegram, con sus botones.</Nota>}
        </Panel>
      </div>

      <Panel title="Por anuncio" hint="Leads que trajo cada uno y, cuando se conoce, cuánto costó">
        <div className="grid grid-cols-[1fr_52px_64px_64px] items-center gap-x-2.5 text-[13px] tabular-nums md:grid-cols-[1.4fr_1fr_60px_76px_60px_84px_84px]">
          <span className="pb-2 text-[11.5px] font-semibold text-ink-faint">Anuncio</span>
          <span className="hidden md:block" />
          <span className="pb-2 text-right text-[11.5px] font-semibold text-ink-faint">Leads</span>
          <span className="hidden pb-2 text-right text-[11.5px] font-semibold text-ink-faint md:block">Calientes</span>
          <span className="hidden pb-2 text-right text-[11.5px] font-semibold text-ink-faint md:block">Ventas</span>
          <span className="pb-2 text-right text-[11.5px] font-semibold text-ink-faint">Gasto</span>
          <span className="pb-2 text-right text-[11.5px] font-semibold text-ink-faint">Por lead</span>
          {d.anuncios.map((a, i) => (
            <div key={i} className="contents">
              <span className="min-w-0 border-t border-white/[0.08] py-2.5">
                <b className="block truncate font-semibold text-ink" title={a.nombre}>
                  {a.nombre}
                </b>
                {a.externo && <span className="text-[11px] text-ink-faint">Cuenta interna de Dinamo</span>}
              </span>
              <span className="hidden border-t border-white/[0.08] py-2.5 md:block">
                <span className="block h-2 rounded bg-navy-700">
                  <span className="block h-full rounded bg-sky2" style={{ width: `${(a.leads / maxLeads) * 100}%` }} />
                </span>
              </span>
              <span className="border-t border-white/[0.08] py-2.5 text-right font-semibold text-ink">{a.leads}</span>
              <span className="hidden border-t border-white/[0.08] py-2.5 text-right text-ink-muted md:block">{a.calientes}</span>
              <span className="hidden border-t border-white/[0.08] py-2.5 text-right text-ink-muted md:block">{a.ventas}</span>
              <span className="border-t border-white/[0.08] py-2.5 text-right text-ink-muted">
                {a.gasto == null ? '—' : formatMXN0(a.gasto)}
              </span>
              <span className="border-t border-white/[0.08] py-2.5 text-right font-semibold text-ink">
                {a.gasto == null || !a.leads ? '—' : formatMXN0(a.gasto / a.leads)}
              </span>
            </div>
          ))}
        </div>
        {r.leadsExternos > 0 && (
          <Nota icon={AlertTriangle} tono="text-state-warning">
            <b className="text-ink">{r.leadsExternos}</b> de los {d.leads} leads llegaron de anuncios de la cuenta
            interna de Dinamo. Su gasto no se puede leer, así que aparecen con “—” y no entran en el costo por
            lead.
          </Nota>
        )}
      </Panel>

      <Panel title="Agentes" hint="Última vez que trabajó cada uno">
        {d.agentes.length === 0 ? (
          <p className="text-xs text-ink-faint">Sin corridas registradas.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {d.agentes.map((a) => (
              <span key={a.nombre} className="flex items-center gap-2 rounded-[10px] bg-navy-700 px-3 py-2 text-[12.5px]">
                <b className="text-ink">{a.nombre}</b>
                <span className="text-ink-faint">{hace(a.ultima)}</span>
              </span>
            ))}
          </div>
        )}
      </Panel>

      <Auditoria />
      {fab}
    </div>
  );
}
