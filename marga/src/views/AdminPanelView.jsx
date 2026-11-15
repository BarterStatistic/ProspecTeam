import { useMemo, useState } from 'react';
import {
  CalendarRange,
  X,
  Users,
  UserPlus,
  CheckCircle2,
  XCircle,
  TrendingUp,
  CalendarClock,
  Layers,
  Info,
  ShieldCheck,
  Wallet,
  Banknote,
  UserCog,
  Bot,
  AlertTriangle,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { useData } from '../context/DataContext.jsx';
import { canViewAdminPanel, canViewPublicidad, canUsarBartersito } from '../lib/permissions.js';
import { useUI } from '../context/UIContext.jsx';
import { AUTO_TRANSITIONS, sellerColor, UNASSIGNED_COLOR } from '../lib/constants.js';
import { fromDateInput, toDateInput, formatDate, formatDateTime, formatMXN } from '../lib/format.js';
import { fechaPago, mesVenta, periodoPorClave, etiquetaMes } from '../lib/comisiones.js';
import {
  UNASSIGNED_KEY,
  sellerLabel,
  presentSellers,
  resolveRange,
  sellerStats,
  totals as sumTotals,
  timeSeries,
  bucketLabel,
  stageFunnel,
  rejectionNotes,
  authorizationStats,
  cotizacionStats,
  startOfThisWeek,
  endOfThisWeek,
  rangoPagos,
  inRange,
} from '../lib/analytics.js';
import Card from '../components/ui/Card.jsx';
import Button from '../components/ui/Button.jsx';
import Input from '../components/ui/Input.jsx';
import Avatar from '../components/ui/Avatar.jsx';
import MiniBars from '../components/charts/MiniBars.jsx';
import PublicidadView from './PublicidadView.jsx';
import HBarChart from '../components/charts/HBarChart.jsx';
import ReglasPagoCard from '../components/admin/ReglasPagoCard.jsx';
import MesesVentaCard from '../components/admin/MesesVentaCard.jsx';
import LeadsSinTocarCard from '../components/admin/LeadsSinTocarCard.jsx';

const DAY = 86_400_000;

/** Quick ranges, as [desde, hasta] values for the date inputs. */
function quickRange(id, config) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  if (id === 'hoy') return [today, today];
  // Lunes a domingo: los pagos caen en viernes, así que cortar en "hoy"
  // dejaba los KPIs de dinero en $0 de lunes a jueves.
  if (id === 'semana_actual') return [startOfThisWeek(), endOfThisWeek()];
  if (id === 'semana') return [today - 6 * DAY, today];
  if (id === 'mes') {
    // "Este mes" = el mes de venta en curso que registró el admin (abajo, en
    // Meses de venta); si no hay uno que cubra hoy, el mes de calendario.
    const periodo = periodoPorClave(mesVenta(now.getTime(), config), config);
    if (periodo && periodo.inicio <= today && today <= periodo.fin) return [periodo.inicio, periodo.fin];
    return [new Date(now.getFullYear(), now.getMonth(), 1).getTime(), today];
  }
  if (id === 'trimestre') return [new Date(now.getFullYear(), now.getMonth() - 2, 1).getTime(), today];
  return [null, null]; // 'todo'
}

const QUICK = [
  { id: 'hoy', label: 'Hoy' },
  { id: 'semana_actual', label: 'Esta semana' },
  { id: 'semana', label: '7 días' },
  { id: 'mes', label: 'Este mes' },
  { id: 'trimestre', label: '3 meses' },
  { id: 'todo', label: 'Todo' },
];

/**
 * Cambio contra el periodo anterior de la misma duración. `invertir` es para
 * medidas donde subir es malo (cancelados). Sin periodo anterior no se pinta.
 */
