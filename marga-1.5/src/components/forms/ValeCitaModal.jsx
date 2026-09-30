import { useEffect, useState } from 'react';
import { Share2, Ticket } from 'lucide-react';
import { generarValeCita, guardarValeCita } from '../../lib/valeCita.js';
import Modal from '../ui/Modal.jsx';
import Button from '../ui/Button.jsx';

/**
 * Vista previa del "Vale de cita" con el botón para descargarlo o compartirlo.
 * Se abre sola al agendar (o reagendar) una cita y desde el botón "Vale de
 * cita" de cada una. El vale se genera al abrir, así el botón llama al menú de
 * compartir dentro del mismo toque — iOS lo exige para `navigator.share`.
 */
export default function ValeCitaModal({ cita, onClose }) {
  const [blob, setBlob] = useState(null);
  const [preview, setPreview] = useState('');
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (!cita) return undefined;
    let cancelado = false;
    let url = '';
    setBlob(null);
    setPreview('');
    setError('');
    generarValeCita(cita)
      .then((b) => {
        if (cancelado) return;
        url = URL.createObjectURL(b);
        setBlob(b);
        setPreview(url);
      })
      .catch((err) => !cancelado && setError(err?.message || 'No se pudo generar el vale.'));
    return () => {
      cancelado = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [cita]);

  async function guardar() {
    if (!blob) return;
    setGuardando(true);
    setError('');
    try {
      await guardarValeCita(blob, cita);
    } catch (err) {
      setError(err?.message || 'No se pudo descargar el vale.');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Modal
      open={!!cita}
      onClose={onClose}
      title="Vale de cita"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cerrar
          </Button>
          <Button variant="gold" onClick={guardar} disabled={!blob || guardando}>
            <Share2 size={16} /> {guardando ? 'Abriendo…' : 'Descargar / compartir vale'}
          </Button>
        </>
      }
    >
      {cita && (
        <div className="space-y-3">
          <p className="flex items-start gap-2 text-sm text-ink-muted">
            <Ticket size={16} className="mt-0.5 shrink-0 text-gold" />
            <span>
              Mándale este vale a{' '}
              <span className="font-semibold text-ink">{cita.clientName || 'tu cliente'}</span>. Lo
              debe mostrar al llegar a la agencia para que su cita cuente como válida.
            </span>
          </p>
          <p className="text-[11px] text-ink-faint">
            En el celular se abre el menú de compartir: elige WhatsApp para mandárselo directo.
          </p>
          <div className="flex justify-center rounded-xl bg-navy-900/60 p-2">
            {preview ? (
              <img
                src={preview}
                alt={`Vale de cita de ${cita.clientName}`}
                className="max-h-[55vh] w-auto rounded-lg"
              />
            ) : (
              !error && (
                <p className="animate-pulse py-16 text-sm text-ink-muted">Generando el vale…</p>
              )
            )}
          </div>
          {error && <p className="text-sm text-state-danger">{error}</p>}
        </div>
      )}
    </Modal>
  );
}
