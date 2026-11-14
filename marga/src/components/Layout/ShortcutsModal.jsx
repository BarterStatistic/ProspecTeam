import Modal from '../ui/Modal.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { canAddClient, canUsarBartersito } from '../../lib/permissions.js';
import { destinosDe } from './navegacion.js';

function Fila({ teclas, children }) {
  return (
    <div className="flex items-center gap-1.5 py-1.5 text-sm text-ink">
      <span className="flex-1">{children}</span>
      {teclas.map((t, i) =>
        t === 'o' ? (
          <span key={i} className="text-xs text-ink-faint">
            o
          </span>
        ) : (
          <kbd key={i} className="m-kbd">
            {t}
          </kbd>
        ),
      )}
    </div>
  );
}

function Grupo({ titulo, children }) {
  return (
    <div className="mt-3 first:mt-0">
      <p className="mb-0.5 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-ink-faint">
        {titulo}
      </p>
      {children}
    </div>
  );
}

/** Glosario de atajos. Solo lista lo que el rol de la sesión puede usar. */
export default function ShortcutsModal({ open, onClose }) {
  const { role } = useAuth();
  const conTecla = destinosDe(role).filter((d) => d.tecla);
  const puedeAgregar = canAddClient(role, 'prospectos') || canAddClient(role, 'procesos');

  return (
    <Modal open={open} onClose={onClose} title="Atajos de teclado" size="sm">
      <p className="mb-3 text-xs text-ink-faint">
        Una sola tecla, sin Ctrl. No funcionan mientras escribes en un campo.
      </p>
      <Grupo titulo="Crear y buscar">
        {puedeAgregar && <Fila teclas={['N']}>Nuevo cliente</Fila>}
        <Fila teclas={['/', 'o', 'Ctrl', 'K']}>Buscar cliente o teléfono</Fila>
      </Grupo>
      <Grupo titulo="Ir a">
        {conTecla.map((d) => (
          <Fila key={d.id} teclas={[d.tecla]}>
            {d.label}
          </Fila>
        ))}
      </Grupo>
      <Grupo titulo="General">
        {canUsarBartersito(role) && <Fila teclas={['B']}>Hablar con Bartersito</Fila>}
        <Fila teclas={['?']}>Ver estos atajos</Fila>
        <Fila teclas={['Esc']}>Cerrar la ventana abierta</Fila>
      </Grupo>
    </Modal>
  );
}
