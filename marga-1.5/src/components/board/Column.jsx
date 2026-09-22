import { useDroppable } from '@dnd-kit/core';
import { Lock } from 'lucide-react';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import ClientCard from './ClientCard.jsx';

// Droppable id is prefixed so the drag handler can tell a column drop (empty
// area) apart from a card drop.
export const COLUMN_PREFIX = 'col:';

export default function Column({ column, clients, locked = false }) {
  const { setNodeRef, isOver } = useDroppable({
    id: `${COLUMN_PREFIX}${column.id}`,
    disabled: locked,
  });

  // Mobile keeps a fixed, comfortable width (the board scrolls one column at a
  // time). From `md` up the columns share ALL the available width (flex-1, no
  // max cap) so the board fills the whole screen instead of leaving dead space
  // on the right — and every stage stays on screen for easy dragging.
  return (
    <div className="flex h-full min-h-0 w-72 shrink-0 flex-col md:w-auto md:min-w-[9.5rem] md:flex-1 md:shrink">
      {/* min-h reserva el alto de 2 líneas de texto (text-sm: 1.25rem por
          línea) para que un encabezado largo ("Entrega agendada", "Moto
          Facturada"...) que se parte en dos renglones no empiece la zona de
          soltar más abajo que sus columnas vecinas de una sola línea. */}
      <div className="mb-2 flex min-h-[2.5rem] items-center justify-between gap-2 px-1">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold text-ink">
          {locked && <Lock size={12} className="text-ink-faint" aria-label="Solo administrador" />}
          {column.label}
        </h3>
        <span className="m-chip shrink-0 bg-white/5 text-ink-faint">{clients.length}</span>
      </div>

      <div
        ref={setNodeRef}
        className={`flex-1 space-y-2 overflow-y-auto rounded-2xl border p-2 transition
          ${isOver && !locked ? 'border-sky2/50 bg-sky2/5' : 'border-white/5 bg-navy-900/40'}`}
      >
        <SortableContext items={clients.map((c) => c.id)} strategy={verticalListSortingStrategy}>
          {clients.map((client) => (
            <ClientCard key={client.id} client={client} />
          ))}
        </SortableContext>

        {clients.length === 0 && (
          <div className="flex h-20 items-center justify-center rounded-xl border border-dashed border-white/10 text-xs text-ink-faint">
            {locked ? 'Gestionada por el administrador' : 'Arrastra clientes aquí'}
          </div>
        )}
      </div>
    </div>
  );
}
