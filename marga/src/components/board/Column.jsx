import { useDroppable } from '@dnd-kit/core';
import { Lock } from 'lucide-react';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import ClientCard from './ClientCard.jsx';

// Droppable id is prefixed so the drag handler can tell a column drop (empty
// area) apart from a card drop.
export const COLUMN_PREFIX = 'col:';

export default function Column({ column, clients, locked = false, activa = true }) {
  const { setNodeRef, isOver } = useDroppable({
    id: `${COLUMN_PREFIX}${column.id}`,
    disabled: locked,
  });

  // Mobile keeps a fixed, comfortable width (the board scrolls one column at a
  // time). From `md` up the columns share the available width (flex-1, no max
  // cap) so the board fills the screen instead of leaving dead space on the
  // right — but never narrower than 15rem (240 px): below that the cards break
  // names mid-word and truncate every line. When the columns don't fit (the
  // 7 of Procesos on a laptop), the board scrolls horizontally instead.
  return (
    <div
      className={`h-full min-h-0 w-full shrink-0 flex-col md:flex md:w-auto md:min-w-[15rem] md:flex-1 md:shrink ${
        activa ? 'flex' : 'hidden'
      }`}
    >
      {/* min-h reserva el alto de 2 líneas de texto (text-sm: 1.25rem por
          línea) para que un encabezado largo ("Entrega agendada", "Moto
          Facturada"...) que se parte en dos renglones no empiece la zona de
          soltar más abajo que sus columnas vecinas de una sola línea. */}
      {/* En celular el nombre de la etapa ya está en las pestañas de arriba. */}
      <div className="mb-2 hidden min-h-[2.5rem] items-center justify-between gap-2 px-1 md:flex">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold text-ink">
          {locked && <Lock size={12} className="text-ink-faint" aria-label="Solo administrador" />}
          {column.label}
        </h3>
        <span className="m-chip shrink-0 bg-white/5 text-ink-faint">{clients.length}</span>
      </div>

      <div
        ref={setNodeRef}
        className={`flex-1 space-y-2.5 overflow-y-auto rounded-2xl pb-20 transition md:space-y-2 md:border md:p-2 md:pb-2
          ${isOver && !locked ? 'md:border-sky2/50 md:bg-sky2/5' : 'md:border-white/[0.08] md:bg-navy-800/60'}`}
      >
        <SortableContext items={clients.map((c) => c.id)} strategy={verticalListSortingStrategy}>
          {clients.map((client) => (
            <ClientCard key={client.id} client={client} />
          ))}
        </SortableContext>

        {clients.length === 0 && (
          <div className="flex h-20 items-center justify-center rounded-xl border border-dashed border-white/10 text-xs text-ink-faint">
            {locked ? 'Gestionada por el administrador' : 'Sin clientes en esta etapa'}
          </div>
        )}
      </div>
    </div>
  );
}