function Delta({ actual, previo, invertir = false }) {
  if (previo == null) return null;
  if (!previo) {
    return <p className="text-[11px] text-ink-faint">Sin datos del periodo anterior</p>;
  }
  const cambio = ((actual - previo) / previo) * 100;
  if (Math.abs(cambio) < 0.5) {
    return <p className="text-[11px] text-ink-faint">Igual que el periodo anterior</p>;
  }
  const sube = cambio > 0;
  const bueno = invertir ? !sube : sube;
  return (
    <p className="text-[11px] text-ink-faint">
      <span className={`font-semibold ${bueno ? 'text-state-success' : 'text-state-danger'}`}>
        {sube ? '▲' : '▼'} {Math.abs(cambio).toFixed(0)}%
      </span>{' '}
      vs. periodo anterior
    </p>
  );
}

function StatCard({ icon: Icon, label, value, hint, tone = 'sky', delta = null }) {
  const TONES = {
    sky: 'text-sky2',
    gold: 'text-gold',
    success: 'text-state-success',
    danger: 'text-state-danger',
  };
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 text-xs text-ink-muted">
        <Icon size={14} className={TONES[tone]} />
        {label}
      </div>
      <p className="mt-1 font-head text-[28px] font-extrabold leading-tight tabular-nums text-ink">{value}</p>
      {delta}
      {hint && <p className="text-[11px] text-ink-faint">{hint}</p>}
    </Card>
  );
}

/**
 * Grupo de KPIs con su subtítulo. Separa lo que mide el embudo de lo que mide
 * la operación y el dinero: en una sola cuadrícula de 10 tarjetas todo pesaba
 * igual y la última quedaba sola en su renglón.
 */
function KpiGroup({ title, gridClassName, children }) {
  return (
    <section>
      <h2 className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
        {title}
      </h2>
      <div className={`grid gap-3 ${gridClassName}`}>{children}</div>
    </section>
  );
}

function Section({ title, hint, children, right }) {
  return (
    <Card className="p-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-ink">{title}</h3>
          {hint && <p className="text-[11px] text-ink-faint">{hint}</p>}
        </div>
        {right}
      </div>
      {children}
    </Card>
  );
}

