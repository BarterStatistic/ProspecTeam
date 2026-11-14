import { useMemo, useState } from 'react';
import { AlertTriangle, Flame, RotateCcw, CalendarDays, CalendarClock, Bike, Bot, Check, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { useData } from '../context/DataContext.jsx';
import { useUI } from '../context/UIContext.jsx';
import { isAdmin } from '../lib/permissions.js';
import { sellerColor, stageLabel } from '../lib/constants.js';
import { fullName } from '../lib/clients.js';
import { formatDateTime, formatDateShort } from '../lib/format.js';
import { colaDelDia } from '../lib/seguimiento.js';
import Card from '../components/ui/Card.jsx';
import Seguimiento from '../components/board/Seguimiento.jsx';

// Cuántas filas se muestran por lista antes de "Ver todos".
const TOPE = 8;

function Seccion({ icon: Icon, titulo, ayuda, total, tono, children }) {
  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center gap-2">
        <Icon size={18} className={tono} />
        <h3 className="text-sm font-semibold text-ink">{titulo}</h3>
        <span className="m-chip bg-white/5 text-ink-muted">{total}</span>
      </div>
      {ayuda && <p className="-mt-2 mb-3 text-xs text-ink-faint">{ayuda}</p>}
      {children}
    </Card>
  );
}

function Vacio({ children }) {
  return <p className="rounded-xl bg-navy-900/40 px-3 py-4 text-center text-xs text-ink-faint">{children}</p>;
}

/** Lista con tope: lo que no cabe se abre con "Ver todos". */
function Lista({ items, render, vacio }) {
  const [todos, setTodos] = useState(false);
  if (items.length === 0) return <Vacio>{vacio}</Vacio>;
  const visibles = todos ? items : items.slice(0, TOPE);
  return (
    <>
      <ul className="space-y-2">{visibles.map(render)}</ul>
      {items.length > TOPE && (
        <button
          onClick={() => setTodos((v) => !v)}
          className="mt-2 text-xs font-medium text-sky2-light hover:underline"
        >
          {todos ? 'Ver menos' : `Ver todos (${items.length})`}
        </button>
      )}
    </>
  );
}

function FilaCliente({ client, mostrarVendedor, sellerColors }) {
  const { openEditClient } = useUI();
  const color = sellerColor(client.createdBy, sellerColors);
  const motivo = client.atributos?.proximo_paso || client.resumenAlex;
  return (
    <li
      style={{ borderLeftColor: color, borderLeftWidth: '4px' }}
      className="rounded-xl border border-white/10 bg-navy-700/60 p-3"
    >
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <button
          onClick={() => openEditClient(client)}
          className="text-left text-sm font-semibold text-ink hover:underline"
        >
          {fullName(client) || 'Sin nombre'}
        </button>
        <span className="text-[11px] text-ink-faint">{stageLabel(client.section, client.stage)}</span>
        {mostrarVendedor && client.createdBy && (
          <span className="text-[11px] font-medium" style={{ color }}>
            {client.createdBy.split(' ')[0]}
          </span>
        )}
      </div>
      {client.motorcycles && (
        <p className="mt-1 flex items-center gap-1.5 text-xs text-ink-muted">
          <Bike size={12} className="text-sky2" /> {client.motorcycles}
        </p>
      )}
      {motivo && (
        <p className="mt-1 flex items-start gap-1.5 text-[11px] leading-snug text-ink-muted">
          <Bot size={11} className="mt-0.5 shrink-0 text-sky2" />
          <span className="line-clamp-2">{motivo}</span>
        </p>
      )}
      <Seguimiento client={client} className="mt-2" />
    </li>
  );
}

