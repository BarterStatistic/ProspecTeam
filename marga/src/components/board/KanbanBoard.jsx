import { useMemo, useState } from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCorners,
} from '@dnd-kit/core';
import { arrayMove, sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { BOARD_COLUMNS } from '../../lib/constants.js';
import { useData } from '../../context/DataContext.jsx';
import { resolveTransition } from '../../lib/db.js';
import Column, { COLUMN_PREFIX } from './Column.jsx';
import { CardBody } from './ClientCard.jsx';

export default function KanbanBoard({ section }) {
  const { clients, moveClient, applyBoardReorder } = useData();
  const [activeId, setActiveId] = useState(null);
  const columns = BOARD_COLUMNS[section];

  // Group this section's clients by stage, each column sorted by `order`.
  const grouped = useMemo(() => {
    const map = {};
    for (const col of columns) map[col.id] = [];
    for (const c of clients) {
      if (c.section === section && map[c.stage]) map[c.stage].push(c);
    }
    for (const col of columns) map[col.id].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    return map;
  }, [clients, section, columns]);

  const activeClient = activeId ? clients.find((c) => c.id === activeId) : null;

  // Pointer needs a small drag threshold so clicks/taps still work; touch waits
  // briefly so the list can still be scrolled with a finger.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const stageOfCard = (id) => clients.find((x) => x.id === id)?.stage;
  const isColumnId = (id) => typeof id === 'string' && id.startsWith(COLUMN_PREFIX);

  function resolveTargetStage(overId) {
    return isColumnId(overId) ? overId.slice(COLUMN_PREFIX.length) : stageOfCard(overId);
  }

  async function handleDragEnd(event) {
    const { active, over } = event;
    setActiveId(null);
    if (!over) return;

    const draggedId = active.id;
    const fromStage = stageOfCard(draggedId);
    const toStage = resolveTargetStage(over.id);
    if (!toStage) return;

    // If the target column is an auto-transition trigger to another section,
    // hand off to moveClient (which appends in the destination section).
    const resolved = resolveTransition(section, toStage);
    if (resolved.section !== section) {
      await moveClient(draggedId, section, toStage);
      return;
    }

    const targetIds = grouped[toStage].map((c) => c.id);

    if (fromStage === toStage) {
      // Reorder within the same column.
      const oldIndex = targetIds.indexOf(draggedId);
      const newIndex = isColumnId(over.id) ? targetIds.length - 1 : targetIds.indexOf(over.id);
      if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) return;
      const orderedIds = arrayMove(targetIds, oldIndex, newIndex);
      await applyBoardReorder({ movedId: draggedId, toStage, stageChanged: false, orderedIds });
    } else {
      // Move to a different column on the same board.
      const withoutActive = targetIds.filter((id) => id !== draggedId);
      let insertIndex = isColumnId(over.id) ? withoutActive.length : withoutActive.indexOf(over.id);
      if (insertIndex === -1) insertIndex = withoutActive.length;
      const orderedIds = [
        ...withoutActive.slice(0, insertIndex),
        draggedId,
        ...withoutActive.slice(insertIndex),
      ];
      await applyBoardReorder({ movedId: draggedId, toStage, stageChanged: true, orderedIds });
    }
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={(e) => setActiveId(e.active.id)}
      onDragCancel={() => setActiveId(null)}
      onDragEnd={handleDragEnd}
    >
      <div className="h-full overflow-x-auto overflow-y-hidden px-4 py-4 sm:px-6">
        <div className="flex h-full gap-4">
          {columns.map((col) => (
            <Column key={col.id} column={col} clients={grouped[col.id]} />
          ))}
        </div>
      </div>

      <DragOverlay>
        {activeClient ? (
          <div className="w-72 rotate-2">
            <CardBody client={activeClient} dragging />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
