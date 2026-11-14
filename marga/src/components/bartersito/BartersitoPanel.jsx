import { useEffect, useRef, useState } from 'react';
import { Bot, Send, X } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.jsx';
import { store, storeMode } from '../../lib/store/index.js';
import { canUsarBartersito } from '../../lib/permissions.js';
import { preguntarBartersito, SALUDO, SUGERENCIAS } from '../../lib/bartersito.js';

/** Barras horizontales dentro de una respuesta (misma forma que HBarChart). */
function Grafica({ filas }) {
  const max = Math.max(1, ...filas.map((f) => f.value));
  return (
    <ul className="mt-2 min-w-[240px] space-y-1.5">
      {filas.map((f) => (
        <li key={f.label} className="flex items-center gap-2 text-xs">
          <span className="w-28 shrink-0 truncate text-ink-muted">{f.label}</span>
          <span className="h-3 min-w-0 flex-1 overflow-hidden rounded bg-navy-800">
            <span className="block h-full rounded bg-sky2" style={{ width: `${(f.value / max) * 100}%` }} />
          </span>
          <span className="w-6 shrink-0 text-right font-semibold tabular-nums text-ink">{f.value}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * Chat con Bartersito. Solo para el administrador: AppShell no lo monta para
 * otros roles y aquí se vuelve a comprobar por si alguien lo reutiliza.
 * Computadora: panel a la derecha. Celular: pantalla completa.
 */
export default function BartersitoPanel({ open, onClose }) {
  const { role } = useAuth();
  const [mensajes, setMensajes] = useState([{ de: 'bot', texto: SALUDO }]);
  const [texto, setTexto] = useState('');
  const [esperando, setEsperando] = useState(false);
  const finRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (open) finRef.current?.scrollIntoView({ block: 'end' });
  }, [open, mensajes, esperando]);

  useEffect(() => {
    if (open && window.innerWidth >= 768) inputRef.current?.focus();
  }, [open]);

  if (!open || !canUsarBartersito(role)) return null;

  async function enviar(pregunta) {
    const limpio = pregunta.trim();
    if (!limpio || esperando) return;
    setTexto('');
    setMensajes((m) => [...m, { de: 'yo', texto: limpio }]);
    setEsperando(true);
    try {
      const r = await preguntarBartersito(limpio, { role, modo: storeMode, store });
      setMensajes((m) => [...m, { de: 'bot', ...r }]);
    } catch (err) {
      setMensajes((m) => [...m, { de: 'bot', texto: err?.message || 'No se pudo enviar el mensaje.' }]);
    } finally {
      setEsperando(false);
    }
  }

  return (
    <aside
      role="dialog"
      aria-label="Chat con Bartersito"
      className="m-panel-in fixed inset-y-0 right-0 z-[45] flex w-full flex-col border-white/[0.08] bg-navy-800 shadow-card md:w-[380px] md:border-l"
    >
      <header className="flex items-center gap-2.5 border-b border-white/[0.08] py-3 pl-3.5 pr-2">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-navy-700 text-sky2">
          <Bot size={17} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-ink">Bartersito</p>
          <p className="truncate text-[11.5px] text-ink-faint">Solo administrador · el mismo de Telegram</p>
        </div>
        <button
          onClick={onClose}
          aria-label="Cerrar"
          className="grid h-10 w-10 place-items-center rounded-[10px] text-ink-muted transition hover:bg-navy-700 hover:text-ink"
        >
          <X size={19} />
        </button>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-3.5" aria-live="polite">
        {mensajes.map((m, i) =>
          m.de === 'yo' ? (
            <div
              key={i}
              className="max-w-[88%] self-end rounded-[14px] rounded-br-[4px] bg-gold px-3 py-2 text-[13.5px] text-navy-900"
            >
              {m.texto}
            </div>
          ) : (
            <div
              key={i}
              className="max-w-[90%] self-start rounded-[14px] rounded-bl-[4px] bg-navy-700 px-3 py-2 text-[13.5px] text-ink"
            >
              {m.texto}
              {m.grafica && <Grafica filas={m.grafica} />}
            </div>
          ),
        )}
        {esperando && (
          <div className="self-start rounded-[14px] bg-navy-700 px-3 py-2 text-[13.5px] text-ink-faint">
            Escribiendo…
          </div>
        )}
        <div ref={finRef} />
      </div>

      <div className="m-noscrollbar flex gap-1.5 overflow-x-auto px-3.5 pb-2">
        {SUGERENCIAS.map((s) => (
          <button
            key={s}
            onClick={() => enviar(s)}
            className="shrink-0 rounded-full border border-white/[0.08] bg-navy-900 px-3 py-1.5 text-xs font-medium text-ink-muted transition hover:text-ink"
          >
            {s}
          </button>
        ))}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          enviar(texto);
        }}
        className="flex gap-2 border-t border-white/[0.08] px-3.5 pt-2.5"
        style={{ paddingBottom: 'calc(12px + env(safe-area-inset-bottom))' }}
      >
        <input
          ref={inputRef}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="Escríbele a Bartersito…"
          aria-label="Mensaje"
          autoComplete="off"
          className="h-11 min-w-0 flex-1 rounded-[11px] border border-white/[0.08] bg-navy-900 px-3 text-base text-ink outline-none placeholder:text-ink-faint focus:border-sky2"
        />
        <button
          type="submit"
          aria-label="Enviar"
          disabled={esperando}
          className="grid h-11 w-11 shrink-0 place-items-center rounded-[11px] bg-gold text-navy-900 transition disabled:opacity-50"
        >
          <Send size={17} />
        </button>
      </form>
    </aside>
  );
}
