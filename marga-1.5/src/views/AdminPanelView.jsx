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
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { useData } from '../context/DataContext.jsx';
import { canViewAdminPanel } from '../lib/permissions.js';
import { sellerColor, UNASSIGNED_COLOR } from '../lib/constants.js';
import { fromDateInput, toDateInput, formatDate, formatDateTime } from '../lib/format.js';
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
} from '../lib/analytics.js';
import Card from '../components/ui/Card.jsx';
import Button from '../components/ui/Button.jsx';
import Input from '../components/ui/Input.jsx';
import Avatar from '../components/ui/Avatar.jsx';
import BarChart from '../components/charts/BarChart.jsx';
import LineChart from '../components/charts/LineChart.jsx';
import DonutChart from '../components/charts/DonutChart.jsx';
import HBarChart from '../components/charts/HBarChart.jsx';

const DAY = 86_400_000;

/** Quick ranges, as [desde, hasta] values for the date inputs. */
function quickRange(id) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  if (id === 'hoy') return [today, today];
  if (id === 'semana') return [today - 6 * DAY, today];
  if (id === 'mes') return [new Date(now.getFullYear(), now.getMonth(), 1).getTime(), today];
  if (id === 'trimestre') return [new Date(now.getFullYear(), now.getMonth() - 2, 1).getTime(), today];
  return [null, null]; // 'todo'
}

const QUICK = [
  { id: 'hoy', label: 'Hoy' },
  { id: 'semana', label: '7 días' },
  { id: 'mes', label: 'Este mes' },
  { id: 'trimestre', label: '3 meses' },
  { id: 'todo', label: 'Todo' },
];

