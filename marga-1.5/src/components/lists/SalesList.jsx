import { useMemo, useState } from 'react';
import { ChevronDown, Pencil, Trash2, Phone, Bike, CheckCircle2, CalendarRange, X } from 'lucide-react';
import { useData } from '../../context/DataContext.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useUI } from '../../context/UIContext.jsx';
import { canEditClient } from '../../lib/permissions.js';
import { fullName } from '../../lib/clients.js';
import { etiquetaEsquema } from '../../lib/motos.js';
import { sellerColor } from '../../lib/constants.js';
import { formatDate, toDateInput, fromDateInput } from '../../lib/format.js';
import Card from '../ui/Card.jsx';
import Button from '../ui/Button.jsx';
import Input, { Textarea } from '../ui/Input.jsx';
import CopyButton from '../ui/CopyButton.jsx';
import Avatar from '../ui/Avatar.jsx';

function Field({ label, children }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wide text-ink-faint">{label}</p>
      <p className="text-sm text-ink">{children || '—'}</p>
    </div>
  );
}

function SaleRow({ client }) {
  const { updateClient, sellerColors, sellerAvatars } = useData();
  const { user, role } = useAuth();
  const { openEditClient, openCancelClient } = useUI();
  const [open, setOpen] = useState(false);
  const [notas, setNotas] = useState(client.notasPostVenta ?? '');

  // Vendedores see every sale but can't touch it (admin-only records here).
  const editable = canEditClient(role, client, user?.username);

  return (
    <Card className="overflow-hidden">
      {/* The whole header toggles the row, but the "copiar teléfono" control has
          to stay a real button — nesting buttons is invalid HTML. So the toggle
          is an absolute overlay and the content sits above it with pointer
          events off, except the copy button which opts back in. */}
      <div className="relative flex w-full items-center gap-3 px-4 py-3 transition hover:bg-white/[0.03]">
        <button
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-label={`${open ? 'Ocultar' : 'Ver'} detalles de ${fullName(client)}`}
          className="absolute inset-0"
        />
        <CheckCircle2 size={18} className="pointer-events-none relative shrink-0 text-state-success" />
        <Avatar
          photo={sellerAvatars[client.createdBy]}
          name={client.createdBy}
          color={sellerColor(client.createdBy, sellerColors)}
          size={22}
          className="pointer-events-none relative"
        />
        <div className="pointer-events-none relative min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-ink">{fullName(client)}</p>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-ink-muted">
            {client.phone && (
              <span className="flex items-center gap-1">
                <Phone size={11} className="text-sky2" /> {client.phone}
                <CopyButton
                  value={client.phone}
                  label="Copiar teléfono"
                  size={11}
                  className="pointer-events-auto"
                />
              </span>
            )}
            {client.motorcycles && (
              <span className="flex items-center gap-1">
                <Bike size={11} className="text-sky2" /> {client.motorcycles}
              </span>
            )}
          </div>
        </div>
        <div className="pointer-events-none relative hidden text-right text-xs text-ink-muted sm:block">
          <p className="text-[11px] text-ink-faint">Entrega</p>
          <p className="text-gold">{formatDate(client.fechaEntrega) || '—'}</p>
        </div>
        <ChevronDown
          size={18}
          className={`pointer-events-none relative shrink-0 text-ink-faint transition ${open ? 'rotate-180' : ''}`}
        />
      </div>

      {open && (
        <div className="animate-fadeIn space-y-4 border-t border-white/5 px-4 py-4">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <Field label="Tipo de venta">{client.saleType}</Field>
            <Field label="Esquema de crédito">{etiquetaEsquema(client.creditScheme)}</Field>
            <Field label="Buró autorizado">{client.buroAutorizado ? 'Sí' : 'No'}</Field>
            <Field label="Enganche">{client.engancheDejado ? 'Sí' : 'No'}</Field>
            <Field label="Moto(s)">{client.motorcycles}</Field>
            <Field label="Teléfono">
              {client.phone && (
                <span className="inline-flex items-center gap-1">
                  {client.phone}
                  <CopyButton value={client.phone} label="Copiar teléfono" size={13} />
                </span>
              )}
            </Field>
            <Field label="Vendedor Prospect Team">{client.prospectTeamSeller}</Field>
            {/* Kept from the Procesos board so the sale records who followed it up. */}
            <Field label="Promotor encargado">{client.promotorEncargado}</Field>
          </div>

          {client.notes && (
            <div>
              <p className="text-[11px] uppercase tracking-wide text-ink-faint">Notas</p>
              <p className="whitespace-pre-wrap text-sm text-ink-muted">{client.notes}</p>
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 border-t border-white/5 pt-4 sm:grid-cols-2">
            <Input
              label="Fecha de inicio de proceso"
              type="date"
              disabled={!editable}
              value={toDateInput(client.fechaInicioProceso)}
              onChange={(e) =>
                editable &&
                updateClient(client.id, { fechaInicioProceso: fromDateInput(e.target.value) })
              }
            />
            <Input
              label="Fecha de entrega"
              type="date"
              disabled={!editable}
              value={toDateInput(client.fechaEntrega)}
              onChange={(e) =>
                editable && updateClient(client.id, { fechaEntrega: fromDateInput(e.target.value) })
              }
            />
          </div>

          <Textarea
            label="Notas post venta"
            disabled={!editable}
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
            onBlur={() => editable && updateClient(client.id, { notasPostVenta: notas })}
            placeholder="Seguimiento posterior a la entrega…"
          />

          {editable && (
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => openEditClient(client)}>
                <Pencil size={14} /> Editar
              </Button>
              {/* "Deleting" a sale sends the client to Clientes cancelados (with a
                  rejection note) instead of destroying the record. */}
              <Button variant="danger" size="sm" onClick={() => openCancelClient(client)}>
                <Trash2 size={14} /> Eliminar
              </Button>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

export default function SalesList() {
  const { clients } = useData();
  // Date-range filter over the delivery date ("fecha de entrega"), inclusive
  // on both ends. Empty inputs mean no bound on that side.
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');

  const ventas = useMemo(() => {
    const min = fromDateInput(desde);
    const max = fromDateInput(hasta);
    const maxEnd = max != null ? max + 86_399_999 : null; // include the whole "hasta" day
    return clients
      .filter((c) => c.section === 'ventas')
      .filter((c) => {
        if (min == null && maxEnd == null) return true;
        const t = c.fechaEntrega ?? c.updatedAt ?? 0;
        return (min == null || t >= min) && (maxEnd == null || t <= maxEnd);
      })
      .sort((a, b) => (b.fechaEntrega ?? b.updatedAt ?? 0) - (a.fechaEntrega ?? a.updatedAt ?? 0));
  }, [clients, desde, hasta]);

  const totalVentas = clients.filter((c) => c.section === 'ventas').length;
  const filterActive = !!(desde || hasta);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end gap-3 rounded-2xl border border-white/5 bg-navy-900/40 px-4 py-3">
        <span className="mb-2 flex items-center gap-1.5 text-xs font-medium text-ink-muted">
          <CalendarRange size={14} className="text-sky2" /> Filtrar por fecha de entrega
        </span>
        <Input
          label="Desde"
          type="date"
          value={desde}
          onChange={(e) => setDesde(e.target.value)}
          className="w-40"
        />
        <Input
          label="Hasta"
          type="date"
          value={hasta}
          onChange={(e) => setHasta(e.target.value)}
          className="w-40"
        />
        {filterActive && (
          <Button
            variant="ghost"
            size="sm"
            className="mb-0.5"
            onClick={() => {
              setDesde('');
              setHasta('');
            }}
          >
            <X size={14} /> Limpiar
          </Button>
        )}
        <span className="mb-2 ml-auto text-xs text-ink-faint">
          {ventas.length} de {totalVentas} venta(s)
        </span>
      </div>

      {ventas.length === 0 ? (
        <p className="px-2 py-16 text-center text-sm text-ink-faint">
          {filterActive ? (
            'No hay ventas concretadas en el lapso seleccionado.'
          ) : (
            <>
              Aún no hay ventas concretadas. Los clientes aparecen aquí al llegar a{' '}
              <span className="text-ink-muted">Moto entregada</span>.
            </>
          )}
        </p>
      ) : (
        <div className="space-y-2">
          {ventas.map((c) => (
            <SaleRow key={c.id} client={c} />
          ))}
        </div>
      )}
    </div>
  );
}
