import { useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { fullName } from '../../lib/clients.js';
import { SECTIONS, stageLabel } from '../../lib/constants.js';
import Modal from '../ui/Modal.jsx';
import Button from '../ui/Button.jsx';
import Checkbox from '../ui/Checkbox.jsx';

/**
 * Aviso de captura repetida. Además de "Agregar de todos modos", ofrece
 * SUSTITUIR: la tarjeta existente toma los datos nuevos, pasa a ser de quien la
 * captura y (opcional) se pasa a Procesos. Así, si Manuel captura a un cliente
 * que era de Alejandro, no quedan dos tarjetas ni el asignado equivocado.
 */
export default function DuplicateWarningModal({ match, onCancel, onConfirm, onSustituir, capturaEnProcesos = false }) {
  const client = match?.client;
  // Tarjeta de Alex con el mismo teléfono: no se puede crear otra, solo sustituirla.
  const bloquea = !!match?.bloquea;
  const puedeIrAProcesos = !!client && !['procesos', 'ventas'].includes(client.section);
  const [aProcesos, setAProcesos] = useState(true);

  useEffect(() => {
    if (match) setAProcesos(true);
  }, [match]);

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
          {!bloquea && (
            <Button variant="ghost" onClick={onConfirm}>
              Agregar de todos modos
            </Button>
          )}
          <Button variant="gold" onClick={() => onSustituir?.({ aProcesos: puedeIrAProcesos && aProcesos })}>
            Sustituir
          </Button>
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
                  <span className="font-semibold">Alex ya subió a este cliente.</span> Sustitúyelo en vez de crear
                  otra tarjeta: así la venta queda ligada a su anuncio.
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
            <p className="mt-1 text-xs text-ink-muted">Vendedor: {client.createdBy || 'Sin asignar'}</p>
          </div>
          <p className="text-xs text-ink-muted">
            <span className="font-semibold text-ink">Sustituir</span> actualiza esa tarjeta con los datos que
            capturaste y la deja a tu nombre, sin crear otra.
          </p>
          {puedeIrAProcesos && !capturaEnProcesos && (
            <Checkbox checked={aProcesos} onChange={setAProcesos} label="Pasarlo a Procesos (Proceso comenzado)" />
          )}
        </div>
      )}
    </Modal>
  );
}