function StatCard({ icon: Icon, label, value, hint, tone = 'sky' }) {
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
      <p className="mt-1 text-2xl font-bold text-ink">{value}</p>
      {hint && <p className="text-[11px] text-ink-faint">{hint}</p>}
    </Card>
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
  const { clients, citas, buroAutorizaciones, sellerColors, sellerAvatars, teamUsernames } =
    useData();
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  // Empty selection means "todo el equipo".
  const [selected, setSelected] = useState([]);

  // Everyone who appears in the data, plus registered users with no activity
  // yet, so a new vendedor is filterable from day one.
  const sellers = useMemo(() => {
    const fromData = presentSellers(clients, citas);
    const merged = new Set(fromData.filter((s) => s !== UNASSIGNED_KEY));
    for (const name of teamUsernames) merged.add(name);
    const list = [...merged].sort((a, b) => a.localeCompare(b));
    return fromData.includes(UNASSIGNED_KEY) ? [...list, UNASSIGNED_KEY] : list;
  }, [clients, citas, teamUsernames]);

  const colorOf = (key) =>
    key === UNASSIGNED_KEY ? UNASSIGNED_COLOR : sellerColor(key, sellerColors);
  // The unassigned bucket is not a person, so it never carries a picture.
  const avatarOf = (key) => (key === UNASSIGNED_KEY ? '' : sellerAvatars[key]);

  const { from, to } = useMemo(
    () => resolveRange(fromDateInput(desde), fromDateInput(hasta), clients, citas),
    [desde, hasta, clients, citas],
  );

  const rows = useMemo(
    () => sellerStats(clients, citas, from, to, selected.length ? selected : sellers),
    [clients, citas, from, to, selected, sellers],
  );
  const totals = useMemo(() => sumTotals(rows), [rows]);

  const activeSellers = selected.length ? selected : sellers;
  const series = useMemo(
    () => timeSeries(clients, from, to, activeSellers),
    [clients, from, to, activeSellers],
  );
  const funnel = useMemo(() => stageFunnel(clients, activeSellers), [clients, activeSellers]);
  const rechazos = useMemo(
    () => rejectionNotes(clients, from, to, activeSellers),
    [clients, from, to, activeSellers],
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
    const [d, h] = quickRange(id);
    setDesde(d ? toDateInput(d) : '');
    setHasta(h ? toDateInput(h) : '');
  }

  const rangeActive = !!(desde || hasta);
  const barGroups = rows.map((r) => ({
    label: r.label,
    color: colorOf(r.key),
    values: [r.registros, r.ventas, r.cancelados],
  }));
  const barSeries = [
    { label: 'Registrados', color: '#38BDF8' },
    { label: 'Ventas', color: '#4ADE80' },
    { label: 'Cancelados', color: '#F87171' },
  ];
  const linePoints = series.points.map((p) => ({
    label: bucketLabel(p.start, series.bucket),
    values: [p.registros, p.ventas, p.cancelados],
  }));

  return (
    <div className="h-full overflow-y-auto px-4 py-5 sm:px-6">
      <div className="mx-auto max-w-5xl space-y-4">
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

          <div className="mt-3 flex flex-wrap items-end gap-3 border-t border-white/5 pt-3">
            <span className="mb-2 flex items-center gap-1.5 text-xs font-medium text-ink-muted">
              <CalendarRange size={14} className="text-sky2" /> Periodo
            </span>
            <Input
              label="Inicio (dd/mm/aa)"
              type="date"
              value={desde}
              onChange={(e) => setDesde(e.target.value)}
              className="w-44"
            />
            <Input
              label="Fin (dd/mm/aa)"
              type="date"
              value={hasta}
              onChange={(e) => setHasta(e.target.value)}
              className="w-44"
            />
            <div className="mb-1 flex flex-wrap gap-1.5">
              {QUICK.map((q) => (
                <button
                  key={q.id}
                  onClick={() => applyQuick(q.id)}
                  className="rounded-full bg-white/5 px-3 py-1 text-xs font-medium text-ink-muted transition hover:bg-white/10 hover:text-ink"
                >
                  {q.label}
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
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          <StatCard
            icon={UserPlus}
            label="Prospectos registrados"
            value={totals.registros}
            hint="Alta dentro del periodo"
          />
          <StatCard
            icon={CheckCircle2}
            label="Ventas concretadas"
            value={totals.ventas}
            hint="Por fecha de entrega"
            tone="success"
          />
          <StatCard
            icon={TrendingUp}
            label="Conversión"
            value={`${totals.conversion.toFixed(1)}%`}
            hint="Ventas ÷ registros del periodo"
            tone="gold"
          />
          <StatCard
            icon={XCircle}
            label="Cancelados"
            value={totals.cancelados}
            hint={`${totals.cancelacion.toFixed(1)}% de los registros`}
            tone="danger"
          />
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
        </div>

        {/* ---------------- Comparativa por vendedor ---------------- */}
        <Section
          title="Comparativa por vendedor"
          hint="Registros, ventas y cancelaciones dentro del periodo"
        >
          {rows.length === 0 ? (
            <p className="py-6 text-center text-xs text-ink-faint">
              No hay vendedores que mostrar.
            </p>
          ) : (
            <>
              <BarChart groups={barGroups} series={barSeries} />
              <div className="mt-2 flex flex-wrap justify-center gap-4 text-[11px] text-ink-muted">
                {barSeries.map((s) => (
                  <span key={s.label} className="flex items-center gap-1.5">
                    <span
                      className="h-2.5 w-2.5 rounded-sm"
                      style={{ backgroundColor: s.color }}
                    />
                    {s.label}
                  </span>
                ))}
                <span className="text-ink-faint">
                  (la primera barra usa el color del vendedor)
                </span>
              </div>
            </>
          )}
        </Section>

        {/* ---------------- Evolución ---------------- */}
        <Section
          title="Evolución en el tiempo"
          hint={`Agrupado por ${series.bucket === 'dia' ? 'día' : series.bucket === 'semana' ? 'semana' : 'mes'}`}
        >
          <LineChart
            points={linePoints}
            series={[
              { label: 'Registrados', color: '#38BDF8' },
              { label: 'Ventas', color: '#4ADE80' },
              { label: 'Cancelados', color: '#F87171' },
            ]}
          />
          <div className="mt-2 flex flex-wrap justify-center gap-4 text-[11px] text-ink-muted">
            {['Registrados', 'Ventas', 'Cancelados'].map((label, i) => (
              <span key={label} className="flex items-center gap-1.5">
                <span
                  className="h-0.5 w-4"
                  style={{ backgroundColor: ['#38BDF8', '#4ADE80', '#F87171'][i] }}
                />
                {label}
              </span>
            ))}
          </div>
        </Section>

        {/* ---------------- Reparto y embudo ---------------- */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Section title="Reparto de registros" hint="Prospectos capturados en el periodo">
            <DonutChart
              slices={rows.map((r) => ({
                label: r.label,
                value: r.registros,
                color: colorOf(r.key),
              }))}
              centerLabel="registros"
            />
          </Section>

          <Section
            title="Embudo por etapa"
            hint="Posición actual de la cartera"
            right={
              <span
                className="flex items-center gap-1 text-[11px] text-ink-faint"
                title="Marga no guarda el historial de movimientos entre columnas, así que este embudo muestra dónde están las tarjetas hoy, sin filtrar por fechas."
              >
                <Info size={12} /> Sin filtro de fecha
              </span>
            }
          >
            <HBarChart
              rows={funnel.map((f) => ({
                label: f.label,
                value: f.count,
                color: f.section === 'prospectos' ? '#38BDF8' : '#FFD11A',
              }))}
              emptyText="La cartera de los vendedores seleccionados está vacía."
            />
          </Section>
        </div>

        {/* ---------------- Tabla resumen ---------------- */}
        <Section title="Detalle por vendedor">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[620px] text-left text-xs">
              <thead className="text-ink-faint">
                <tr className="border-b border-white/10">
                  <th className="py-2 pr-3 font-medium">Vendedor</th>
                  <th className="py-2 pr-3 text-right font-medium">Registros</th>
                  <th className="py-2 pr-3 text-right font-medium">Ventas</th>
                  <th className="py-2 pr-3 text-right font-medium">Conversión</th>
                  <th className="py-2 pr-3 text-right font-medium">Cancelados</th>
                  <th className="py-2 pr-3 text-right font-medium">Citas</th>
                  <th className="py-2 pr-3 text-right font-medium">Cartera</th>
                  <th className="py-2 text-right font-medium">Autorizaciones</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.key} className="border-b border-white/5">
                    <td className="py-2 pr-3">
                      <span className="flex items-center gap-2">
                        {avatarOf(r.key) ? (
                          <Avatar
                            photo={avatarOf(r.key)}
                            name={r.label}
                            color={colorOf(r.key)}
                            size={20}
                          />
                        ) : (
                          <span
                            className="h-2.5 w-2.5 shrink-0 rounded-full"
                            style={{ backgroundColor: colorOf(r.key) }}
                          />
                        )}
                        <span className="text-ink">{r.label}</span>
                      </span>
                    </td>
                    <td className="py-2 pr-3 text-right text-ink-muted">{r.registros}</td>
                    <td className="py-2 pr-3 text-right text-state-success">{r.ventas}</td>
                    <td className="py-2 pr-3 text-right text-gold">{r.conversion.toFixed(1)}%</td>
                    <td className="py-2 pr-3 text-right text-state-danger">{r.cancelados}</td>
                    <td className="py-2 pr-3 text-right text-ink-muted">
                      {r.citas}
                      <span className="text-ink-faint"> / {r.citasAtendidas}</span>
                    </td>
                    <td className="py-2 pr-3 text-right text-ink-muted">{r.enProceso}</td>
                    <td className="py-2 text-right text-sky2">
                      {autorizacionCounts.get(r.key) ?? 0}
                    </td>
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
                  <td className="py-2 text-right">{totalAutorizaciones}</td>
                </tr>
              </tfoot>
            </table>
          </div>
          <p className="mt-2 text-[11px] text-ink-faint">
            Citas se muestra como agendadas / atendidas. La conversión compara las ventas
            entregadas contra los prospectos registrados dentro del mismo periodo.
            Autorizaciones cuenta llenados completos de la herramienta Buró Automático,
            independiente de los clientes registrados en el tablero.
          </p>
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
      </div>
    </div>
  );
}
