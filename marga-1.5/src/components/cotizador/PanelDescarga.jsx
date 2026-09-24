import { useEffect, useRef, useState } from 'react';
import { X, Download, Table2, SquareCheckBig, CircleDot, Check } from 'lucide-react';
import { formatMXN0 } from '../../lib/format.js';

const MODOS = [
  { id: 'all', nombre: 'Tabla completa', sub: 'Todos los plazos', Icono: Table2 },
  { id: 'multi', nombre: 'Varios plazos', sub: 'Los que elijas', Icono: SquareCheckBig },
  { id: 'single', nombre: 'Un plazo', sub: 'Solo uno', Icono: CircleDot },
];

/**
 * Panel lateral (hoja inferior en móvil) para elegir qué se descarga, igual
 * que el del cotizador original: tabla completa, varios plazos o uno solo.
 * La selección se reinicia cuando cambian los plazos del esquema.
 */
export default function PanelDescarga({ open, onClose, esquema, pagos, onDescargar, onError }) {
  const terms = esquema.terms;
  const [modo, setModo] = useState('all');
  const [marcados, setMarcados] = useState(() => new Set(terms));
  const [unico, setUnico] = useState(terms[0]);
  const [generando, setGenerando] = useState(false);
  const ctaRef = useRef(null);

  // Quincenal ↔ semanal cambia los plazos: la selección se reinicia.
  const clave = terms.join(',');
  useEffect(() => {
    setMarcados(new Set(terms));
    setUnico(terms[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave]);

  useEffect(() => {
    if (!open) return undefined;
    const previo = document.activeElement;
    ctaRef.current?.focus();
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      previo?.focus?.();
    };
  }, [open, onClose]);

  const plazos =
    modo === 'all' ? terms : modo === 'multi' ? terms.filter((t) => marcados.has(t)) : [unico];
  const n = plazos.length;

  function alternar(t) {
    setMarcados((prev) => {
      const s = new Set(prev);
      if (s.has(t)) s.delete(t);
      else s.add(t);
      return s;
    });
  }

  async function descargar() {
    if (!n || generando) return;
    setGenerando(true);
    try {
      await onDescargar({ modo, plazos });
      onClose();
    } catch {
      onError();
    } finally {
      setGenerando(false);
    }
  }

  return (
    <>
      <div
        aria-hidden="true"
        onClick={onClose}
        className={`fixed inset-0 z-[60] bg-black/70 transition-opacity duration-300 ${
          open ? 'visible opacity-100' : 'invisible opacity-0'
        }`}
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="dl-titulo"
        aria-hidden={!open}
        inert={open ? undefined : ''}
        className={`fixed inset-x-0 bottom-0 z-[70] flex max-h-[88vh] flex-col overflow-y-auto rounded-t-2xl border-t border-white/10 bg-navy-800
          transition-transform duration-300 ease-out sm:inset-x-auto sm:right-0 sm:top-0 sm:max-h-none sm:w-[400px] sm:rounded-none sm:border-l sm:border-t-0
          ${open ? 'translate-y-0 sm:translate-x-0' : 'translate-y-full sm:translate-x-full sm:translate-y-0'}`}
      >
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <h2 id="dl-titulo" className="font-head text-lg font-bold text-ink">
            Descargar cotización
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar panel de descarga"
            className="grid h-8 w-8 place-items-center rounded-md text-ink-faint transition hover:bg-white/5 hover:text-ink"
          >
            <X size={16} strokeWidth={2.2} />
          </button>
        </div>

        <div className="flex-1 px-5 py-4">
          <p className="mb-2 text-xs font-semibold text-ink-faint">Qué incluir</p>
          <div className="mb-4 grid gap-1.5" role="group" aria-label="Modo de descarga">
            {MODOS.map(({ id, nombre, sub, Icono }) => {
              const on = modo === id;
              return (
                <button
                  key={id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setModo(id)}
                  className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition ${
                    on ? 'border-gold bg-gold/10' : 'border-white/10 bg-navy-700/60 hover:border-white/20'
                  }`}
                >
                  <span
                    className={`grid h-[30px] w-[30px] flex-none place-items-center rounded-md ${
                      on ? 'bg-gold/15 text-gold' : 'bg-navy-900/60 text-ink-faint'
                    }`}
                  >
                    <Icono size={15} />
                  </span>
                  <span>
                    <span className="block text-sm font-semibold text-ink">{nombre}</span>
                    <span className="block text-xs text-ink-faint">{sub}</span>
                  </span>
                </button>
              );
            })}
          </div>

          {modo !== 'all' && (
            <>
              <p className="mb-2 text-xs font-semibold text-ink-faint">
                {modo === 'multi' ? 'Selecciona los plazos' : 'Selecciona un plazo'}
              </p>
              <div className="grid gap-1.5" role={modo === 'single' ? 'radiogroup' : 'group'}>
                {terms.map((t) => {
                  const on = modo === 'multi' ? marcados.has(t) : unico === t;
                  return (
                    <button
                      key={t}
                      type="button"
                      role={modo === 'multi' ? 'checkbox' : 'radio'}
                      aria-checked={on}
                      onClick={() => (modo === 'multi' ? alternar(t) : setUnico(t))}
                      className={`flex w-full items-center gap-2.5 rounded-lg border px-3 py-2 text-left transition ${
                        on ? 'border-gold bg-gold/10' : 'border-white/10 bg-navy-900/60 hover:border-white/20'
                      }`}
                    >
                      <span
                        className={`grid h-[17px] w-[17px] flex-none place-items-center border ${
                          modo === 'single' ? 'rounded-full' : 'rounded-[5px]'
                        } ${on ? 'border-gold bg-gold text-navy-900' : 'border-white/20'}`}
                      >
                        {on && <Check size={10} strokeWidth={3.4} />}
                      </span>
                      <span className="font-cifra text-sm text-ink">
                        {t} {esquema.termUnit}
                      </span>
                      <span className="ml-auto font-cifra text-sm tabular-nums text-gold-light">
                        {formatMXN0(pagos[t])}
                      </span>
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>

        <div className="border-t border-white/10 px-5 py-4">
          <button
            ref={ctaRef}
            type="button"
            onClick={descargar}
            disabled={!n || generando}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-gold px-4 py-2.5 font-head text-[15px] font-bold text-navy-900 transition hover:bg-gold-light disabled:bg-navy-700 disabled:text-ink-faint"
          >
            <Download size={15} strokeWidth={2.2} />
            {generando ? 'Generando…' : 'Descargar JPG'}
          </button>
          <p className="mt-2 text-center font-cifra text-xs text-ink-faint">
            {n === 0
              ? 'Selecciona al menos un plazo.'
              : n === 1
                ? 'Se descargará 1 plazo.'
                : `Se descargarán ${n} plazos.`}
          </p>
        </div>
      </aside>
    </>
  );
}