export default function AdminPanelView() {
  const { role } = useAuth();
  const {
    clients,
    citas,
    buroAutorizaciones,
    comisiones,
    cotizaciones,
    configComisiones,
    sellerColors,
    sellerAvatars,
    teamUsernames,
    promotorUsernames,
  } = useData();
  const [desde, setDesde] = useState(() => toDateInput(startOfThisWeek()));
  const [hasta, setHasta] = useState(() => toDateInput(endOfThisWeek()));
  // Empty selection means "todo el equipo".
  const [selected, setSelected] = useState([]);
  // '' significa "todos los promotores".
  const [promotorSel, setPromotorSel] = useState('');
  // Pestaña del panel: ventas y equipo, o publicidad y agencia (solo admin).
  const [pestana, setPestana] = useState('ventas');
  const { openBartersito } = useUI();

  // Everyone who appears in the data, plus registered users with no activity
  // yet, so a new vendedor is filterable from day one. El bucket "Sin asignar"
  // se omite: el dueño del negocio pidió que no aparezca en ningún lado.
  const sellers = useMemo(() => {
    const fromData = presentSellers(clients, citas, { incluirSinAsignar: false });
    const merged = new Set(fromData);
    for (const name of teamUsernames) merged.add(name);
    return [...merged].sort((a, b) => a.localeCompare(b));
  }, [clients, citas, teamUsernames]);

  const colorOf = (key) =>
    key === UNASSIGNED_KEY ? UNASSIGNED_COLOR : sellerColor(key, sellerColors);
  // The unassigned bucket is not a person, so it never carries a picture.
  const avatarOf = (key) => (key === UNASSIGNED_KEY ? '' : sellerAvatars[key]);

  const { from, to } = useMemo(
    () => resolveRange(fromDateInput(desde), fromDateInput(hasta), clients, citas),
    [desde, hasta, clients, citas],
  );

  // Clientes recortados por el promotor encargado, antes de alimentar
  // cualquier estadística que dependa de la cartera.
  const clientesFiltrados = useMemo(
    () =>
      promotorSel ? clients.filter((c) => c.promotorEncargado === promotorSel) : clients,
    [clients, promotorSel],
  );

  const rows = useMemo(
    () => sellerStats(clientesFiltrados, citas, from, to, selected.length ? selected : sellers),
    [clientesFiltrados, citas, from, to, selected, sellers],
  );
  const totals = useMemo(() => sumTotals(rows), [rows]);

  // Periodo anterior de la misma duración, para comparar los KPIs. Solo
  // cuando hay fecha de inicio: "Todo" no tiene un antes con qué compararse.
  const previos = useMemo(() => {
    if (!desde) return null;
    const dur = to - from;
    return sumTotals(
      sellerStats(clientesFiltrados, citas, from - dur - 1, from - 1, selected.length ? selected : sellers),
    );
  }, [desde, clientesFiltrados, citas, from, to, selected, sellers]);

  const activeSellers = selected.length ? selected : sellers;
  const series = useMemo(
    () => timeSeries(clientesFiltrados, from, to, activeSellers),
    [clientesFiltrados, from, to, activeSellers],
  );
  const funnel = useMemo(
    () => stageFunnel(clientesFiltrados, activeSellers),
    [clientesFiltrados, activeSellers],
  );
  const rechazos = useMemo(
    () => rejectionNotes(clientesFiltrados, from, to, activeSellers),
    [clientesFiltrados, from, to, activeSellers],
  );

  // Autorizaciones generadas con el Buró Automático — mismo from/to/selected
  // que el resto de la vista, sin UI de filtro propia.
  const autorizacionCounts = useMemo(
    () => authorizationStats(buroAutorizaciones, from, to, selected),
    [buroAutorizaciones, from, to, selected],
  );
  const totalAutorizaciones = useMemo(
    () => [...autorizacionCounts.values()].reduce((a, b) => a + b, 0),
    [autorizacionCounts],
  );

  // Cotizaciones generadas — misma forma que autorizacionCounts.
  const cotizacionCounts = useMemo(
    () => cotizacionStats(cotizaciones, from, to, selected),
    [cotizaciones, from, to, selected],
  );
  const totalCotizaciones = useMemo(
    () => [...cotizacionCounts.values()].reduce((a, b) => a + b, 0),
    [cotizacionCounts],
  );

  // KPIs de dinero: cuentan por fecha de PAGO derivada, no de facturación, así
  // que "esta semana" muestra lo que sale esta semana, no lo que se facturó.
  // Usan su propio rango (`rangoPagos`), no el `from`/`to` de las demás
  // métricas: sin fecha final no se cortan en hoy, porque los pagos de lo ya
  // facturado caen en el futuro.
  // Respeta también el filtro de promotor, igual que el resto del panel: de lo
  // contrario los KPIs se contradicen con la tabla y las gráficas.
  const pagos = useMemo(
    () => rangoPagos(fromDateInput(desde), fromDateInput(hasta)),
    [desde, hasta],
  );
  const comisionesEnRango = useMemo(() => {
    const activos = selected.length ? new Set(selected) : null;
    return comisiones.filter((c) => {
      if (activos && !activos.has(c.vendedor)) return false;
      if (promotorSel && c.promotor !== promotorSel) return false;
      const pago = fechaPago(c.fechaFacturacion, configComisiones);
      return inRange(pago, pagos.from, pagos.to);
    });
  }, [comisiones, configComisiones, pagos, selected, promotorSel]);

  const dinero = useMemo(
    () =>
      comisionesEnRango.reduce(
        (acc, c) => ({
          ingreso: acc.ingreso + c.comisionTotal,
          neto: acc.neto + c.netoAdmin,
          financiado: acc.financiado + c.montoFinanciado,
        }),
        { ingreso: 0, neto: 0, financiado: 0 },
      ),
    [comisionesEnRango],
  );

  if (!canViewAdminPanel(role)) {
    return (
      <p className="px-2 py-16 text-center text-sm text-ink-faint">
        Solo los administradores pueden abrir el Panel ADMIN.
      </p>
    );
  }

  function toggleSeller(key) {
    setSelected((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  }

  function applyQuick(id) {
    const [d, h] = quickRange(id, configComisiones);
    setDesde(d ? toDateInput(d) : '');
    setHasta(h ? toDateInput(h) : '');
  }

  const rangeActive = !!(desde || hasta);
  const unidad = series.bucket === 'dia' ? 'día' : series.bucket === 'semana' ? 'semana' : 'mes';
  const puntos = (campo) =>
    series.points.map((p) => ({ label: bucketLabel(p.start, series.bucket), value: p[campo] }));
  // Las columnas que solo reenvían a otra sección siempre están vacías.
  const etapas = funnel.filter((f) => !AUTO_TRANSITIONS[f.id]);
  const etapaMayor = etapas.reduce((m, f) => (f.count > (m?.count ?? 0) ? f : m), null);
  const maxRegistros = Math.max(1, ...rows.map((r) => r.registros));

  const pestanas = (
    <div className="flex items-center gap-4 border-b border-white/[0.08]">
      {[
        ['ventas', 'Ventas y equipo'],
        ...(canViewPublicidad(role) ? [['publicidad', 'Publicidad y agencia']] : []),
      ].map(([id, label]) => (
        <button
          key={id}
          onClick={() => setPestana(id)}
          aria-current={pestana === id ? 'page' : undefined}
          className={`-mb-px whitespace-nowrap border-b-2 px-0.5 py-2.5 text-sm font-semibold transition ${
            pestana === id ? 'border-gold text-ink' : 'border-transparent text-ink-faint hover:text-ink-muted'
          }`}
        >
          {label}
        </button>
      ))}
      {canUsarBartersito(role) && (
        <Button variant="outline" size="sm" onClick={openBartersito} className="ml-auto hidden md:inline-flex">
          <Bot size={15} className="text-sky2" /> Hablar con Bartersito
        </Button>
      )}
    </div>
  );

  if (pestana === 'publicidad' && canViewPublicidad(role)) {
    return (
      <div className="h-full overflow-y-auto px-3 py-3 sm:px-6 md:py-5">
        <div className="mx-auto max-w-6xl space-y-3.5">
          {pestanas}
          <PublicidadView />
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto px-3 py-3 sm:px-6 md:py-5">
      <div className="mx-auto max-w-6xl space-y-3.5">
        {pestanas}
        {/* ---------------- Filters ---------------- */}
        <Card className="p-4">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-1 flex items-center gap-1.5 text-xs font-medium text-ink-faint">
              <Users size={14} className="text-sky2" /> Vendedor:
            </span>
            <button
              onClick={() => setSelected([])}
              className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                selected.length === 0
                  ? 'bg-gold/20 text-gold'
                  : 'bg-white/5 text-ink-muted hover:bg-white/10 hover:text-ink'
              }`}
            >
              Todo el equipo
            </button>
            {sellers.map((key) => {
              const on = selected.includes(key);
              const color = colorOf(key);
              const photo = avatarOf(key);
              return (
                <button
                  key={key}
                  onClick={() => toggleSeller(key)}
                  aria-pressed={on}
                  className={`flex items-center gap-1.5 rounded-full py-1 pr-3 text-xs font-medium transition ${
                    photo ? 'pl-1' : 'pl-3'
                  } ${on ? 'text-ink' : 'text-ink-muted hover:text-ink'}`}
                  style={{ backgroundColor: on ? `${color}33` : 'rgba(255,255,255,0.05)' }}
                >
                  {photo ? (
                    <Avatar photo={photo} name={sellerLabel(key)} color={color} size={18} />
                  ) : (
                    <span
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ backgroundColor: color }}
                    />
                  )}
                  {sellerLabel(key)}
                </button>
              );
            })}
          </div>

          {promotorUsernames.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-white/5 pt-3">
              <span className="mr-1 flex items-center gap-1.5 text-xs font-medium text-ink-faint">
                <UserCog size={14} className="text-sky2" /> Promotor:
              </span>
              <button
                onClick={() => setPromotorSel('')}
                className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                  promotorSel === ''
                    ? 'bg-gold/20 text-gold'
                    : 'bg-white/5 text-ink-muted hover:bg-white/10 hover:text-ink'
                }`}
              >
                Todos
              </button>
              {promotorUsernames.map((name) => {
                const on = promotorSel === name;
                const color = sellerColor(name, sellerColors);
                const photo = sellerAvatars[name];
                return (
                  <button
                    key={name}
                    onClick={() => setPromotorSel(on ? '' : name)}
                    aria-pressed={on}
                    className={`flex items-center gap-1.5 rounded-full py-1 pr-3 text-xs font-medium transition ${
                      photo ? 'pl-1' : 'pl-3'
                    } ${on ? 'text-ink' : 'text-ink-muted hover:text-ink'}`}
                    style={{ backgroundColor: on ? `${color}33` : 'rgba(255,255,255,0.05)' }}
                  >
                    {photo ? (
                      <Avatar photo={photo} name={name} color={color} size={18} />
                    ) : (
                      <span
                        className="h-2 w-2 shrink-0 rounded-full"
                        style={{ backgroundColor: color }}
                      />
                    )}
                    {name}
                  </button>
                );
              })}
            </div>
          )}

          <div className="mt-3 flex flex-wrap items-end gap-3 border-t border-white/5 pt-3">
            <span className="mb-2 flex w-full items-center gap-1.5 text-xs font-medium text-ink-muted sm:w-auto">
              <CalendarRange size={14} className="text-sky2" /> Periodo
            </span>
            <Input
              label="Inicio"
              type="date"
              value={desde}
              onChange={(e) => setDesde(e.target.value)}
              className="min-w-0 flex-1 sm:w-44 sm:flex-none"
            />
            <Input
              label="Fin"
              type="date"
              value={hasta}
              onChange={(e) => setHasta(e.target.value)}
              className="min-w-0 flex-1 sm:w-44 sm:flex-none"
            />
            <div className="mb-1 flex flex-wrap gap-1.5">
              {QUICK.map((q) => (
                <button
                  key={q.id}
                  onClick={() => applyQuick(q.id)}
                  className="rounded-full bg-white/5 px-3 py-1 text-xs font-medium text-ink-muted transition hover:bg-white/10 hover:text-ink"
                >
                  {q.id === 'mes' ? etiquetaMes(mesVenta(Date.now(), configComisiones)) : q.label}
                </button>
              ))}
              {rangeActive && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setDesde('');
                    setHasta('');
                  }}
                >
                  <X size={14} /> Limpiar
                </Button>
              )}
            </div>
            <span className="mb-2 ml-auto text-xs text-ink-faint">
              {formatDate(from)} → {formatDate(to)}
            </span>
          </div>
        </Card>

        {/* ---------------- KPIs ---------------- */}
        <KpiGroup title="Embudo" gridClassName="grid-cols-2 lg:grid-cols-4">
            <StatCard
              icon={UserPlus}
              label="Prospectos registrados"
              value={totals.registros}
              delta={previos && <Delta actual={totals.registros} previo={previos.registros} />}
              hint="Alta dentro del periodo"
            />
            <StatCard
              icon={CheckCircle2}
              label="Ventas concretadas"
              value={totals.ventas}
              delta={previos && <Delta actual={totals.ventas} previo={previos.ventas} />}
              hint="Por fecha de entrega"
              tone="success"
            />
            <StatCard
              icon={TrendingUp}
              label="Conversión"
              value={`${totals.conversion.toFixed(1)}%`}
              delta={previos && <Delta actual={totals.conversion} previo={previos.conversion} />}
              hint="Ventas ÷ registros del periodo"
              tone="gold"
            />
            <StatCard
              icon={XCircle}
              label="Cancelados"
              value={totals.cancelados}
              delta={previos && <Delta actual={totals.cancelados} previo={previos.cancelados} invertir />}
              hint={`${totals.cancelacion.toFixed(1)}% de los registros`}
              tone="danger"
            />
        </KpiGroup>

        <KpiGroup title="Operación" gridClassName="grid-cols-2 sm:grid-cols-3">
            <StatCard
              icon={CalendarClock}
              label="Citas agendadas"
              value={totals.citas}
              hint={`${totals.citasAtendidas} atendidas`}
            />
            <StatCard
              icon={Layers}
              label="Cartera activa"
              value={totals.enProceso}
              hint="Prospectos + procesos hoy"
            />
            <StatCard
              icon={ShieldCheck}
              label="Autorizaciones (Buró)"
              value={totalAutorizaciones}
              hint="Llenados completos vía extensión o servicio"
            />
        </KpiGroup>

        <KpiGroup title="Dinero" gridClassName="grid-cols-1 sm:grid-cols-3">
            <StatCard
              icon={Wallet}
              label="Ingreso total global"
              value={formatMXN(dinero.ingreso)}
              hint="Comisiones con fecha de pago dentro del periodo"
              tone="gold"
            />
            <StatCard
              icon={TrendingUp}
              label="Neto admin"
              value={formatMXN(dinero.neto)}
              hint="Total menos vendedor y promotor, por fecha de pago"
              tone="success"
            />
            <StatCard
              icon={Banknote}
              label="Total monto financiado"
              value={formatMXN(dinero.financiado)}
              hint={`${comisionesEnRango.length} pago${comisionesEnRango.length === 1 ? '' : 's'} dentro del periodo`}
            />
        </KpiGroup>

        {/* ---------------- Leads calientes sin tocar (Fase B) ---------------- */}
        <LeadsSinTocarCard />

        {/* ---------------- Evolución y cartera ---------------- */}
        <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-[1.15fr_1fr]">
          <Section
            title="Evolución"
            hint={`Cada medida con su propia escala, por ${unidad}. Toca una barra para ver el dato.`}
          >
            <div className="space-y-4">
              <MiniBars label="Registrados" color="#56C6FA" points={puntos('registros')} total={totals.registros} unidad={unidad} />
              <MiniBars label="Ventas" color="#4ADE80" points={puntos('ventas')} total={totals.ventas} unidad={unidad} />
              <MiniBars label="Cancelados" color="#F87171" points={puntos('cancelados')} total={totals.cancelados} unidad={unidad} />
            </div>
            {series.points.length > 1 && (
              <div className="mt-1.5 flex justify-between text-[10.5px] text-ink-faint md:ml-[130px]">
                <span>{bucketLabel(series.points[0].start, series.bucket)}</span>
                <span>{bucketLabel(series.points[series.points.length - 1].start, series.bucket)}</span>
              </div>
            )}
          </Section>

          <Section
            title="Dónde está la cartera hoy"
            hint="Clientes por etapa"
            right={
              <span
                className="flex items-center gap-1 whitespace-nowrap text-[11px] text-ink-faint"
                title="Marga no guarda el historial de movimientos entre columnas, así que esto muestra dónde están las tarjetas hoy, sin filtrar por fechas."
              >
                <Info size={12} /> Sin filtro de fecha
              </span>
            }
          >
            {[
              ['prospectos', 'Prospectos', '#56C6FA'],
              ['procesos', 'Procesos', '#FFD11A'],
            ].map(([sec, titulo, color]) => (
              <div key={sec} className="mb-3 last:mb-0">
                <p className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-ink-faint">
                  {titulo}
                </p>
                <HBarChart
                  rows={etapas
                    .filter((f) => f.section === sec)
                    .map((f) => ({ label: f.label, value: f.count, color }))}
                  emptyText="Sin clientes en este tablero."
                />
              </div>
            ))}
            {etapaMayor && etapaMayor.count > 0 && (
              <p className="mt-3 flex items-center gap-2 rounded-[10px] bg-navy-700 px-3 py-2 text-[12.5px] text-ink-muted">
                <AlertTriangle size={15} className="shrink-0 text-state-warning" />
                <span>
                  Donde más se acumula: <b className="text-ink">{etapaMayor.label}</b> ({etapaMayor.count}{' '}
                  {etapaMayor.count === 1 ? 'cliente' : 'clientes'})
                </span>
              </p>
            )}
          </Section>
        </div>

        {/* ---------------- Equipo ---------------- */}
        <Section title="Equipo" hint="Ordenado por ventas del periodo">
          {rows.length === 0 ? (
            <p className="py-6 text-center text-xs text-ink-faint">No hay vendedores que mostrar.</p>
          ) : (
            <>
              {/* Computadora: tabla con la barra de registros dentro de la celda. */}
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full min-w-[700px] text-left text-[13px] tabular-nums">
                  <thead className="text-[11.5px] text-ink-faint">
                    <tr className="border-b border-white/10">
                      <th className="py-2 pr-3 font-semibold">Vendedor</th>
                      <th className="py-2 pr-3 text-right font-semibold">Registros</th>
                      <th className="py-2 pr-3 text-right font-semibold">Ventas</th>
                      <th className="py-2 pr-3 text-right font-semibold">Conversión</th>
                      <th className="py-2 pr-3 text-right font-semibold">Cancelados</th>
                      <th className="py-2 pr-3 text-right font-semibold">Citas</th>
                      <th className="py-2 pr-3 text-right font-semibold">Cartera</th>
                      <th className="py-2 pr-3 text-right font-semibold">Autoriz.</th>
                      <th className="py-2 text-right font-semibold">Cotiz.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.key} className="border-b border-white/5">
                        <td className="py-2.5 pr-3">
                          <span className="flex items-center gap-2 font-semibold text-ink">
                            <Avatar photo={avatarOf(r.key)} name={r.label} color={colorOf(r.key)} size={24} />
                            {r.label}
                          </span>
                        </td>
                        <td className="py-2.5 pr-3">
                          <span className="flex items-center justify-end gap-2">
                            <span className="flex w-28 justify-end">
                              <span
                                className="block h-2 min-w-[3px] rounded bg-sky2"
                                style={{ width: `${(r.registros / maxRegistros) * 100}%` }}
                              />
                            </span>
                            <b className="w-7 text-right text-ink">{r.registros}</b>
                          </span>
                        </td>
                        <td className="py-2.5 pr-3 text-right font-bold text-ink">{r.ventas}</td>
                        <td className="py-2.5 pr-3 text-right">
                          <span className="rounded-full bg-navy-700 px-2 py-0.5 text-xs font-semibold text-ink">
                            {r.conversion.toFixed(1)}%
                          </span>
                        </td>
                        <td className="py-2.5 pr-3 text-right text-ink-muted">{r.cancelados}</td>
                        <td className="py-2.5 pr-3 text-right text-ink-muted">
                          {r.citas}
                          <span className="text-ink-faint"> / {r.citasAtendidas}</span>
                        </td>
                        <td className="py-2.5 pr-3 text-right text-ink-muted">{r.enProceso}</td>
                        <td className="py-2.5 pr-3 text-right text-ink-muted">{autorizacionCounts.get(r.key) ?? 0}</td>
                        <td className="py-2.5 text-right text-ink-muted">{cotizacionCounts.get(r.key) ?? 0}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="font-semibold text-ink">
                      <td className="py-2 pr-3">Total</td>
                      <td className="py-2 pr-3 text-right">{totals.registros}</td>
                      <td className="py-2 pr-3 text-right">{totals.ventas}</td>
                      <td className="py-2 pr-3 text-right">{totals.conversion.toFixed(1)}%</td>
                      <td className="py-2 pr-3 text-right">{totals.cancelados}</td>
                      <td className="py-2 pr-3 text-right">
                        {totals.citas}
                        <span className="text-ink-faint"> / {totals.citasAtendidas}</span>
                      </td>
                      <td className="py-2 pr-3 text-right">{totals.enProceso}</td>
                      <td className="py-2 pr-3 text-right">{totalAutorizaciones}</td>
                      <td className="py-2 text-right">{totalCotizaciones}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* Celular: una tarjeta por vendedor en lugar de una tabla ancha. */}
              <ul className="space-y-2 md:hidden">
                {rows.map((r) => (
                  <li key={r.key} className="rounded-xl bg-navy-700 px-3 py-2.5">
                    <div className="mb-2 flex items-center gap-2 font-semibold text-ink">
                      <Avatar photo={avatarOf(r.key)} name={r.label} color={colorOf(r.key)} size={24} />
                      <span className="min-w-0 flex-1 truncate">{r.label}</span>
                      <span className="rounded-full bg-navy-800 px-2 py-0.5 text-xs">{r.conversion.toFixed(1)}%</span>
                    </div>
                    <div className="grid grid-cols-4 gap-1 tabular-nums">
                      {[
                        ['Registros', r.registros],
                        ['Ventas', r.ventas],
                        ['Cancel.', r.cancelados],
                        ['Citas', r.citas],
                      ].map(([k, v]) => (
                        <div key={k}>
                          <p className="text-[11px] text-ink-faint">{k}</p>
                          <p className="font-head text-[17px] font-bold text-ink">{v}</p>
                        </div>
                      ))}
                    </div>
                    <div className="mt-2 h-1.5 rounded bg-navy-800">
                      <div className="h-full rounded bg-sky2" style={{ width: `${(r.registros / maxRegistros) * 100}%` }} />
                    </div>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-[11px] text-ink-faint">
                Citas: agendadas / atendidas. La conversión compara las ventas entregadas contra los
                prospectos registrados en el mismo periodo. Autorizaciones cuenta llenados completos del
                Buró Automático.
              </p>
            </>
          )}
        </Section>

        {/* ---------------- Motivos de cancelación ---------------- */}
        <Section title="Motivos de cancelación" hint="Notas de rechazo registradas en el periodo">
          {rechazos.length === 0 ? (
            <p className="py-6 text-center text-xs text-ink-faint">
              Sin cancelaciones con nota en el periodo seleccionado.
            </p>
          ) : (
            <ul className="space-y-2">
              {rechazos.map((c) => (
                <li key={c.id} className="rounded-lg bg-navy-900/50 px-3 py-2">
                  <div className="flex flex-wrap items-center gap-x-2 text-[11px] text-ink-faint">
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ backgroundColor: colorOf(c.createdBy || UNASSIGNED_KEY) }}
                    />
                    <span className="font-medium text-ink-muted">
                      {[c.firstName, c.lastName].filter(Boolean).join(' ') || 'Sin nombre'}
                    </span>
                    <span>· {c.createdBy || 'Sin asignar'}</span>
                    <span>· {formatDateTime(c.fechaCancelacion ?? c.updatedAt)}</span>
                  </div>
                  <p className="mt-0.5 whitespace-pre-line text-xs text-ink-muted">
                    {c.notasRechazo}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Section>

        {/* ---------------- Meses de venta (duración de las rachas) ---------------- */}
        <MesesVentaCard />

        {/* ---------------- Reglas de comisiones ---------------- */}
        <ReglasPagoCard />
      </div>
    </div>
  );
}
