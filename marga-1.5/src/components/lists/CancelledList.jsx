import { useMemo, useState } from 'react';
import { XCircle, Trash2, Phone, Bike, RotateCcw, CalendarX } from 'lucide-react';
import { useData } from '../../context/DataContext.jsx';
import { fullName } from '../../lib/clients.js';
import { formatDateTime } from '../../lib/format.js';
import Card from '../ui/Card.jsx';
import Button from '../ui/Button.jsx';
import { Textarea } from '../ui/Input.jsx';
import CopyButton from '../ui/CopyButton.jsx';

function CancelledRow({ client }) {
  const { updateClient, deleteClient, moveClient } = useData();
  const [notas, setNotas] = useState(client.notasRechazo ?? '');

  // Puts the credit process back on track: the client returns to the Procesos
  // board, at its first column.
  function restoreCredit() {
    moveClient(client.id, 'procesos', 'credito_por_subir');
  }

  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-sm font-semibold text-ink">
            <XCircle size={16} className="shrink-0 text-state-danger" />
            {fullName(client)}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-ink-muted">
            {client.phone && (
              <span className="flex items-center gap-1">
                <Phone size={11} className="text-sky2" /> {client.phone}
                <CopyButton value={client.phone} label="Copiar teléfono" size={11} />
              </span>
            )}
            {client.motorcycles && (
              <span className="flex items-center gap-1">
                <Bike size={11} className="text-sky2" /> {client.motorcycles}
              </span>
            )}
            {client.fechaCancelacion && (
              <span className="flex items-center gap-1 text-gold">
                <CalendarX size={11} /> {formatDateTime(client.fechaCancelacion)}
              </span>
            )}
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => confirm(`¿Eliminar a ${fullName(client)}?`) && deleteClient(client.id)}
          aria-label="Eliminar"
        >
          <Trash2 size={16} className="text-state-danger" />
        </Button>
      </div>

      <Textarea
        label="Notas de rechazo"
        className="mt-3"
        value={notas}
        onChange={(e) => setNotas(e.target.value)}
        onBlur={() => updateClient(client.id, { notasRechazo: notas })}
        placeholder="Motivo del rechazo…"
        rows={2}
      />

      <div className="mt-3 flex justify-end">
        <Button variant="sky" size="sm" onClick={restoreCredit}>
          <RotateCcw size={14} /> Restablecer crédito
        </Button>
      </div>
    </Card>
  );
}

export default function CancelledList() {
  const { clients } = useData();
  const cancelados = useMemo(
    () =>
      clients
        .filter((c) => c.section === 'cancelados')
        .sort((a, b) => (b.fechaCancelacion ?? b.updatedAt ?? 0) - (a.fechaCancelacion ?? a.updatedAt ?? 0)),
    [clients],
  );

  if (cancelados.length === 0) {
    return (
      <p className="px-2 py-16 text-center text-sm text-ink-faint">
        No hay clientes cancelados.
      </p>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
      {cancelados.map((c) => (
        <CancelledRow key={c.id} client={c} />
      ))}
    </div>
  );
}
