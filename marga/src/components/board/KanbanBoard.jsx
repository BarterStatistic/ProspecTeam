import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  AUTO_TRANSITIONS,
  BOARD_COLUMNS,
  SELLER_COLORS,
  sellerColor,
  UNASSIGNED_COLOR,
  UNASSIGNED_LABEL,
} from '../../lib/constants.js';
import { useData } from '../../context/DataContext.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useUI } from '../../context/UIContext.jsx';
import { canDropTo, canEditClient, canRegistrarFacturacion, canSeeClient } from '../../lib/permissions.js';
import { resolveTransition } from '../../lib/db.js';
import { regresoAColumna, ordenPila } from '../../lib/clients.js';
import { sinAtender } from '../../lib/seguimiento.js';
import { ArrowRight, ChevronDown, SlidersHorizontal, UserX } from 'lucide-react';
import Column, { COLUMN_PREFIX } from './Column.jsx';
import { CardBody } from './ClientCard.jsx';
import LeyendaProspectos from './LeyendaProspectos.jsx';
import DinamoEnVivo from '../dinamo/DinamoEnVivo.jsx';

// Sentinel filter values that aren't a real username.
const ALL = '__all__';
const UNASSIGNED = '__unassigned__';

/** One row of filter chips ("Todos" + one per name), tinted by `colorOf`. */
function FilterRow({ label, items, value, onChange, colorOf }) {
  if (items.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="mr-1 text-xs font-medium text-ink-faint">{label}</span>
      <button
        onClick={() => onChange(ALL)}
        className={`rounded-full px-3 py-1 text-xs font-medium transition ${
          value === ALL
            ? 'bg-gold/20 text-gold'
            : 'bg-white/5 text-ink-muted hover:bg-white/10 hover:text-ink'
        }`}
      >
        Todos
      </button>
      {items.map((item) => {
        const active = value === item.value;
        const color = colorOf(item.value);
        return (
          <button
            key={item.value}
            onClick={() => onChange(active ? ALL : item.value)}
            className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition ${
              active ? 'text-ink' : 'text-ink-muted hover:text-ink'
            }`}
            style={{ backgroundColor: active ? `${color}33` : 'rgba(255,255,255,0.05)' }}
          >
            <span
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ backgroundColor: color }}
            />
            {item.label}
          </button>
        );
      })}
    </div>
  );
}

export default function KanbanBoard({ section }) {
  const { clients: todos, moveClient, applyBoardReorder, sellerColors } = useData();
  const esPila = section === 'prospectos';
  const { user, role } = useAuth();
  // Cada vendedor ve solo sus clientes (canSeeClient); el admin y el promotor, todo su tablero.
  const clients = useMemo(
    () => todos.filter((c) => canSeeClient(role, c, user?.username)),
    [todos, role, user?.username],
  );
  const { openFacturacion } = useUI();
  const [activeId, setActiveId] = useState(null);
  // Filter the board by who captured the client (createdBy). Local per board.
  const [sellerFilter, setSellerFilter] = useState(ALL);
  // Procesos only: filter by the promotor following the process up.
  const [promotorFilter, setPromotorFilter] = useState(ALL);
  // Celular: los filtros van plegados tras un botón "Filtros" (hasta 4
  // renglones de chips empujaban la primera tarjeta al último tercio de la
  // pantalla). Desde md siempre están a la vista.
  const [filtrosAbiertos, setFiltrosAbiertos] = useState(false);
  // Prospectos: solo los que nadie atiende todavía (sin vendedor, o de Alex sin contacto registrado).
  const [soloSinAtender, setSoloSinAtender] = useState(false);
  const filtrosActivos =
    (sellerFilter !== ALL ? 1 : 0) + (promotorFilter !== ALL ? 1 : 0) + (soloSinAtender ? 1 : 0);
  const columns = BOARD_COLUMNS[section];
  const isProcesos = section === 'procesos';
  // Celular: se ve una etapa a la vez, en vertical. Se cambia tocando su
  // pestaña o deslizando el dedo hacia los lados.
  const [etapaMovil, setEtapaMovil] = useState(columns[0].id);
  const indiceEtapa = Math.max(0, columns.findIndex((c) => c.id === etapaMovil));
  const tabsRef = useRef(null);
  const toque = useRef(null);
  useEffect(() => {
    tabsRef.current
      ?.querySelector('[aria-selected="true"]')
      ?.scrollIntoView({ inline: 'center', block: 'nearest' });
  }, [etapaMovil]);

  function alTocar(e) {
    const t = e.touches[0];
    toque.current = { x: t.clientX, y: t.clientY };
  }
  function alSoltar(e) {
    const inicio = toque.current;
    toque.current = null;
    // Con una tarjeta levantada el gesto es un arrastre, no un cambio de etapa.
    if (!inicio || activeId || window.innerWidth >= 768) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - inicio.x;
    const dy = t.clientY - inicio.y;
    if (Math.abs(dx) < 70 || Math.abs(dx) < Math.abs(dy) * 1.6) return;
    const destino = columns[Math.min(columns.length - 1, Math.max(0, indiceEtapa + (dx < 0 ? 1 : -1)))];
    setEtapaMovil(destino.id);
  }

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

  // Distinct promotores assigned on this board (alphabetical), plus a
  // "Sin promotor" bucket when some card is still unassigned.
  const promotores = useMemo(() => {
    if (!isProcesos) return [];
    const present = new Set();
    let hasUnassigned = false;
    for (const c of clients) {
      if (c.section !== section) continue;
      if (c.promotorEncargado) present.add(c.promotorEncargado);
      else hasUnassigned = true;
    }
    const list = [...present]
      .sort((a, b) => a.localeCompare(b))
      .map((name) => ({ value: name, label: name }));
    if (hasUnassigned) list.push({ value: UNASSIGNED, label: 'Sin promotor' });
    return list;
  }, [clients, section, isProcesos]);

  const sinAtenderTotal = useMemo(
    () => (esPila ? clients.filter((c) => c.section === section && sinAtender(c)).length : 0),
    [clients, section, esPila],
  );

  const matchesFilter = useCallback(
    (c) => {
      if (soloSinAtender && !sinAtender(c)) return false;
      if (sellerFilter !== ALL) {
        if (sellerFilter === UNASSIGNED ? !!c.createdBy : c.createdBy !== sellerFilter)
          return false;
      }
      if (promotorFilter !== ALL) {
        if (
          promotorFilter === UNASSIGNED
            ? !!c.promotorEncargado
            : c.promotorEncargado !== promotorFilter
        )
          return false;
      }
      return true;
    },
    [sellerFilter, promotorFilter, soloSinAtender],
  );

  // Group this section's clients by stage, each column sorted by `order`.
  const grouped = useMemo(() => {
    const map = {};
    for (const col of columns) map[col.id] = [];
    for (const c of clients) {
      if (c.section === section && map[c.stage] && matchesFilter(c)) map[c.stage].push(c);
    }
    // Prospectos es una pila (lo más reciente arriba); Procesos conserva el
    // orden que le dan a mano.
    const orden = esPila ? ordenPila : (a, b) => (a.order ?? 0) - (b.order ?? 0);
    for (const col of columns) map[col.id].sort(orden);
    return map;
  }, [clients, section, columns, matchesFilter, esPila]);

  const activeClient = activeId ? clients.find((c) => c.id === activeId) : null;

  // MouseSensor + TouchSensor instead of PointerSensor: on phones a finger
  // fires pointer events too, so PointerSensor would race the browser's native
  // scroll and lose (pointercancel kills the drag). Touch uses hold-to-drag
  // (like Trello/Kommo): press ~200 ms to lift a card, swipe normally to scroll.
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
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
      // En la pila el orden lo da la llegada: no se reacomoda a mano.
      if (esPila) return;
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
      if (esPila) insertIndex = 0; // llega arriba de la pila
      const orderedIds = [
        ...withoutActive.slice(0, insertIndex),
        draggedId,
        ...withoutActive.slice(insertIndex),
      ];
      await applyBoardReorder({ movedId: draggedId, toStage, stageChanged: true, orderedIds });

      // Caer en "Moto Facturada" abre la captura. Si el modal se cancela, la
      // tarjeta vuelve a la columna de donde salió y no se crea comisión.
      if (toStage === 'moto_facturada' && canRegistrarFacturacion(role)) {
        openFacturacion(clients.find((c) => c.id === draggedId), () =>
          applyBoardReorder(regresoAColumna(grouped[fromStage], draggedId, fromStage)),
        );
      }
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
        {(sellers.length > 0 || promotores.length > 0 || esPila) && (
          <div className="px-4 pt-3 sm:px-6">
            <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setFiltrosAbiertos((v) => !v)}
              aria-expanded={filtrosAbiertos}
              className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium transition md:hidden ${
                filtrosActivos
                  ? 'border-gold/30 bg-gold/10 text-gold'
                  : 'border-white/10 text-ink-muted hover:bg-white/5 hover:text-ink'
              }`}
            >
              <SlidersHorizontal size={14} />
              Filtros
              {filtrosActivos > 0 && (
                <span className="m-chip bg-gold/20 text-gold">{filtrosActivos}</span>
              )}
              <ChevronDown
                size={14}
                className={`transition ${filtrosAbiertos ? 'rotate-180' : ''}`}
              />
            </button>
            {esPila && (
              <button
                onClick={() => setSoloSinAtender((v) => !v)}
                aria-pressed={soloSinAtender}
                title="Clientes sin vendedor asignado, o de Alex a los que nadie les ha escrito"
                className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium transition md:py-1.5 ${
                  soloSinAtender
                    ? 'border-state-danger/40 bg-state-danger/15 text-ink'
                    : 'border-white/10 text-ink-muted hover:bg-white/5 hover:text-ink'
                }`}
              >
                <UserX size={14} className={sinAtenderTotal > 0 ? 'text-state-danger' : ''} />
                Sin atender
                <span className={`m-chip ${sinAtenderTotal > 0 ? 'bg-state-danger/20 text-state-danger' : 'bg-white/5 text-ink-faint'}`}>
                  {sinAtenderTotal}
                </span>
              </button>
            )}
            </div>
            <div
              className={`space-y-1.5 md:mt-2 md:block ${filtrosAbiertos ? 'mt-2 block' : 'hidden'}`}
            >
              <FilterRow
                label="Vendedor:"
                items={sellers}
                value={sellerFilter}
                onChange={setSellerFilter}
                colorOf={(v) =>
                  v === UNASSIGNED ? UNASSIGNED_COLOR : sellerColor(v, sellerColors)
                }
              />
              <FilterRow
                label="Promotor:"
                items={promotores}
                value={promotorFilter}
                onChange={setPromotorFilter}
                colorOf={(v) =>
                  v === UNASSIGNED ? UNASSIGNED_COLOR : sellerColor(v, sellerColors)
                }
              />
            </div>
          </div>
        )}

        {section === 'prospectos' && <LeyendaProspectos />}
        {section === 'procesos' && <DinamoEnVivo />}

        {/* Celular: pestañas de etapa con su contador. */}
        <div
          ref={tabsRef}
          role="tablist"
          aria-label="Etapas"
          className="m-noscrollbar flex shrink-0 gap-1.5 overflow-x-auto px-3 pt-3 md:hidden"
        >
          {columns.map((col) => {
            const on = col.id === etapaMovil;
            const salta = AUTO_TRANSITIONS[`${section}:${col.id}`];
            return (
              <button
                key={col.id}
                role="tab"
                aria-selected={on}
                onClick={() => setEtapaMovil(col.id)}
                className={`flex h-10 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl border px-3 text-[13px] font-semibold transition ${
                  on
                    ? 'border-gold bg-gold text-navy-900'
                    : 'border-white/[0.08] bg-navy-800 text-ink-muted'
                }`}
              >
                {col.label}
                {salta ? (
                  <ArrowRight size={14} />
                ) : (
                  <span
                    className={`rounded-full px-1.5 text-[11.5px] tabular-nums ${
                      on ? 'bg-black/15' : 'bg-navy-700'
                    }`}
                  >
                    {grouped[col.id].length}
                  </span>
                )}
              </button>
            );
          })}
        </div>
        <p className="shrink-0 px-4 pt-2 text-xs text-ink-faint md:hidden">
          Etapa {indiceEtapa + 1} de {columns.length} · desliza para cambiar
        </p>

        <div
          className="min-h-0 flex-1 overflow-x-auto overflow-y-hidden px-3 py-2.5 sm:px-6 md:py-4"
          onTouchStart={alTocar}
          onTouchEnd={alSoltar}
        >
          <div className="flex h-full gap-4 md:gap-3">
            {columns.map((col) => (
              <Column
                key={col.id}
                column={col}
                clients={grouped[col.id]}
                locked={!canDropTo(role, section)}
                activa={col.id === etapaMovil}
              />
            ))}
          </div>
        </div>
      </div>

      <DragOverlay>
        {activeClient ? (
          <div className="w-72">
            <CardBody client={activeClient} dragging />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
