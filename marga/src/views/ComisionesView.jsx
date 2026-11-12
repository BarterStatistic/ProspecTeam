import { useMemo, useState } from 'react';
import { Wallet, TrendingUp, Banknote, Flame, Trash2, Pencil, StickyNote, UserCheck } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { useData } from '../context/DataContext.jsx';
import { useUI } from '../context/UIContext.jsx';
import { canViewComisiones, isAdmin } from '../lib/permissions.js';
import { sellerColor } from '../lib/constants.js';
import {
  fechaPago,
  mesVenta,
  periodoPorClave,
  etiquetaMes,
  numeroVentaPara,
  agruparPorPago,
  PROMOTOR_DEFAULT,
  NIVELES_RACHA,
  TASA_PROMOTOR,
  TODO_EL_HISTORICO,
  mesesDisponibles,
} from '../lib/comisiones.js';
import { formatMXN, formatDate, formatDateShort } from '../lib/format.js';
import Card from '../components/ui/Card.jsx';
import Button from '../components/ui/Button.jsx';
import SelectorMes from '../components/ui/SelectorMes.jsx';

const SIN_PROMOTOR = '__sin_promotor__';

function StatCard({ icon: Icon, label, value, hint, tone = 'sky' }) {
  const TONES = { sky: 'text-sky2', gold: 'text-gold', success: 'text-state-success', purple: 'text-purple-300' };
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

/**
 * Estado de pago de una comisión. El admin lo cambia con un toque; el vendedor
 * solo lo consulta. Lo usan la tabla (escritorio) y las tarjetas (celular).
 */
function EstadoPago({ comision, admin, onToggle }) {
  const tono = comision.pagado
    ? 'bg-state-success/15 text-state-success'
    : 'bg-state-warning/15 text-state-warning';
  const texto = comision.pagado ? 'Pagado' : 'Pendiente';
  if (!admin) return <span className={`m-chip ${tono}`}>{texto}</span>;
  return (
    <button
      type="button"
      onClick={() => onToggle(comision.id, !comision.pagado)}
      title={comision.pagado ? 'Marcar como pendiente de pago' : 'Marcar como pagada'}
      className={`m-chip transition ${tono} ${
        comision.pagado ? 'hover:bg-state-success/25' : 'hover:bg-state-warning/25'
      }`}
    >
      {texto}
    </button>
  );
}

export default function ComisionesView() {
  const { role, user } = useAuth();
  const {
    clients,
    comisiones,
    configComisiones,
    eliminarComision,
    marcarPagoComision,
    sellerColors,
    teamUsernames,
    promotorUsernames,
  } = useData();
  const { openFacturacion } = useUI();
  const [filtroVendedor, setFiltroVendedor] = useState('');
  // '' = todos; SIN_PROMOTOR = las que no tienen promotor; o el nombre.
  const [filtroPromotor, setFiltroPromotor] = useState('');
  const admin = isAdmin(role);

  // Mes de venta en curso (los que registra el admin en el Panel ADMIN): su
  // rango es lo que dura la racha y es lo que se ve al entrar.
  const claveHoy = mesVenta(Date.now(), configComisiones);
  const periodoHoy = periodoPorClave(claveHoy, configComisiones);
  const [mes, setMes] = useState(claveHoy);
  const periodoMes = mes === TODO_EL_HISTORICO ? null : periodoPorClave(mes, configComisiones);
  const meses = useMemo(
    () => mesesDisponibles(comisiones.map((c) => c.mesVenta), claveHoy),
    [comisiones, claveHoy],
  );
  // Promotores que se pueden filtrar: los usuarios con ese rol y cualquiera
  // que aparezca en una comisión (p. ej. uno que ya se dio de baja).
  const promotores = useMemo(() => {
    const set = new Set(promotorUsernames);
    for (const c of comisiones) if (c.promotor) set.add(c.promotor);
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [promotorUsernames, comisiones]);

  // Cada comisión con su fecha de pago derivada de la configuración vigente.
  const conPago = useMemo(
    () =>
      comisiones.map((c) => ({ ...c, fechaPagoTs: fechaPago(c.fechaFacturacion, configComisiones) })),
    [comisiones, configComisiones],
  );

  const visibles = useMemo(() => {
    let lista = admin ? conPago : conPago.filter((c) => c.vendedor === user?.username);
    if (mes !== TODO_EL_HISTORICO) lista = lista.filter((c) => c.mesVenta === mes);
    if (admin && filtroVendedor) lista = lista.filter((c) => c.vendedor === filtroVendedor);
    if (admin && filtroPromotor) {
      const buscado = filtroPromotor === SIN_PROMOTOR ? '' : filtroPromotor;
      lista = lista.filter((c) => (c.promotor ?? '') === buscado);
    }
    return lista.sort((a, b) => b.fechaPagoTs - a.fechaPagoTs || b.fechaFacturacion - a.fechaFacturacion);
  }, [conPago, admin, user, filtroVendedor, filtroPromotor, mes]);

  // Con un promotor elegido, los montos por grupo son lo que se le paga a él.
  const verPromotor = admin && filtroPromotor && filtroPromotor !== SIN_PROMOTOR;

  const totales = useMemo(
    () =>
      visibles.reduce(
        (acc, c) => ({
          ingreso: acc.ingreso + c.comisionTotal,
          neto: acc.neto + c.netoAdmin,
          financiado: acc.financiado + c.montoFinanciado,
          vendedor: acc.vendedor + c.comisionVendedor,
          promotor: acc.promotor + (c.comisionPromotor ?? 0),
          conPromotor: acc.conPromotor + (c.promotor ? 1 : 0),
        }),
        { ingreso: 0, neto: 0, financiado: 0, vendedor: 0, promotor: 0, conPromotor: 0 },
      ),
    [visibles],
  );

  // Agrupación por fecha de pago: pendientes del más cercano al más lejano y
  // luego los pasados. Solo el pago pendiente más cercano lleva "Próximo".
  const grupos = useMemo(() => agruparPorPago(visibles, Date.now()), [visibles]);

  function confirmarEliminar(c) {
    if (
      window.confirm(
        `¿Eliminar la comisión de ${c.clienteNombre}? La tarjeta quedará sin facturación.`,
      )
    ) {
      eliminarComision(c.id);
    }
  }


  // Racha del mes en curso, solo para la vista del vendedor.
  const rachaActual = useMemo(() => {
    if (admin || !user?.username) return 0;
    // Ventas que ya lleva = el número que le tocaría a la siguiente, menos uno.
    return numeroVentaPara(conPago, { vendedor: user.username, clave: claveHoy }) - 1;
  }, [admin, user, conPago, claveHoy]);

  if (!canViewComisiones(role)) {
    return (
      <p className="px-2 py-16 text-center text-sm text-ink-faint">
        Los promotores no tienen acceso al panel de Comisiones.
      </p>
    );
  }

  // Reabre el modal de facturación completo (moto, esquema, enganche, punto
  // de racha…) para corregir una venta ya registrada, en vez de un editor
  // aparte que pudiera desincronizar los importes de la fórmula real.
  function editar(comision) {
    const cliente = clients.find((c) => c.id === comision.clienteId);
    if (!cliente) {
      window.alert('El cliente de esta venta ya no existe; no se puede editar la facturación.');
      return;
    }
    openFacturacion(cliente);
  }

  return (
    <div className="h-full overflow-y-auto px-4 py-5 sm:px-6">
      <div className="mx-auto max-w-6xl space-y-4">
        <SelectorMes
          id="mes-comisiones"
          mes={mes}
          meses={meses}
          claveHoy={claveHoy}
          periodo={periodoMes}
          onChange={setMes}
          total={visibles.length}
        />
        {!admin && configComisiones.notaVendedores && (
          <Card className="flex items-start gap-3 border-gold/20 p-4">
            <StickyNote size={16} className="mt-0.5 shrink-0 text-gold" />
            <p className="whitespace-pre-line text-xs text-ink-muted">
              {configComisiones.notaVendedores}
            </p>
          </Card>
        )}

        {!admin && (
          <Card className="p-4">
            <div className="flex items-center gap-2 text-xs text-ink-muted">
              <Flame size={14} className="text-gold" /> Racha de este mes
              <span className="ml-auto text-[11px] text-ink-faint">
                {etiquetaMes(claveHoy)}
                {periodoHoy &&
                  ` · ${formatDateShort(periodoHoy.inicio)} – ${formatDateShort(periodoHoy.fin)}`}
              </span>
            </div>
            <div className="mt-2 flex items-center gap-1.5">
              {NIVELES_RACHA.map((pct, i) => (
                <span
                  key={pct}
                  className={`flex-1 rounded-full py-1 text-center text-[11px] font-semibold transition ${
                    i < rachaActual ? 'bg-gold/20 text-gold' : 'bg-white/5 text-ink-faint'
                  }`}
                >
                  {(pct * 100).toFixed(0)}%
                </span>
              ))}
            </div>
            <p className="mt-2 text-[11px] text-ink-faint">
              {rachaActual >= NIVELES_RACHA.length
                ? '¡Racha completa! 35% + bono mensual'
                : `Llevas ${rachaActual} venta${rachaActual === 1 ? '' : 's'} este mes.`}
            </p>
          </Card>
        )}

        {admin && (
          <>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard
                icon={Wallet}
                label={mes === TODO_EL_HISTORICO ? 'Ingreso total global' : `Ingreso de ${etiquetaMes(mes)}`}
                value={formatMXN(totales.ingreso)}
                hint="Suma de comisiones totales"
              />
              <StatCard
                icon={TrendingUp}
                label="Neto admin"
                value={formatMXN(totales.neto)}
                hint="Total menos vendedor y promotor"
                tone="gold"
              />
              <StatCard
                icon={Banknote}
                label="Total monto financiado"
                value={formatMXN(totales.financiado)}
                hint={`${visibles.length} venta${visibles.length === 1 ? '' : 's'}`}
                tone="success"
              />
              <StatCard
                icon={UserCheck}
                label={verPromotor ? `Para ${filtroPromotor}` : 'Para promotores'}
                value={formatMXN(totales.promotor)}
                hint={`${(TASA_PROMOTOR * 100).toFixed(0)} % de la comisión total · ${totales.conPromotor} venta${
                  totales.conPromotor === 1 ? '' : 's'
                } con promotor`}
                tone="purple"
              />
            </div>

            <Card className="p-4">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="mr-1 text-xs font-medium text-ink-faint">Vendedor:</span>
                <button
                  onClick={() => setFiltroVendedor('')}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                    filtroVendedor === ''
                      ? 'bg-gold/20 text-gold'
                      : 'bg-white/5 text-ink-muted hover:bg-white/10 hover:text-ink'
                  }`}
                >
                  Todo el equipo
                </button>
                {teamUsernames.map((name) => {
                  const on = filtroVendedor === name;
                  const color = sellerColor(name, sellerColors);
                  return (
                    <button
                      key={name}
                      onClick={() => setFiltroVendedor(on ? '' : name)}
                      className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition ${
                        on ? 'text-ink' : 'text-ink-muted hover:text-ink'
                      }`}
                      style={{ backgroundColor: on ? `${color}33` : 'rgba(255,255,255,0.05)' }}
                    >
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ backgroundColor: color }}
                      />
                      {name}
                    </button>
                  );
                })}
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <span className="mr-1 text-xs font-medium text-ink-faint">Promotor:</span>
                {[
                  { id: '', label: 'Todos' },
                  ...promotores.map((p) => ({ id: p, label: p })),
                  { id: SIN_PROMOTOR, label: 'Sin promotor' },
                ].map(({ id, label }) => (
                  <button
                    key={id || 'todos'}
                    onClick={() => setFiltroPromotor(filtroPromotor === id ? '' : id)}
                    className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                      filtroPromotor === id
                        ? 'bg-purple-500/20 text-purple-200'
                        : 'bg-white/5 text-ink-muted hover:bg-white/10 hover:text-ink'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </Card>
          </>
        )}

        {grupos.length === 0 ? (
          <Card className="p-8">
            <p className="text-center text-xs text-ink-faint">
              {admin
                ? mes === TODO_EL_HISTORICO
                  ? 'Todavía no hay ventas facturadas.'
                  : `No hay ventas facturadas en ${etiquetaMes(mes)} con estos filtros.`
                : mes === TODO_EL_HISTORICO
                  ? 'Todavía no tienes comisiones registradas.'
                  : `No tienes comisiones en ${etiquetaMes(mes)}.`}
            </p>
          </Card>
        ) : (
          grupos.map(({ ts, filas, proximo }) => (
            <Card key={ts} className="p-4">
              <div className="mb-3 flex items-baseline justify-between gap-3">
                <h3 className="text-sm font-semibold text-ink">
                  Pago del {formatDate(ts)}
                  {proximo && (
                    <span className="m-chip ml-2 bg-sky2/15 text-sky2">Próximo</span>
                  )}
                </h3>
                <span className="text-xs text-gold">
                  {formatMXN(
                    filas.reduce(
                      (a, c) =>
                        a +
                        (verPromotor
                          ? c.comisionPromotor ?? 0
                          : admin
                            ? c.comisionTotal
                            : c.comisionVendedor),
                      0,
                    ),
                  )}
                </span>
              </div>

              {/* Celular: una tarjeta por comisión. La tabla necesita 820 px y
                  en un teléfono dejaba fuera la mitad de las columnas. La
                  fecha de pago no se repite: es la del encabezado del grupo. */}
              <ul className="space-y-2 md:hidden">
                {filas.map((c) => {
                  const color = sellerColor(c.vendedor, sellerColors);
                  return (
                    <li key={c.id} className="rounded-xl border border-white/5 bg-navy-900/40 p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="break-words text-sm font-semibold text-ink">
                            {c.clienteNombre}
                          </p>
                          <p className="mt-0.5 text-xs text-ink-muted">
                            Venta #{c.numeroVenta} · {c.moto}
                          </p>
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="text-sm font-semibold text-gold">
                            {formatMXN(c.comisionVendedor)}
                          </p>
                          <p className="text-[11px] text-ink-faint">Comisión vendedor</p>
                        </div>
                      </div>

                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        <EstadoPago comision={c} admin={admin} onToggle={marcarPagoComision} />
                        {admin && (
                          <>
                            <span
                              className="m-chip font-semibold"
                              style={{ backgroundColor: `${color}26`, color }}
                            >
                              {c.vendedor || 'Sin asignar'}
                            </span>
                            <span
                              className={`m-chip ${
                                c.promotor ? 'bg-purple-500/15 text-purple-200' : 'bg-white/5 text-ink-muted'
                              }`}
                            >
                              Promotor: {c.promotor || PROMOTOR_DEFAULT}
                              {c.promotor && ` · ${formatMXN(c.comisionPromotor ?? 0)}`}
                            </span>
                          </>
                        )}
                      </div>

                      {admin && (
                        <>
                          <div className="mt-2 flex items-end justify-between gap-3 border-t border-white/5 pt-2">
                            <dl className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs">
                              <dt className="text-ink-faint">Financiado</dt>
                              <dt className="text-ink-faint">Comisión total</dt>
                              <dd className="text-sky2">{formatMXN(c.montoFinanciado)}</dd>
                              <dd className="text-ink-muted">{formatMXN(c.comisionTotal)}</dd>
                            </dl>
                            <div className="-mb-1 -mr-1 flex shrink-0">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-10 w-10"
                                aria-label={`Editar la facturación de ${c.clienteNombre}`}
                                onClick={() => editar(c)}
                              >
                                <Pencil size={16} className="text-sky2" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-10 w-10"
                                aria-label={`Eliminar la comisión de ${c.clienteNombre}`}
                                onClick={() => confirmarEliminar(c)}
                              >
                                <Trash2 size={16} className="text-state-danger" />
                              </Button>
                            </div>
                          </div>
                        </>
                      )}
                    </li>
                  );
                })}
              </ul>

              <div className="hidden overflow-x-auto md:block">
                {/* table-fixed + anchos fijos: cada grupo es su propia tabla y,
                    con anchos automáticos, las columnas quedaban desalineadas
                    de un grupo a otro. Cliente toma el espacio que sobra. La
                    fecha de pago no tiene columna: es la del encabezado. */}
                <table className="w-full min-w-[1120px] table-fixed text-left text-xs">
                  <colgroup>
                    {admin && <col className="w-[136px]" />}
                    <col className="w-[32px]" />
                    <col />
                    {admin && <col className="w-[124px]" />}
                    <col className={admin ? 'w-[100px]' : 'w-[160px]'} />
                    {admin && <col className="w-[124px]" />}
                    {admin && <col className="w-[116px]" />}
                    <col className="w-[136px]" />
                    <col className="w-[100px]" />
                    {admin && <col className="w-[84px]" />}
                  </colgroup>
                  <thead className="text-ink-faint">
                    <tr className="border-b border-white/10">
                      {admin && <th className="py-2 pr-3 font-medium">Vendedor</th>}
                      <th className="py-2 pr-3 text-right font-medium">#</th>
                      <th className="py-2 pr-3 font-medium">Cliente</th>
                      {admin && <th className="py-2 pr-3 font-medium">Promotor (10 %)</th>}
                      <th className="py-2 pr-3 font-medium">Moto</th>
                      {admin && (
                        <th className="py-2 pr-3 text-right font-medium">Monto financiado</th>
                      )}
                      {admin && (
                        <th className="py-2 pr-3 text-right font-medium">Comisión total</th>
                      )}
                      <th className="py-2 pr-3 text-right font-medium">Comisión vendedor</th>
                      <th className="py-2 pr-3 text-center font-medium">Pago</th>
                      {admin && <th className="py-2 font-medium" />}
                    </tr>
                  </thead>
                  <tbody>
                    {filas.map((c) => (
                      <tr key={c.id} className="border-b border-white/5">
                        {admin && (
                          <td className="py-2 pr-3">
                            <span
                              className="m-chip font-semibold"
                              style={{
                                backgroundColor: `${sellerColor(c.vendedor, sellerColors)}26`,
                                color: sellerColor(c.vendedor, sellerColors),
                              }}
                            >
                              {c.vendedor || 'Sin asignar'}
                            </span>
                          </td>
                        )}
                        <td className="py-2 pr-3 text-right text-ink-muted">{c.numeroVenta}</td>
                        <td className="break-words py-2 pr-3 text-ink">{c.clienteNombre}</td>
                        {admin && (
                          <td className="break-words py-2 pr-3 text-ink-muted">
                            {c.promotor || PROMOTOR_DEFAULT}
                            {c.promotor && (
                              <span className="block font-semibold text-purple-200">
                                {formatMXN(c.comisionPromotor ?? 0)}
                              </span>
                            )}
                          </td>
                        )}
                        <td className="break-words py-2 pr-3 text-ink-muted">{c.moto}</td>
                        {admin && (
                          <td className="py-2 pr-3 text-right text-sky2">
                            {formatMXN(c.montoFinanciado)}
                          </td>
                        )}
                        {admin && (
                          <td className="py-2 pr-3 text-right text-ink-muted">
                            {formatMXN(c.comisionTotal)}
                          </td>
                        )}
                        <td className="py-2 pr-3 text-right font-semibold text-gold">
                          {formatMXN(c.comisionVendedor)}
                        </td>
                        <td className="py-2 pr-3 text-center">
                          <EstadoPago comision={c} admin={admin} onToggle={marcarPagoComision} />
                        </td>
                        {admin && (
                          <td className="py-2 text-right">
                            <Button
                              variant="ghost"
                              size="sm"
                              aria-label={`Editar la facturación de ${c.clienteNombre}`}
                              onClick={() => editar(c)}
                            >
                              <Pencil size={13} className="text-sky2" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              aria-label={`Eliminar la comisión de ${c.clienteNombre}`}
                              onClick={() => confirmarEliminar(c)}
                            >
                              <Trash2 size={13} className="text-state-danger" />
                            </Button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
