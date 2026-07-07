import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import ClientCard from './ClientCard.jsx';

// Droppable id is prefixed so the drag handler can tell a column drop (empty
// area) apart from a card drop.
export const COLUMN_PREFIX = 'col:';

export default function Column({ column, clients }) {
  const { setNodeRef, isOver } = useDroppable({ id: `${COLUMN_PREFIX}${column.id}` });

  return (
    <div className="flex h-full w-72 shrink-0 flex-col">
      <div className="mb-2 flex items-center justify-between px-1">
        <h3 className="text-sm font-semibold text-ink">{column.label}</h3>
        <span className="m-chip bg-white/5 text-ink-faint">{clients.length}</span>
      </div>

      <div
        ref={setNodeRef}
        className={`flex-1 space-y-2 overflow-y-auto rounded-2xl border p-2 transition
          ${isOver ? 'border-sky2/50 bg-sky2/5' : 'border-white/5 bg-navy-900/40'}`}
      >
        <SortableContext items={clients.map((c) => c.id)} strategy={verticalListSortingStrategy}>
          {clients.map((client) => (
            <ClientCard key={client.id} client={client} />
          ))}
        </SortableContext>

        {clients.length === 0 && (
          <div className="flex h-20 items-center justify-center rounded-xl border border-dashed border-white/10 text-xs text-ink-faint">
            Arrastra clientes aquí
          </div>
        )}
      </div>
    </div>
  );
}