function FilaCita({ cita, porCerrar }) {
  const { updateCita } = useData();
  const [error, setError] = useState('');
  const cerrar = (patch) => {
    setError('');
    updateCita(cita.id, patch).catch((err) => setError(err?.message || 'No se pudo guardar.'));
  };
  return (
    <li className="rounded-xl border border-white/10 bg-navy-700/60 p-3">
      <div className="flex flex-wrap items-baseline gap-x-2">
        <span className="text-sm font-semibold text-ink">{cita.clientName || 'Sin nombre'}</span>
        <span className="text-[11px] text-ink-faint">
          {cita.hasTime ? formatDateTime(cita.fechaCita) : formatDateShort(cita.fechaCita)}
        </span>
      </div>
      {cita.motorcycle && (
        <p className="mt-1 flex items-center gap-1.5 text-xs text-ink-muted">
          <Bike size={12} className="text-sky2" /> {cita.motorcycle}
        </p>
      )}
      {porCerrar && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] text-ink-faint">¿Llegó el cliente?</span>
          <button
            onClick={() => cerrar({ atendida: true, notaAtencion: '', fechaAtencion: Date.now() })}
            className="inline-flex items-center gap-1 rounded-lg bg-state-success/15 px-2 py-1 text-[11px] font-medium text-state-success transition hover:bg-state-success/25"
          >
            <Check size={12} /> Sí llegó
          </button>
          <button
            onClick={() => cerrar({ noAsistio: true })}
            className="inline-flex items-center gap-1 rounded-lg bg-white/5 px-2 py-1 text-[11px] font-medium text-ink-muted transition hover:bg-white/10 hover:text-ink"
          >
            <X size={12} /> No llegó
          </button>
        </div>
      )}
      {error && <p className="mt-1 text-[11px] text-state-danger">{error}</p>}
    </li>
  );
}

/**
 * "Mi día": lo que hay que atender hoy, sin recorrer el tablero. El vendedor
 * ve los prospectos de Alex que le tocan; el admin, los de todo el equipo.
 * Los vendedores atienden desde su propio WhatsApp, así que cada fila trae el
 * botón para abrir el chat y registrar el contacto en un toque.
 */
export default function MiDiaView() {
  const { user, role } = useAuth();
  const { clients, citas, sellerColors } = useData();
  const { goToSection } = useUI();
  const admin = isAdmin(role);

  const cola = useMemo(
    () => colaDelDia(clients, citas, { username: user?.username, esAdmin: admin }),
    [clients, citas, user?.username, admin],
  );

  const fila = (c) => (
    <FilaCliente key={c.id} client={c} mostrarVendedor={admin} sellerColors={sellerColors} />
  );

  return (
    <div className="h-full overflow-y-auto p-4 sm:p-6">
      <div className="mx-auto grid max-w-5xl gap-4 lg:grid-cols-2">
        <Seccion
          icon={AlertTriangle}
          tono="text-state-danger"
          titulo="Requieren acción"
          ayuda="Alex pidió que alguien del equipo los atienda."
          total={cola.urgentes.length}
        >
          <Lista items={cola.urgentes} render={fila} vacio="Nadie espera una respuesta urgente." />
        </Seccion>

        <Seccion
          icon={Flame}
          tono="text-orange-400"
          titulo="Calientes sin contactar"
          ayuda="Listos para comprar y todavía sin un mensaje tuyo."
          total={cola.calientes.length}
        >
          <Lista items={cola.calientes} render={fila} vacio="Ya contactaste a todos los calientes." />
        </Seccion>

        <Seccion
          icon={RotateCcw}
          tono="text-sky2-light"
          titulo="Dar seguimiento"
          ayuda="Los contactaste hace 2 días o más, o no contestaron."
          total={cola.seguimiento.length}
        >
          <Lista items={cola.seguimiento} render={fila} vacio="No hay seguimientos pendientes." />
        </Seccion>

        <div className="space-y-4">
          <Seccion icon={CalendarDays} tono="text-gold" titulo="Citas de hoy" total={cola.citasHoy.length}>
            <Lista
              items={cola.citasHoy}
              render={(c) => <FilaCita key={c.id} cita={c} />}
              vacio="No hay citas para hoy."
            />
          </Seccion>

          {cola.citasSinCerrar.length > 0 && (
            <Seccion
              icon={CalendarClock}
              tono="text-state-warning"
              titulo="Citas sin cerrar"
              ayuda="Ya pasaron y nadie registró si el cliente llegó."
              total={cola.citasSinCerrar.length}
            >
              <Lista items={cola.citasSinCerrar} render={(c) => <FilaCita key={c.id} cita={c} porCerrar />} />
            </Seccion>
          )}

          <button
            onClick={() => goToSection('citas')}
            className="text-xs font-medium text-sky2-light hover:underline"
          >
            Abrir la agenda de citas
          </button>
        </div>
      </div>
    </div>
  );
}
