import { ETIQUETAS, ORIGENES, SECCIONES } from '../../lib/buro/datos.js';

// Paso 2 del Buró Automático: los 18 campos, agrupados y editables.
// Port de `ine-refacil/static/app.js:147-209`.
//
// Cada sección ocupa una sola fila con tantas columnas como campos tenga, para
// que la pantalla se lea de corrido en vez de ser una cuadrícula de 18 cajas
// iguales donde hay que buscar cada dato.

// De dónde salió el dato → color del punto. Equivale a la leyenda del original
// (cian = leído, oro = calculado, gris = constante), con los tokens de Marga.
const COLOR_ORIGEN = {
  ine: 'bg-sky2',
  calculado: 'bg-gold',
  constante: 'bg-ink-faint',
};

// Escritas literales para que Tailwind las conserve al compilar. `datos.js`
// garantiza que ninguna sección pasa de cuatro campos.
const COLUMNAS = {
  1: 'sm:grid-cols-1',
  2: 'sm:grid-cols-2',
  3: 'sm:grid-cols-3',
  4: 'sm:grid-cols-4',
};

export const LEYENDA_ORIGEN = [
  { origen: 'ine', texto: 'leído de la INE' },
  { origen: 'calculado', texto: 'calculado' },
  { origen: 'constante', texto: 'constante del negocio' },
];

export function PuntoOrigen({ origen, className = '' }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${COLOR_ORIGEN[origen]} ${className}`}
    />
  );
}

/** Esqueleto de carga: 4 filas × 3 bloques, con el barrido escalonado. */
export function EsqueletoCampos() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 4 }, (_, fila) => (
        <div key={fila} className="grid gap-3 sm:grid-cols-3">
          {Array.from({ length: 3 }, (_, col) => (
            <div
              key={col}
              className="h-14 animate-pulse rounded-lg bg-white/5"
              // Desfase por bloque: el barrido recorre la rejilla en vez de
              // latir a la vez.
              style={{ animationDelay: `${(fila * 3 + col) * 60}ms` }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

function Campo({ clave, valor, escrito, onCambiar }) {
  const origen = ORIGENES[clave];
  const vacio = !String(valor ?? '').trim();

  return (
    <div>
      <label
        htmlFor={`buro-campo-${clave}`}
        className="m-label flex items-center gap-1.5"
      >
        <PuntoOrigen origen={origen} />
        {ETIQUETAS[clave]}
      </label>
      <input
        id={`buro-campo-${clave}`}
        value={valor ?? ''}
        onChange={(e) => onCambiar(clave, e.target.value)}
        className={`m-input ${vacio ? 'border-state-danger/70' : ''}
          ${escrito ? 'border-state-success/70 bg-state-success/5' : ''}`}
      />
    </div>
  );
}

export default function FormularioCampos({ campos, escritos, onCambiar }) {
  return (
    <div className="space-y-5">
      {SECCIONES.map(({ titulo, campos: claves }) => (
        <section key={titulo}>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-faint">
            {titulo}
          </h3>
          {/* Una fila por sección en pantalla ancha; apiladas en móvil, donde
              cuatro columnas dejarían las cajas ilegibles. */}
          <div className={`grid grid-cols-1 gap-3 ${COLUMNAS[claves.length]}`}>
            {claves.map((clave) => (
              <Campo
                key={clave}
                clave={clave}
                valor={campos[clave]}
                escrito={escritos.has(clave)}
                onCambiar={onCambiar}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
