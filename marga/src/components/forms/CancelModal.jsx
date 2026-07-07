import { useEffect, useState } from 'react';
import { Ban } from 'lucide-react';
import { useData } from '../../context/DataContext.jsx';
import { fullName } from '../../lib/clients.js';
import Modal from '../ui/Modal.jsx';
import Button from '../ui/Button.jsx';
import { Textarea } from '../ui/Input.jsx';

export default function CancelModal({ client, onClose }) {
  const { cancelClient } = useData();
  const [notas, setNotas] = useState('');

  useEffect(() => {
    if (client) setNotas(client.notasRechazo ?? '');
  }, [client]);

  async function confirm() {
    await cancelClient(client.id, notas.trim());
    onClose();
  }

  return (
    <Modal
      open={!!client}
      onClose={onClose}
      title="Cancelar cliente"
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Volver
          </Button>
          <Button variant="danger" onClick={confirm}>
            <Ban size={16} /> Mover a cancelados
          </Button>
        </>
      }
    >
      {client && (
        <div className="space-y-3">
          <p className="text-sm text-ink-muted">
            <span className="font-semibold text-ink">{fullName(client)}</span> se moverá a{' '}
            <span className="text-state-warning">Clientes cancelados</span>.
          </p>
          <Textarea
            label="Notas de rechazo"
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
            placeholder="Motivo del rechazo o la cancelación…"
            rows={4}
          />
        </div>
      )}
    </Modal>
  );
}
