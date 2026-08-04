import { useMemo, useState } from 'react';
import {
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCorners,
} from '@dnd-kit/core';
import { arrayMove, sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import {
  BOARD_COLUMNS,
  SELLER_COLORS,
  sellerColor,
  UNASSIGNED_COLOR,
  UNASSIGNED_LABEL,
} from '../../lib/constants.js';
import { useData } from '../../context/DataContext.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { canDropTo, canEditClient } from '../../lib/permissions.js';
import { resolveTransition } from '../../lib/db.js';
import Column, { COLUMN_PREFIX } from './Column.jsx';
import { CardBody } from './ClientCard.jsx';

// Sentinel filter values that aren't a real username.
const ALL = '__all__';
const UNASSIGNED = '__unassigned__';

export default function KanbanBoard({ section }) {
  const { clients, moveClient, applyBoardReorder, sellerColors } = useData();
  const { user, role } = useAuth();
  const [activeId, setActiveId] = useState(null);
  // Filter the board by who captured the client (createdBy). Local per board.
  const [sellerFilter, setSellerFilter] = useState(ALL);
  const columns = BOARD_COLUMNS[section];

  // Distinct sellers present in this section, known ones first, then extras
  // (alphabetical), then an "Sin asignar" bucket if any card lacks createdBy.
  const sellers = useMemo(() => {
    const present = new Set();
    let hasUnassigned = false;
    for (const c of clients) {
      if (c.section !== section) continue;
      if (c.createdBy) present.add(c.createdBy);
      else hasUnassigned = true;
    }
    const known = Object.keys(SELLER_COLORS).filter((n) => present.has(n));
    const extra = [...present].filter((n) => !SELLER_COLORS[n]).sort((a, b) => a.localeCompare(b));
    const list = [...known, ...extra].map((name) => ({ value: name, label: name }));
    if (hasUnassigned) list.push({ value: UNASSIGNED, label: UNASSIGNED_LABEL });
    return list;
  }, [clients, section]);

  const matchesFilter = (c) => {
    if (sellerFilter === ALL) return true;
    if (sellerFilter === UNASSIGNED) return !c.createdBy;
    return c.createdBy === sellerFilter;
  };

  // Group this section's clients by stage, each column sorted by `order`.
  const grouped = useMemo(() => {
    const map = {};
    for (const col of columns) map[col.id] = [];
    for (const c of clients) {
      if (c.section === section && map[c.stage] && matchesFilter(c)) map[c.stage].push(c);
    }
    for (const col of columns) map[col.id].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    return map;
  }, [clients, section, columns, sellerFilter]);

  const activeClient = activeId ? clients.find((c) => c.id === activeId) : null;

  // MouseSensor + TouchSensor instead of PointerSensor: on phones a finger
  // fires pointer events too, so PointerSensor would race the browser's native
  // scroll and lose (pointercancel kills the drag). Touch uses hold-to-drag
  // (like Trello/Kommo): press ~200 ms to lift a card, swipe normally to scroll.
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 10 } }),
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
    const dragged = clients.find((c) => c.id === draggedId);
    const fromStage = stageOfCard(draggedId);
    const toStage = resolveTargetStage(over.id);
    if (!toStage || !dragged) return;

    // Role gate: the card must be owned/editable by this user and the drop
    // must land on a board this role may act on (vendedores: only Prospectos).
    if (!canEditClient(role, dragged, user?.username) || !canDropTo(role, section)) return;

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
      // The last columns sit off-screen on most displays, so horizontal
      // auto-scroll must kick in early (wide edge zone) and move fast enough
      // to reach them without fighting the pointer.
      autoScroll={{ threshold: { x: 0.3, y: 0.2 }, acceleration: 28, interval: 5 }}
      onDragStart={(e) => setActiveId(e.active.id)}
      onDragCancel={() => setActiveId(null)}
      onDragEnd={handleDragEnd}
    >
      <div className="flex h-full flex-col">
        {sellers.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 px-4 pt-3 sm:px-6">
            <span className="mr-1 text-xs font-medium text-ink-faint">Vendedor:</span>
            <button
              onClick={() => setSellerFilter(ALL)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                sellerFilter === ALL
                  ? 'bg-gold/20 text-gold'
                  : 'bg-white/5 text-ink-muted hover:bg-white/10 hover:text-ink'
              }`}
            >
              Todos
            </button>
            {sellers.map((s) => {
              const active = sellerFilter === s.value;
              return (
                <button
                  key={s.value}
                  onClick={() => setSellerFilter(active ? ALL : s.value)}
                  className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition ${
                    active ? 'text-ink' : 'text-ink-muted hover:text-ink'
                  }`}
                  style={{
                    backgroundColor: active
                      ? `${s.value === UNASSIGNED ? UNASSIGNED_COLOR : sellerColor(s.value, sellerColors)}33`
                      : 'rgba(255,255,255,0.05)',
                  }}
                >
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{
                      backgroundColor:
                        s.value === UNASSIGNED
                          ? UNASSIGNED_COLOR
                          : sellerColor(s.value, sellerColors),
                    }}
                  />
                  {s.label}
                </button>
              );
            })}
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-x-auto overflow-y-hidden px-4 py-4 sm:px-6">
          <div className="flex h-full gap-4 md:gap-3">
            {columns.map((col) => (
              <Column
                key={col.id}
                column={col}
                clients={grouped[col.id]}
                locked={!canDropTo(role, section)}
              />
            ))}
          </div>
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
