import { useMemo, useState } from 'react';
import { ChevronDown, Pencil, Trash2, Phone, Bike, CheckCircle2 } from 'lucide-react';
import { useData } from '../../context/DataContext.jsx';
import { useUI } from '../../context/UIContext.jsx';
import { fullName } from '../../lib/clients.js';
import { formatDate, toDateInput, fromDateInput } from '../../lib/format.js';
import Card from '../ui/Card.jsx';
import Button from '../ui/Button.jsx';
import Input, { Textarea } from '../ui/Input.jsx';

function Field({ label, children }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wide text-ink-faint">{label}</p>
      <p className="text-sm text-ink">{children || '—'}</p>
    </div>
  );
}

function SaleRow({ client }) {
  const { updateClient } = useData();
  const { openEditClient, openCancelClient } = useUI();
  const [open, setOpen] = useState(false);
  const [notas, setNotas] = useState(client.notasPostVenta ?? '');

  return (
    <Card className="overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-white/[0.03]"
      >
        <CheckCircle2 size={18} className="shrink-0 text-state-success" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-ink">{fullName(client)}</p>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-ink-muted">
            {client.phone && (
              <span className="flex items-center gap-1">
                <Phone size={11} className="text-sky2" /> {client.phone}
              </span>
            )}
            {client.motorcycles && (
              <span className="flex items-center gap-1">
                <Bike size={11} className="text-sky2" /> {client.motorcycles}
              </span>
            )}
          </div>
        </div>
        <div className="hidden text-right text-xs text-ink-muted sm:block">
          <p className="text-[11px] text-ink-faint">Entrega</p>
          <p className="text-gold">{formatDate(client.fechaEntrega) || '—'}</p>
        </div>
        <ChevronDown
          size={18}
          className={`shrink-0 text-ink-faint transition ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div className="animate-fadeIn space-y-4 border-t border-white/5 px-4 py-4">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <Field label="Tipo de venta">{client.saleType}</Field>
            <Field label="Esquema de crédito">{client.creditScheme}</Field>
            <Field label="Buró autorizado">{client.buroAutorizado ? 'Sí' : 'No'}</Field>
            <Field label="Moto(s)">{client.motorcycles}</Field>
            <Field label="Teléfono">{client.phone}</Field>
            <Field label="Vendedor Prospect Team">{client.prospectTeamSeller}</Field>
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
              value={toDateInput(client.fechaInicioProceso)}
              onChange={(e) =>
                updateClient(client.id, { fechaInicioProceso: fromDateInput(e.target.value) })
              }
            />
            <Input
              label="Fecha de entrega"
              type="date"
              value={toDateInput(client.fechaEntrega)}
              onChange={(e) =>
                updateClient(client.id, { fechaEntrega: fromDateInput(e.target.value) })
              }
            />
          </div>

          <Textarea
            label="Notas post venta"
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
            onBlur={() => updateClient(client.id, { notasPostVenta: notas })}
            placeholder="Seguimiento posterior a la entrega…"
          />

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
        </div>
      )}
    </Card>
  );
}

export default function SalesList() {
  const { clients } = useData();
  const ventas = useMemo(
    () =>
      clients
        .filter((c) => c.section === 'ventas')
        .sort((a, b) => (b.fechaEntrega ?? b.updatedAt ?? 0) - (a.fechaEntrega ?? a.updatedAt ?? 0)),
    [clients],
  );

  if (ventas.length === 0) {
    return (
      <p className="px-2 py-16 text-center text-sm text-ink-faint">
        Aún no hay ventas concretadas. Los clientes aparecen aquí al llegar a{' '}
        <span className="text-ink-muted">Moto entregada</span>.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {ventas.map((c) => (
        <SaleRow key={c.id} client={c} />
      ))}
    </div>
  );
}
