import { useMemo, useState } from 'react';
import { Wallet, TrendingUp, Banknote, Flame, Trash2, StickyNote } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { useData } from '../context/DataContext.jsx';
import { canViewComisiones, isAdmin } from '../lib/permissions.js';
import { sellerColor } from '../lib/constants.js';
import { fechaPago, mesVenta, PROMOTOR_DEFAULT, NIVELES_RACHA } from '../lib/comisiones.js';
import { formatMXN, formatDate } from '../lib/format.js';
import Card from '../components/ui/Card.jsx';
import Button from '../components/ui/Button.jsx';

function StatCard({ icon: Icon, label, value, hint, tone = 'sky' }) {
  const TONES = { sky: 'text-sky2', gold: 'text-gold', success: 'text-state-success' };
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

export default function ComisionesView() {
  const { role, user } = useAuth();
  const {
    comisiones,
    configComisiones,
    eliminarComision,
    sellerColors,
    teamUsernames,
  } = useData();
  const [filtroVendedor, setFiltroVendedor] = useState('');
  const admin = isAdmin(role);

  // Cada comisión con su fecha de pago derivada de la configuración vigente.
  const conPago = useMemo(
    () =>
      comisiones.map((c) => ({ ...c, fechaPagoTs: fechaPago(c.fechaFacturacion, configComisiones) })),
    [comisiones, configComisiones],
  );

  const visibles = useMemo(() => {
    let lista = admin ? conPago : conPago.filter((c) => c.vendedor === user?.username);
    if (admin && filtroVendedor) lista = lista.filter((c) => c.vendedor === filtroVendedor);
    return lista.sort((a, b) => b.fechaPagoTs - a.fechaPagoTs || b.fechaFacturacion - a.fechaFacturacion);
  }, [conPago, admin, user, filtroVendedor]);

  const totales = useMemo(
    () =>
      visibles.reduce(
        (acc, c) => ({
          ingreso: acc.ingreso + c.comisionTotal,
          neto: acc.neto + c.netoAdmin,
          financiado: acc.financiado + c.montoFinanciado,
          vendedor: acc.vendedor + c.comisionVendedor,
        }),
        { ingreso: 0, neto: 0, financiado: 0, vendedor: 0 },
      ),
    [visibles],
  );

  // Agrupación por fecha de pago, más próxima arriba.
  const grupos = useMemo(() => {
    const map = new Map();
    for (const c of visibles) {
      if (!map.has(c.fechaPagoTs)) map.set(c.fechaPagoTs, []);
      map.get(c.fechaPagoTs).push(c);
    }
    return [...map.entries()].sort((a, b) => b[0] - a[0]);
  }, [visibles]);

  // Racha del mes en curso, solo para la vista del vendedor.
  const rachaActual = useMemo(() => {
    if (admin || !user?.username) return 0;
    const clave = mesVenta(Date.now(), configComisiones);
    return conPago.filter((c) => c.vendedor === user.username && c.mesVenta === clave).length;
  }, [admin, user, conPago, configComisiones]);

  if (!canViewComisiones(role)) {
    return (
      <p className="px-2 py-16 text-center text-sm text-ink-faint">
        Los promotores no tienen acceso al panel de Comisiones.
      </p>
    );
  }

  return (
    <div className="h-full overflow-y-auto px-4 py-5 sm:px-6">
      <div className="mx-auto max-w-5xl space-y-4">
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
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <StatCard
                icon={Wallet}
                label="Ingreso total global"
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
            </Card>
          </>
        )}

        {grupos.length === 0 ? (
          <Card className="p-8">
            <p className="text-center text-xs text-ink-faint">
              {admin
                ? 'Todavía no hay ventas facturadas.'
                : 'Todavía no tienes comisiones registradas.'}
            </p>
          </Card>
        ) : (
          grupos.map(([ts, filas]) => (
            <Card key={ts} className="p-4">
              <div className="mb-3 flex items-baseline justify-between gap-3">
                <h3 className="text-sm font-semibold text-ink">
                  Pago del {formatDate(ts)}
                  {ts > Date.now() && (
                    <span className="m-chip ml-2 bg-sky2/15 text-sky2">Próximo</span>
                  )}
                </h3>
                <span className="text-xs text-gold">
                  {formatMXN(
                    filas.reduce(
                      (a, c) => a + (admin ? c.comisionTotal : c.comisionVendedor),
                      0,
                    ),
                  )}
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full min-w-[820px] text-left text-xs">
                  <thead className="text-ink-faint">
                    <tr className="border-b border-white/10">
                      {admin && <th className="py-2 pr-3 font-medium">Vendedor</th>}
                      <th className="py-2 pr-3 text-right font-medium">#</th>
                      <th className="py-2 pr-3 font-medium">Cliente</th>
                      {admin && <th className="py-2 pr-3 font-medium">Promotor</th>}
                      <th className="py-2 pr-3 font-medium">Moto</th>
                      <th className="py-2 pr-3 text-right font-medium">Monto financiado</th>
                      <th className="py-2 pr-3 text-right font-medium">Comisión total</th>
                      <th className="py-2 pr-3 text-right font-medium">Comisión vendedor</th>
                      <th className="py-2 pr-3 text-right font-medium">Fecha de pago</th>
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
                        <td className="py-2 pr-3 text-ink">{c.clienteNombre}</td>
                        {admin && (
                          <td className="py-2 pr-3 text-ink-muted">
                            {c.promotor || PROMOTOR_DEFAULT}
                          </td>
                        )}
                        <td className="py-2 pr-3 text-ink-muted">{c.moto}</td>
                        <td className="py-2 pr-3 text-right text-sky2">
                          {formatMXN(c.montoFinanciado)}
                        </td>
                        <td className="py-2 pr-3 text-right text-ink-muted">
                          {formatMXN(c.comisionTotal)}
                        </td>
                        <td className="py-2 pr-3 text-right font-semibold text-gold">
                          {formatMXN(c.comisionVendedor)}
                        </td>
                        <td className="py-2 pr-3 text-right text-ink-muted">
                          {formatDate(c.fechaPagoTs)}
                        </td>
                        {admin && (
                          <td className="py-2 text-right">
                            <Button
                              variant="ghost"
                              size="sm"
                              aria-label={`Eliminar la comisión de ${c.clienteNombre}`}
                              onClick={() => {
                                if (
                                  window.confirm(
                                    `¿Eliminar la comisión de ${c.clienteNombre}? La tarjeta quedará sin facturación.`,
                                  )
                                ) {
                                  eliminarComision(c.id);
                                }
                              }}
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
