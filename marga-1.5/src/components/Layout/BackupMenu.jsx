import { useRef, useState } from 'react';
import { Database, Download, Upload } from 'lucide-react';
import { useData } from '../../context/DataContext.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { canImportBackup } from '../../lib/permissions.js';
import { toDateInput } from '../../lib/format.js';
import Button from '../ui/Button.jsx';
import Modal from '../ui/Modal.jsx';

export default function BackupMenu() {
  const { exportAll, importAll } = useData();
  const { role } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [pending, setPending] = useState(null); // parsed backup awaiting a mode choice
  const [error, setError] = useState('');
  const [result, setResult] = useState('');
  const fileRef = useRef(null);

  async function handleExport() {
    setMenuOpen(false);
    const data = await exportAll();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `marga-backup-${toDateInput(Date.now())}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handlePickFile() {
    setMenuOpen(false);
    fileRef.current?.click();
  }

  async function handleFileChange(e) {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-selecting the same file later
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      if (!parsed || !Array.isArray(parsed.clients)) {
        throw new Error('El archivo no contiene un respaldo de Marga válido.');
      }
      setError('');
      setPending(parsed);
    } catch (err) {
      setError(err.message || 'No se pudo leer el archivo.');
      setPending({}); // open modal to show the error
    }
  }

  async function runImport(mode) {
    try {
      const count = await importAll(pending, mode);
      setResult(`Se importaron ${count} cliente(s) correctamente.`);
    } catch (err) {
      setError(err.message || 'Error al importar.');
      return;
    }
    setPending(null);
  }

  return (
    <div className="relative">
      <Button variant="outline" size="md" onClick={() => setMenuOpen((v) => !v)} aria-label="Respaldo">
        <Database size={18} />
        <span className="hidden sm:inline">Respaldo</span>
      </Button>

      {menuOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
          <div className="absolute right-0 z-50 mt-2 w-52 overflow-hidden rounded-xl border border-white/10 bg-navy-800 shadow-card">
            <button
              onClick={handleExport}
              className="flex w-full items-center gap-2 px-4 py-2.5 text-sm text-ink hover:bg-white/5"
            >
              <Download size={16} className="text-sky2" /> Exportar respaldo
            </button>
            {canImportBackup(role) && (
              <button
                onClick={handlePickFile}
                className="flex w-full items-center gap-2 px-4 py-2.5 text-sm text-ink hover:bg-white/5"
              >
                <Upload size={16} className="text-gold" /> Importar respaldo
              </button>
            )}
          </div>
        </>
      )}

      <input
        ref={fileRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={handleFileChange}
      />

      {/* Confirm import mode / show errors */}
      <Modal
        open={pending !== null}
        onClose={() => {
          setPending(null);
          setError('');
        }}
        title="Importar respaldo"
        size="sm"
        footer={
          !error && (
            <>
              <Button variant="ghost" onClick={() => setPending(null)}>
                Cancelar
              </Button>
              <Button variant="outline" onClick={() => runImport('merge')}>
                Fusionar
              </Button>
              <Button variant="danger" onClick={() => runImport('replace')}>
                Reemplazar todo
              </Button>
            </>
          )
        }
      >
        {error ? (
          <p className="text-sm text-state-danger">{error}</p>
        ) : (
          <p className="text-sm text-ink-muted">
            Se encontraron <span className="text-gold">{pending?.clients?.length ?? 0}</span>{' '}
            cliente(s) en el archivo.
            <br />
            <br />
            <span className="text-ink">Fusionar</span>: agrega o actualiza sin borrar lo existente.
            <br />
            <span className="text-ink">Reemplazar todo</span>: borra los datos actuales y usa solo
            los del respaldo.
          </p>
        )}
      </Modal>

      {/* Result toast */}
      <Modal open={!!result} onClose={() => setResult('')} title="Respaldo importado" size="sm">
        <p className="text-sm text-ink-muted">{result}</p>
      </Modal>
    </div>
  );
}
