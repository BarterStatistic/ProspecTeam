import { useState } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  MoreVertical,
  Pencil,
  Ban,
  Trash2,
  Undo2,
  Phone,
  Bike,
  Clock,
  UserCheck,
  UserRound,
  UserCog,
  StickyNote,
} from 'lucide-react';
import { useData } from '../../context/DataContext.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useUI } from '../../context/UIContext.jsx';
import { canDeleteClient, canDropTo, canEditClient } from '../../lib/permissions.js';
import { BOARD_COLUMNS, sellerColor } from '../../lib/constants.js';
import { fullName } from '../../lib/clients.js';
import { formatDateTime } from '../../lib/format.js';
import Checkbox from '../ui/Checkbox.jsx';
import CopyButton from '../ui/CopyButton.jsx';
import Avatar from '../ui/Avatar.jsx';

// Stops press events from bubbling to the drag sensors, so interactive controls
// (checkbox, menu) keep working without starting a drag. MouseSensor listens to
// mousedown and TouchSensor to touchstart, so all three streams must be stopped.
const stopPress = (e) => e.stopPropagation();
const noDrag = { onPointerDown: stopPress, onMouseDown: stopPress, onTouchStart: stopPress };

export function CardBody({ client, dragging = false }) {
  const { updateClient, deleteClient, moveClient, sellerColors, sellerAvatars } = useData();
  const { user, role } = useAuth();
  const { openEditClient, openCancelClient } = useUI();
  const [menuOpen, setMenuOpen] = useState(false);

  const editable = canEditClient(role, client, user?.username);
  const deletable = canDeleteClient(role, client, user?.username);
  const hasMenu = editable || deletable;
  const inProcesos = client.section === 'procesos';
  // "Mover a…" list: lets a card jump to any column without dragging, which
  // matters because the last columns sit off-screen on most displays.
  const boardColumns = BOARD_COLUMNS[client.section] ?? [];
  const canMove = editable && canDropTo(role, client.section) && boardColumns.length > 1;
  // Accent colour by who captured the client (createdBy): a left stripe on the
  // card + a tinted "Registró" line, so cards are scannable by seller.
  const accent = sellerColor(client.createdBy, sellerColors);

  return (
    <div
      style={{ borderLeftColor: accent, borderLeftWidth: '4px' }}
      className={`group relative rounded-xl border border-white/10 bg-navy-700/80 p-3 shadow-card transition
        ${dragging ? 'ring-2 ring-sky2/60' : 'hover:border-white/20'}`}
    >
      <div className="flex items-start justify-between gap-2">
        {/* Profile picture of whoever registered the client, when they set one */}
        <Avatar
          photo={sellerAvatars[client.createdBy]}
          name={client.createdBy}
          color={accent}
          size={22}
          className="mt-0.5"
        />
        <h4 className="min-w-0 flex-1 break-words pr-1 text-sm font-semibold text-ink">
          {fullName(client) || 'Sin nombre'}
        </h4>
        {hasMenu && (
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
                <div className="absolute right-0 z-50 mt-1 max-h-[70vh] w-56 overflow-y-auto rounded-lg border border-white/10 bg-navy-800 shadow-card">
                  {editable && (
                    <>
                      <button
                        onClick={() => {
                          setMenuOpen(false);
                          openEditClient(client);
                        }}
                        className="flex w-full items-center gap-2 px-3 py-2 text-xs text-ink hover:bg-white/5"
                      >
                        <Pencil size={14} /> Editar
                      </button>

                      {canMove && (
                        <>
                          <div className="border-t border-white/5 px-3 pb-1 pt-2 text-[10px] font-medium uppercase tracking-wide text-ink-faint">
                            Mover a
                          </div>
                          {boardColumns.map((col) => {
                            const isCurrent = col.id === client.stage;
                            return (
                              <button
                                key={col.id}
                                disabled={isCurrent}
                                onClick={() => {
                                  setMenuOpen(false);
                                  moveClient(client.id, client.section, col.id);
                                }}
                                className={`flex w-full items-center gap-2 px-3 py-2 text-left text-xs ${
                                  isCurrent
                                    ? 'cursor-default text-ink-faint'
                                    : 'text-ink hover:bg-white/5'
                                }`}
                              >
                                <span
                                  className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                                    isCurrent ? 'bg-gold' : 'bg-white/25'
                                  }`}
                                />
                                <span className="flex-1">{col.label}</span>
                              </button>
                            );
                          })}
                          <div className="border-t border-white/5" />
                        </>
                      )}
                      <button
                        onClick={() => {
                          setMenuOpen(false);
                          openCancelClient(client);
                        }}
                        className="flex w-full items-center gap-2 px-3 py-2 text-xs text-state-warning hover:bg-white/5"
                      >
                        <Ban size={14} /> Cancelar cliente
                      </button>
                      {/* Undo an accidental hand-off: land on the last real
                          Prospectos stage (not "Proceso comenzado", which would
                          auto-transition the client straight back to Procesos). */}
                      {inProcesos && (
                        <button
                          onClick={() => {
                            setMenuOpen(false);
                            if (
                              confirm(
                                `¿Regresar a ${fullName(client)} de Procesos a Prospectos (Envío de docs / Cita agendada)?`,
                              )
                            )
                              moveClient(client.id, 'prospectos', 'envio_docs_cita');
                          }}
                          className="flex w-full items-center gap-2 px-3 py-2 text-xs text-sky2-light hover:bg-white/5"
                        >
                          <Undo2 size={14} /> Regresar a Prospectos
                        </button>
                      )}
                    </>
                  )}
                  {deletable && (
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
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      <div className="mt-2 space-y-1 text-xs text-ink-muted">
        {client.phone && (
          <div className="flex items-center gap-1.5">
            <Phone size={12} className="text-sky2" />
            <span className="text-gold">{client.phone}</span>
            <CopyButton value={client.phone} label="Copiar teléfono" {...noDrag} />
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
        {client.createdBy && (
          <div className="flex items-center gap-1.5" style={{ color: accent }}>
            <UserRound size={12} />
            <span className="truncate font-medium">Registró: {client.createdBy}</span>
          </div>
        )}
        {/* Who follows up this proceso. Only meaningful on the Procesos board,
            where an unassigned card is worth spotting at a glance. */}
        {inProcesos &&
          (client.promotorEncargado ? (
            <div
              className="flex items-center gap-1.5"
              style={{ color: sellerColor(client.promotorEncargado, sellerColors) }}
            >
              <UserCog size={12} />
              <span className="truncate font-medium">Promotor: {client.promotorEncargado}</span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 text-ink-faint">
              <UserCog size={12} />
              <span className="truncate italic">Sin promotor</span>
            </div>
          ))}
      </div>

      {client.notes && (
        <div className="mt-2 flex items-start gap-1.5 rounded-lg bg-navy-900/50 px-2 py-1.5">
          <StickyNote size={11} className="mt-0.5 shrink-0 text-gold/70" />
          <p className="line-clamp-2 whitespace-pre-line text-[11px] italic leading-snug text-ink-muted">
            {client.notes}
          </p>
        </div>
      )}

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
          onChange={(v) => editable && updateClient(client.id, { buroAutorizado: v })}
          disabled={!editable}
          label="Buró autorizado"
          className={`text-[11px] text-ink-muted ${editable ? '' : 'cursor-default opacity-60'}`}
        />
      </div>

      {inProcesos && (
        <div className="mt-1.5 flex items-center justify-between" {...noDrag}>
          <Checkbox
            checked={!!client.engancheDejado}
            onChange={(v) => editable && updateClient(client.id, { engancheDejado: v })}
            disabled={!editable}
            label="Enganche dejado"
            className={`text-[11px] text-ink-muted ${editable ? '' : 'cursor-default opacity-60'}`}
          />
        </div>
      )}

      <div className="mt-1.5 flex items-center gap-1 text-[10px] text-ink-faint">
        <Clock size={10} />
        <span>{formatDateTime(client.updatedAt)}</span>
      </div>
    </div>
  );
}

export default function ClientCard({ client }) {
  const { user, role } = useAuth();
  const draggable = canEditClient(role, client, user?.username);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: client.id,
    disabled: !draggable,
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
      className={draggable ? 'm-draggable cursor-grab active:cursor-grabbing' : ''}
      {...attributes}
      {...listeners}
    >
      <CardBody client={client} />
    </div>
  );
}
