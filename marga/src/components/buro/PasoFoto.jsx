import { useRef, useState } from 'react';
import { Upload, Loader2 } from 'lucide-react';
import Button from '../ui/Button.jsx';

// Paso 1 del Buró Automático: elegir la foto del anverso de la INE.
// Port de `ine-refacil/static/app.js:41-108`.

export default function PasoFoto({ archivo, previa, leyendo, estado, onElegir, onLeer }) {
  const inputRef = useRef(null);
  const [encima, setEncima] = useState(false);

  function soltar(evento) {
    evento.preventDefault();
    setEncima(false);
    onElegir(evento.dataTransfer.files[0]);
  }

  return (
    <>
      <label
        htmlFor="buro-archivo"
        onDragEnter={(e) => {
          e.preventDefault();
          setEncima(true);
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setEncima(true);
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          setEncima(false);
        }}
        onDrop={soltar}
        className={`block cursor-pointer rounded-xl border-2 border-dashed p-6 text-center transition
          ${encima ? 'border-sky2 bg-sky2/5' : 'border-white/10 hover:border-sky2/40 hover:bg-white/[0.02]'}`}
      >
        <input
          ref={inputRef}
          id="buro-archivo"
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => onElegir(e.target.files[0])}
        />

        {previa ? (
          <figure className="space-y-2">
            <img
              src={previa}
              alt="Anverso de la credencial cargada"
              className="mx-auto max-h-64 rounded-lg border border-white/10 object-contain"
            />
            <figcaption className="truncate text-xs text-ink-faint">{archivo?.name}</figcaption>
          </figure>
        ) : (
          <div className="space-y-1 py-4">
            <Upload size={28} className="mx-auto text-ink-faint" />
            <p className="text-sm font-medium text-ink-muted">
              Arrastra el anverso de la credencial
            </p>
            <p className="text-xs text-ink-faint">
              o haz clic para elegir el archivo · JPG, PNG o WEBP
            </p>
          </div>
        )}
      </label>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button variant="gold" size="md" disabled={!archivo || leyendo} onClick={onLeer}>
          {leyendo && <Loader2 size={16} className="animate-spin" />}
          Leer credencial
        </Button>

        {archivo && (
          <Button
            variant="ghost"
            size="md"
            onClick={() => {
              // Se limpia el value para que elegir el mismo archivo vuelva a
              // disparar onChange.
              if (inputRef.current) inputRef.current.value = '';
              inputRef.current?.click();
            }}
          >
            Elegir otra foto
          </Button>
        )}
      </div>

      {estado?.texto && (
        <p
          role="status"
          className={`mt-2 text-xs ${estado.malo ? 'text-state-danger' : 'text-ink-faint'}`}
        >
          {estado.texto}
        </p>
      )}
    </>
  );
}
