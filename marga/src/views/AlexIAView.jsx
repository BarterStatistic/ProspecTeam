import { useEffect, useState } from 'react';
import { FileCheck2, MessagesSquare, TrendingUp, DollarSign, PlugZap, Info, AlertTriangle, Check, ScrollText } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { store, storeMode } from '../lib/store/index.js';
import { canViewPublicidad } from '../lib/permissions.js';
import { formatDate } from '../lib/format.js';
import {
  cargarAlex, decidirAlex, cambioSemanal, pendientes, trozosDeResumen,
} from '../lib/alexIA.js';
import Card from '../components/ui/Card.jsx';
import MiniBars from '../components/charts/MiniBars.jsx';
import HBarChart from '../components/charts/HBarChart.jsx';
import { Propuesta } from '../components/alex/PropuestaAlex.jsx';

const usd = (n) => `US$${Number(n ?? 0).toFixed(2)}`;
const pct = (n) => (n == null ? '—' : `${n.toLocaleString('es-MX', { maximumFractionDigits: 1 })} %`);

function Kpi({ icon: Icon, label, value, hint, destacado }) {
  return (
    <Card className={`p-4 ${destacado ? 'ring-1 ring-gold/40' : ''}`}>
      <p className="flex items-center gap-2 text-xs text-ink-muted">
        <Icon size={14} className={destacado ? 'text-gold' : 'text-sky2'} />
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

/** El resumen del Supervisor, con sus negritas de Telegram y sin insertar HTML. */
function Resumen({ texto }) {
  return (
    <p className="whitespace-pre-line text-[13px] leading-relaxed text-ink-muted">
      {trozosDeResumen(texto).map((t, i) =>
        t.negrita ? <b key={i} className="text-ink">{t.texto}</b> : <span key={i}>{t.texto}</span>,
      )}
    </p>
  );
}

/**
 * Alex IA: cómo vende Alex (el vendedor de WhatsApp) contra su única medida, clientes aptos
 * que mandan documentación; los reportes del Supervisor de Alex y sus propuestas, que se
 * deciden aquí o en Telegram; y cuánto cuesta Alex al mes. Solo administrador (y la base lo
 * vuelve a comprobar).
 */
export default function AlexIAView() {
  const { role } = useAuth();
  // undefined = cargando · { datos } · { sinConectar } · { error }
  const [estado, setEstado] = useState(undefined);
  const [recarga, setRecarga] = useState(0);
  const [ocupado, setOcupado] = useState(false);
  const [aviso, setAviso] = useState(null);
  const [reporteAbierto, setReporteAbierto] = useState(0);

  useEffect(() => {
    let vivo = true;
    cargarAlex(storeMode, store)
      .then((r) => vivo && setEstado(r))
      .catch((err) => vivo && setEstado({ error: err?.message || 'No se pudo leer el panel de Alex.' }));
    return () => {
      vivo = false;
    };
  }, [recarga]);

  if (!canViewPublicidad(role)) return null;

  if (estado === undefined) {
    return <p className="py-16 text-center text-sm text-ink-faint">Cargando…</p>;
  }

  if (!estado.datos) {
    return (
      <Card className="flex items-start gap-3 p-4">
        <PlugZap size={20} className="mt-0.5 shrink-0 text-state-warning" />
        <div className="text-sm text-ink-muted">
          <p className="font-semibold text-ink">
            {estado.error ? 'No se pudo leer el panel de Alex' : 'El panel de Alex todavía no está conectado'}
          </p>
          <p className="mt-1">
            {estado.error ??
              'Falta instalar en la base las funciones del Supervisor de Alex (supabase/alex_supervisor.sql).'}
          </p>
        </div>
      </Card>
    );
  }

  const d = estado.datos;
  const cambio = cambioSemanal(d);
  const porDecidir = pendientes(d);
  const historial = d.propuestas.filter((p) => p.estado !== 'pendiente');
  const c = d.costos;

  async function onDecidir(p, accion) {
    setOcupado(true);
    setAviso(null);
    const r = await decidirAlex(storeMode, store, { id: p.id, accion });
    setOcupado(false);
    setAviso(r.ok ? { tono: 'ok', texto: r.mensaje ?? 'Listo.' } : { tono: 'error', texto: r.error ?? 'No se pudo decidir.' });
    setRecarga((n) => n + 1);
  }

  const puntos = (k) => d.porDia.map((x) => ({ label: formatDate(x.fecha), value: x[k] }));
  const totalDe = (k) => d.porDia.reduce((a, x) => a + x[k], 0);

  return (
    <div className="space-y-3.5 pb-24 md:pb-4">
      <div className="flex flex-wrap items-center gap-2 text-xs text-ink-faint">
        <span className="rounded-lg bg-gold px-3 py-1.5 font-semibold text-navy-900">Últimos {d.dias} días</span>
        {d.esDemo && (
          <span className="rounded-md border border-dashed border-white/15 px-2 py-0.5">Datos de ejemplo (modo demo)</span>
        )}
        <span className="ml-auto hidden md:inline">Medida: clientes aptos que mandan documentación</span>
      </div>

      <div className="grid grid-cols-2 gap-2 md:gap-3 lg:grid-cols-4">
        <Kpi icon={FileCheck2} destacado label="Aptos con documentos (7 días)" value={d.semana.aptos} hint={cambio.texto} />
        <Kpi
          icon={MessagesSquare}
          label="Conversaciones (7 días)"
          value={d.semana.conversaciones}
          hint={`${d.semana.conDocumentos} mandaron documentos`}
        />
        <Kpi icon={TrendingUp} label="Tasa de aptos con documentos" value={pct(d.semana.pctAptos)} hint="De cada 100 conversaciones" />
        <Kpi
          icon={DollarSign}
          label="Costo de Alex al mes"
          value={c.medido ? usd(c.totalUsdMes) : '—'}
          hint={c.medido ? (c.preliminar ? 'Estimado preliminar (menos de 7 días medidos)' : 'Estimado: IA + WhatsApp') : 'Todavía sin medir'}
        />
      </div>

      <Panel title="Documentos obtenidos por Alex" hint="Por día en que llegó la conversación. Toca una barra para ver el dato.">
        <div className="space-y-4">
          <MiniBars label="Aptos con documentos" color="#FFD11A" total={totalDe('aptos')} unidad="día" alto={84} points={puntos('aptos')} />
          <MiniBars label="Mandaron documentos" color="#56C6FA" total={totalDe('conDocumentos')} unidad="día" points={puntos('conDocumentos')} />
          <MiniBars label="Conversaciones" color="rgba(148,170,210,0.55)" total={totalDe('conversaciones')} unidad="día" points={puntos('conversaciones')} />
        </div>
        <Nota>
          “Aptos” cuenta a quien mandó su INE válida (edad y vigencia revisadas por el sistema) sin requisitos fallidos.
          Se mide así desde el 16 de noviembre de 2026; antes solo se sabe quién mandó documentos.
        </Nota>
      </Panel>

      <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-[1fr_1.15fr]">
        <Panel title="Dónde se quedan" hint="Conversaciones de los últimos 7 días sin documentos, por lo último que dijo Alex">
          <HBarChart
            rows={d.dondeSeQuedaron.map((x) => ({ label: x.label, value: x.value, color: '#56C6FA' }))}
            emptyText="Sin conversaciones detenidas esta semana."
          />
        </Panel>

        <Panel title="Por decidir" hint="Propuestas del Supervisor. También llegan a Telegram; se deciden una sola vez.">
          {aviso && (
            <Nota icon={aviso.tono === 'ok' ? Check : AlertTriangle} tono={aviso.tono === 'ok' ? 'text-state-success' : 'text-state-danger'}>
              {aviso.texto}
            </Nota>
          )}
          {porDecidir.length === 0 ? (
            <p className="py-6 text-center text-xs text-ink-faint">Nada por decidir. El próximo reporte semanal sale el lunes.</p>
          ) : (
            <ul>
              {porDecidir.map((p) => (
                <Propuesta key={p.id} p={p} onDecidir={onDecidir} ocupado={ocupado} />
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <Panel title="Directivas activas" hint="Lo que Alex lee en cada mensaje, aprobado por ti (máximo 8)">
        {d.directivas.length === 0 ? (
          <p className="text-xs text-ink-faint">Todavía no hay directivas. Las propuestas aprobadas aparecen aquí.</p>
        ) : (
          <ol className="space-y-2">
            {d.directivas.map((x, i) => (
              <li key={x.id} className="border-l-[3px] border-gold py-0.5 pl-2.5 text-[13px] text-ink">
                <span className="mr-1.5 font-semibold text-gold">{i + 1}.</span>
                {x.texto}
                <span className="block text-[11.5px] text-ink-faint">
                  Desde {formatDate(x.desde)}
                  {x.motivo ? ` · ${x.motivo}` : ''}
                </span>
              </li>
            ))}
          </ol>
        )}
      </Panel>

      <Panel title="Reportes del Supervisor" hint="Semanal los lunes (con propuestas) y avance los jueves">
        {d.reportes.length === 0 ? (
          <p className="text-xs text-ink-faint">Todavía no hay reportes.</p>
        ) : (
          <ul>
            {d.reportes.map((r, i) => (
              <li key={r.id} className="border-b border-white/[0.08] py-2.5 last:border-0 last:pb-0">
                <button
                  type="button"
                  onClick={() => setReporteAbierto(reporteAbierto === i ? -1 : i)}
                  className="flex w-full items-center gap-2 text-left"
                  aria-expanded={reporteAbierto === i}
                >
                  <ScrollText size={15} className={r.tipo === 'semanal' ? 'text-gold' : 'text-sky2'} />
                  <span className="font-semibold text-ink">{r.tipo === 'semanal' ? 'Reporte semanal' : 'Avance'}</span>
                  <span className="text-xs text-ink-faint">
                    {formatDate(r.desde)} → {formatDate(r.hasta)}
                  </span>
                </button>
                {reporteAbierto === i && (
                  <div className="mt-2 pl-6">
                    <Resumen texto={r.resumen} />
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel title="Costo de Alex" hint="Estimado y proyectado a 30 días, en dólares">
        {!c.medido ? (
          <p className="text-xs text-ink-faint">
            Se empezó a guardar la hora de cada mensaje el 16 de noviembre de 2026. En cuanto Alex conteste, aquí sale el costo.
          </p>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
              <div className="rounded-[10px] bg-navy-700 px-3 py-2.5">
                <p className="text-xs text-ink-muted">Inteligencia artificial</p>
                <p className="font-head text-[22px] font-extrabold tabular-nums text-ink">{usd(c.iaUsdMes)}</p>
                <p className="text-[11px] text-ink-faint">
                  {c.llamadas.toLocaleString('es-MX')} llamadas al modelo, {c.imagenes} imágenes y {c.audios} audios en {c.diasMedidos} días
                </p>
              </div>
              <div className="rounded-[10px] bg-navy-700 px-3 py-2.5">
                <p className="text-xs text-ink-muted">WhatsApp (Meta)</p>
                <p className="font-head text-[22px] font-extrabold tabular-nums text-ink">{usd(c.waUsdMes)}</p>
                <p className="text-[11px] text-ink-faint">
                  ~{c.waMensajesMes.toLocaleString('es-MX')} respuestas al mes; {c.waGratisMes.toLocaleString('es-MX')} gratis,{' '}
                  {c.waCobrablesMes.toLocaleString('es-MX')} se cobrarían
                </p>
              </div>
              <div className="rounded-[10px] bg-navy-700 px-3 py-2.5 ring-1 ring-gold/30">
                <p className="text-xs text-ink-muted">Total al mes</p>
                <p className="font-head text-[22px] font-extrabold tabular-nums text-ink">{usd(c.totalUsdMes)}</p>
                <p className="text-[11px] text-ink-faint">
                  {d.semana.aptos > 0
                    ? `≈ ${usd(c.totalUsdMes / Math.max(1, (d.semana.aptos * 30) / 7))} por cliente apto con documentos`
                    : 'Sin aptos con documentos esta semana para sacar el costo por cliente'}
                </p>
              </div>
            </div>
            <Nota icon={AlertTriangle} tono="text-state-warning">
              Desde el 1 de octubre de 2026 Meta cobra los mensajes de servicio (las respuestas de Alex) después de los
              primeros 1,000 del mes por número. Las respuestas dentro de las 72 h de un cliente que llegó por un anuncio
              de clic a WhatsApp son gratis y no se cuentan.{c.preliminar ? ' Con pocos días medidos la proyección es preliminar.' : ''}
            </Nota>
            <details className="mt-3 text-[12px] text-ink-faint">
              <summary className="cursor-pointer text-ink-muted">Supuestos del cálculo</summary>
              <ul className="mt-2 space-y-1">
                {c.config.map((x) => (
                  <li key={x.clave}>
                    <b className="text-ink-muted">{x.nota || x.clave}:</b> {x.valor.toLocaleString('es-MX')}
                    {x.fuente ? ` · ${x.fuente}` : ''}
                  </li>
                ))}
              </ul>
            </details>
          </>
        )}
      </Panel>

      {historial.length > 0 && (
        <Panel title="Decisiones anteriores" hint="Lo que ya se aprobó, rechazó o caducó">
          <ul>
            {historial.map((p) => (
              <Propuesta key={p.id} p={p} onDecidir={onDecidir} ocupado={ocupado} />
            ))}
          </ul>
        </Panel>
      )}
    </div>
  );
}
