import { useMemo, useRef, useState } from 'react';
import { Search, X, Check } from 'lucide-react';
import { MODELS } from '../../lib/motos.js';

/** Quita acentos y pasa a minúsculas, para buscar sin pelearse con la tilde. */
function slug(str) {
  return String(str)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

/**
 * Selector múltiple de motos con búsqueda sobre el catálogo del cotizador.
 * El valor se guarda como texto separado por comas ("U2, B52 250") para seguir
 * siendo compatible con lo que ya hay capturado en la base. Los nombres que no
 * están en el catálogo se conservan como chip, no se borran.
 */
export default function MotoPicker({ label = 'Moto(s)', value = '', onChange }) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const boxRef = useRef(null);

  const seleccionadas = useMemo(
    () => value.split(',').map((s) => s.trim()).filter(Boolean),
    [value],
  );

  const resultados = useMemo(() => {
    const q = slug(query.trim());
    if (!q) return MODELS;
    return MODELS.filter((m) => slug(m.nombre).includes(q));
  }, [query]);

  const emit = (lista) => onChange?.(lista.join(', '));

  const toggle = (nombre) => {
    emit(
      seleccionadas.includes(nombre)
        ? seleccionadas.filter((n) => n !== nombre)
        : [...seleccionadas, nombre],
    );
  };

  return (
    <div
      ref={boxRef}
      onBlur={(e) => {
        if (!boxRef.current?.contains(e.relatedTarget)) setOpen(false);
      }}
    >
      <span className="m-label">{label}</span>

      {seleccionadas.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {seleccionadas.map((nombre) => (
            <span key={nombre} className="m-chip bg-gold/15 text-gold">
              {nombre}
              <button
                type="button"
                onClick={() => emit(seleccionadas.filter((n) => n !== nombre))}
                aria-label={`Quitar ${nombre}`}
                className="ml-0.5 rounded-full p-0.5 transition hover:bg-gold/20"
              >
                <X size={11} />
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="relative">
        <Search
          size={15}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint"
        />
        <input
          className="m-input pl-9"
          placeholder="Buscar modelo…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            // Este input vive dentro del <form> de ClientFormModal, que tiene
            // un submit oculto para que Enter guarde el cliente desde campos
            // de texto normales (Nombre(s), etc.). Aquí Enter significa otra
            // cosa: elegir el primer resultado visible, nunca disparar ese
            // submit. preventDefault() en el evento de teclado del input
            // cancela la acción por defecto asociada a Enter dentro de un
            // <form> (que es "hacer submit"), así que el botón oculto de
            // ClientFormModal nunca se activa.
            if (e.key === 'Enter') {
              e.preventDefault();
              if (resultados.length > 0) {
                toggle(resultados[0].nombre);
                setQuery('');
                setOpen(false);
              }
              return;
            }
            // Escape cierra la lista de resultados sin cerrar el modal.
            // stopPropagation() evita que el keydown llegue al listener que
            // Modal.jsx registra con document.addEventListener('keydown', ...)
            // (React 18 delega los eventos en el contenedor raíz, no en
            // document; al parar la propagación ahí el evento nativo no sigue
            // subiendo hasta el listener de document, así que Modal nunca ve
            // este Escape). Si la lista ya está cerrada, no interceptamos:
            // Escape sigue su comportamiento normal de cerrar el modal.
            if (e.key === 'Escape' && open) {
              e.stopPropagation();
              setOpen(false);
            }
          }}
        />
      </div>

      {open && (
        <div className="mt-1 max-h-56 overflow-y-auto rounded-lg border border-white/10 bg-navy-900/95 p-1 shadow-card">
          {resultados.length === 0 ? (
            <p className="px-3 py-3 text-center text-xs text-ink-faint">
              Ningún modelo coincide con "{query}".
            </p>
          ) : (
            resultados.map((m) => {
              const on = seleccionadas.includes(m.nombre);
              return (
                <button
                  key={m.nombre}
                  type="button"
                  onClick={() => {
                    toggle(m.nombre);
                    setQuery('');
                    setOpen(false);
                  }}
                  className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-xs transition
                    ${on ? 'bg-gold/15 text-gold' : 'text-ink-muted hover:bg-white/5 hover:text-ink'}`}
                >
                  <Check size={13} className={on ? 'opacity-100' : 'opacity-0'} />
                  <span className="flex-1">{m.nombre}</span>
                  <span className="text-ink-faint">
                    ${m.precio.toLocaleString('es-MX')}
                  </span>
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
