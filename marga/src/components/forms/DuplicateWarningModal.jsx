import { AlertTriangle } from 'lucide-react';
import { fullName } from '../../lib/clients.js';
import { SECTIONS, stageLabel } from '../../lib/constants.js';
import Modal from '../ui/Modal.jsx';
import Button from '../ui/Button.jsx';

export default function DuplicateWarningModal({ match, onCancel, onConfirm, onConvertir }) {
  const client = match?.client;
  // Tarjeta de Alex con el mismo teléfono: no se puede crear otra, solo convertirla.
  const bloquea = !!match?.bloquea;
  return (
    <Modal
      open={!!match}
      onClose={onCancel}
      title="Posible cliente duplicado"
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onCancel}>
            Revisar
          </Button>
          {bloquea ? (
            <Button variant="gold" onClick={onConvertir}>
              Pasar a Procesos
            </Button>
          ) : (
            <Button variant="gold" onClick={onConfirm}>
              Agregar de todos modos
            </Button>
          )}
        </>
      }
    >
      {client && (
        <div className="space-y-3 text-sm">
          <div className="flex items-start gap-2 text-state-warning">
            <AlertTriangle size={18} className="mt-0.5 shrink-0" />
            <p>
              {bloquea ? (
                <>
                  <span className="font-semibold">Alex ya subió a este cliente.</span> Conviértelo en proceso
                  en vez de crear otra tarjeta: así la venta queda ligada a su anuncio.
                </>
              ) : (
                <>
                  Ya existe un cliente con el mismo <span className="font-semibold">{match.reason}</span>.
                </>
              )}
            </p>
          </div>
          <div className="rounded-lg border border-white/10 bg-navy-900/50 p-3">
            <p className="font-semibold text-ink">{fullName(client)}</p>
            <p className="text-gold">{client.phone}</p>
            <p className="mt-1 text-xs text-ink-muted">
              En: {SECTIONS[client.section]?.label}
              {client.stage ? ` · ${stageLabel(client.section, client.stage)}` : ''}
            </p>
          </div>
        </div>
      )}
    </Modal>
  );
}
