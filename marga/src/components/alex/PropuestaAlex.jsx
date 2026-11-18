import { useEffect, useState } from 'react';
import { Check, X, AlertTriangle, Bot } from 'lucide-react';
import { store, storeMode } from '../../lib/store/index.js';
import { cargarAlex, decidirAlex, pendientes, TIPO_PROPUESTA, efectoDeAprobar } from '../../lib/alexIA.js';
import Card from '../ui/Card.jsx';
import Button from '../ui/Button.jsx';

const ESTADO = {
  pendiente: 'text-gold',
  aprobada: 'text-state-success',
  rechazada: 'text-state-danger',
  caducada: 'text-ink-faint',
};

/** Una propuesta del Supervisor de Alex; si está pendiente, con Aprobar / Rechazar. */
export function Propuesta({ p, onDecidir, ocupado }) {
  return (
    <li className="border-b border-white/[0.08] py-3 last:border-0 last:pb-0">
      <p className="text-[11.5px] text-ink-faint">
        #{p.id} · {TIPO_PROPUESTA[p.tipo] ?? p.tipo}
        {p.estado !== 'pendiente' && (
          <span className={`ml-2 font-semibold ${ESTADO[p.estado] ?? ''}`}>
            {p.estado}
            {p.desde && p.estado !== 'caducada' ? ` desde ${p.desde === 'marga' ? 'Marga' : 'Telegram'}` : ''}
          </span>
        )}
      </p>
      <p className="font-semibold text-ink">{p.titulo}</p>
      {p.problema && <p className="mt-1 text-[12.5px] text-ink-muted">{p.problema}</p>}
      {p.directiva && (
        <p className="mt-2 rounded-[10px] bg-navy-700 px-3 py-2 text-[12.5px] text-ink">
          <span className="block text-[10.5px] font-semibold uppercase tracking-[0.08em] text-ink-faint">
            {p.tipo === 'retirar' ? 'Directiva a retirar' : 'Lo que leería Alex'}
          </span>
          {p.directiva}
        </p>
      )}
      {p.evidencia && p.estado === 'pendiente' && <p className="mt-1.5 text-[12px] text-ink-faint">Evidencia: {p.evidencia}</p>}
      {p.impacto && p.estado === 'pendiente' && <p className="mt-1 text-[12px] text-ink-faint">Qué se espera: {p.impacto}</p>}
      {p.estado === 'pendiente' && onDecidir && (
        <div className="mt-2.5 flex flex-wrap items-center gap-2">
          <Button variant="gold" size="sm" disabled={ocupado} onClick={() => onDecidir(p, 'aprobar')}>
            <Check size={14} /> Aprobar
          </Button>
          <Button variant="outline" size="sm" disabled={ocupado} onClick={() => onDecidir(p, 'rechazar')}>
            <X size={14} /> Rechazar
          </Button>
          <span className="text-[11.5px] text-ink-faint">{efectoDeAprobar(p.tipo)}</span>
        </div>
      )}
    </li>
  );
}

/** Propuestas pendientes del Supervisor de Alex, con su decisión (para "Mi día" → Decisiones). */
export function PropuestasAlexPendientes({ onCambio }) {
  const [estado, setEstado] = useState(undefined);
  const [recarga, setRecarga] = useState(0);
  const [ocupado, setOcupado] = useState(false);
  const [aviso, setAviso] = useState(null);

  useEffect(() => {
    let vivo = true;
    cargarAlex(storeMode, store)
      .then((r) => vivo && setEstado(r))
      .catch((err) => vivo && setEstado({ error: err?.message || 'No se pudieron leer las propuestas.' }));
    return () => {
      vivo = false;
    };
  }, [recarga]);

  async function onDecidir(p, accion) {
    setOcupado(true);
    setAviso(null);
    const r = await decidirAlex(storeMode, store, { id: p.id, accion });
    setOcupado(false);
    setAviso(r.ok ? { ok: true, texto: r.mensaje ?? 'Listo.' } : { ok: false, texto: r.error ?? 'No se pudo decidir.' });
    setRecarga((n) => n + 1);
    onCambio?.();
  }

  const lista = estado?.datos ? pendientes(estado.datos) : [];

  return (
    <Card className="p-4">
      <div className="mb-2 flex items-center gap-2">
        <Bot size={16} className="text-sky2" />
        <h3 className="font-head text-[15.5px] font-bold text-ink">Supervisor de Alex</h3>
        <span className="m-chip bg-white/5 text-ink-muted">{lista.length}</span>
      </div>
      {aviso && (
        <p className="mb-2 flex items-start gap-2 rounded-[10px] bg-navy-700 px-3 py-2 text-[12.5px] text-ink-muted">
          {aviso.ok ? <Check size={15} className="mt-px text-state-success" /> : <AlertTriangle size={15} className="mt-px text-state-danger" />}
          {aviso.texto}
        </p>
      )}
      {estado === undefined ? (
        <p className="py-4 text-center text-xs text-ink-faint">Cargando…</p>
      ) : !estado.datos ? (
        <p className="py-4 text-center text-xs text-ink-faint">{estado.error ?? 'El Supervisor de Alex todavía no está conectado.'}</p>
      ) : lista.length === 0 ? (
        <p className="py-4 text-center text-xs text-ink-faint">Nada por decidir. El próximo reporte semanal sale el lunes.</p>
      ) : (
        <ul>
          {lista.map((p) => (
            <Propuesta key={p.id} p={p} onDecidir={onDecidir} ocupado={ocupado} />
          ))}
        </ul>
      )}
    </Card>
  );
}
