import { useState } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { MoreVertical, Pencil, Ban, Trash2, Phone, Bike, Clock, UserCheck } from 'lucide-react';
import { useData } from '../../context/DataContext.jsx';
import { useUI } from '../../context/UIContext.jsx';
import { fullName } from '../../lib/clients.js';
import { formatDateTime } from '../../lib/format.js';
import Checkbox from '../ui/Checkbox.jsx';

// Stops a pointer-down from bubbling to the drag sensor, so interactive controls
// (checkbox, menu) keep working without starting a drag.
const noDrag = { onPointerDown: (e) => e.stopPropagation() };

export function CardBody({ client, dragging = false }) {
  const { updateClient, deleteClient } = useData();
  const { openEditClient, openCancelClient } = useUI();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div
      className={`group relative rounded-xl border border-white/10 bg-navy-700/80 p-3 shadow-card transition
        ${dragging ? 'ring-2 ring-sky2/60' : 'hover:border-white/20'}`}
    >
      <div className="flex items-start justify-between gap-2">
        <h4 className="min-w-0 break-words pr-1 text-sm font-semibold text-ink">
          {fullName(client) || 'Sin nombre'}
        </h4>
        <div className="relative shrink-0" {...noDrag}>
          <button
            onClick={() => setMenuOpen((v) => !v)}
            className="rounded-md p-1 text-ink-faint transition hover:bg-white/5 hover:text-ink"
            aria-label="Acciones"
          >
            <MoreVertical size={16} />
          </button>
          {menuOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
              <div className="absolute right-0 z-50 mt-1 w-40 overflow-hidden rounded-lg border border-white/10 bg-navy-800 shadow-card">
                <button
                  onClick={() => {
                    setMenuOpen(false);
                    openEditClient(client);
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-xs text-ink hover:bg-white/5"
                >
                  <Pencil size={14} /> Editar
                </button>
                <button
                  onClick={() => {
                    setMenuOpen(false);
                    openCancelClient(client);
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-xs text-state-warning hover:bg-white/5"
                >
                  <Ban size={14} /> Cancelar cliente
                </button>
                <button
                  onClick={() => {
                    setMenuOpen(false);
                    if (confirm(`¿Eliminar a ${fullName(client)}? Esta acción no se puede deshacer.`))
                      deleteClient(client.id);
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-xs text-state-danger hover:bg-white/5"
                >
                  <Trash2 size={14} /> Eliminar
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="mt-2 space-y-1 text-xs text-ink-muted">
        {client.phone && (
          <div className="flex items-center gap-1.5">
            <Phone size={12} className="text-sky2" />
            <span className="text-gold">{client.phone}</span>
          </div>
        )}
        {client.motorcycles && (
          <div className="flex items-center gap-1.5">
            <Bike size={12} className="text-sky2" />
            <span className="truncate">{client.motorcycles}</span>
          </div>
        )}
        {client.prospectTeamSeller && (
          <div className="flex items-center gap-1.5">
            <UserCheck size={12} className="text-sky2" />
            <span className="truncate">{client.prospectTeamSeller}</span>
          </div>
        )}
      </div>

      {(client.saleType || client.creditScheme) && (
        <div className="mt-2 flex flex-wrap gap-1">
          {client.saleType && (
            <span className="m-chip bg-sky2/15 text-sky2-light">{client.saleType}</span>
          )}
          {client.creditScheme && (
            <span className="m-chip bg-white/5 text-ink-muted">{client.creditScheme}</span>
          )}
        </div>
      )}

      <div className="mt-3 flex items-center justify-between border-t border-white/5 pt-2" {...noDrag}>
        <Checkbox
          checked={!!client.buroAutorizado}
          onChange={(v) => updateClient(client.id, { buroAutorizado: v })}
          label="Buró autorizado"
          className="text-[11px] text-ink-muted"
        />
      </div>

      <div className="mt-1.5 flex items-center gap-1 text-[10px] text-ink-faint">
        <Clock size={10} />
        <span>{formatDateTime(client.updatedAt)}</span>
      </div>
    </div>
  );
}

export default function ClientCard({ client }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: client.id,
  });

  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="m-draggable cursor-grab active:cursor-grabbing"
      {...attributes}
      {...listeners}
    >
      <CardBody client={client} />
    </div>
  );
}
