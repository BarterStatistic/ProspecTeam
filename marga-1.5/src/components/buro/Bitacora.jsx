import { useEffect, useRef } from 'react';
import { TOTAL_CAMPOS } from '../../lib/buro/datos.js';

// Paso 3 del Buró Automático: el llenado en vivo.
// Port de `ine-refacil/static/app.js:213-284`.

const ICONOS = { inicio: '·', campo: '✓', aviso: '!', error: '✕', fin: '■' };

const CLASES = {
  inicio: 'text-ink-faint',
  campo: 'text-state-success',
  aviso: 'text-state-warning',
  error: 'text-state-danger',
  fin: 'text-sky2',
};

export default function Bitacora({ entradas, progreso, completo }) {
  const lista = useRef(null);

  // La bitácora se sigue leyendo sola mientras Selenium escribe.
  useEffect(() => {
    if (lista.current) lista.current.scrollTop = lista.current.scrollHeight;
  }, [entradas.length]);

  const porcentaje = Math.min((progreso / TOTAL_CAMPOS) * 100, 100);

  return (
    <div className="space-y-3">
      <div>
        <div className="h-1.5 overflow-hidden rounded-full bg-white/5">
          <span
            className={`block h-full rounded-full transition-all duration-300
              ${completo ? 'bg-state-success' : 'bg-sky2'}`}
            style={{ width: `${porcentaje}%` }}
          />
        </div>
        <p className="mt-1.5 text-xs text-ink-faint">
          <strong className="text-ink-muted">{progreso}</strong> de {TOTAL_CAMPOS} campos
        </p>
      </div>

      <ul
        ref={lista}
        className="max-h-64 space-y-1 overflow-y-auto rounded-lg bg-navy-900/40 p-3 font-mono text-xs"
      >
        {entradas.map((entrada, i) => (
          // Los mensajes se repiten entre corridas, así que el índice es la
          // única llave estable: la lista solo crece por el final.
          <li key={i} className="flex gap-2">
            <span className={`shrink-0 ${CLASES[entrada.tipo] ?? 'text-ink-faint'}`}>
              {ICONOS[entrada.tipo] ?? '·'}
            </span>
            <span className="min-w-0 break-words text-ink-muted">{entrada.mensaje}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
