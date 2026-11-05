import { useCallback, useEffect, useRef, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import Modal from '../ui/Modal.jsx';
import { useData } from '../../context/DataContext.jsx';
import { ETAPA_NOMBRE, ETAPAS, ESTADO_ETAPA_NOMBRE, estadoEtapa, hace, resumen } from '../../lib/dinamo.js';

// Folio y avance del crédito en Dinamo, dentro de la tarjeta de Procesos.
// Los puntos son las 7 etapas de la bandeja con los colores de su leyenda;
// tocarlos abre el detalle (buró, visitas, call center, evaluación).

const PUNTO = {
  ok: 'bg-state-success text-navy-900',
  proceso: 'bg-sky2 text-navy-900',
  correccion: 'bg-state-warning text-navy-900',
  rechazado: 'bg-state-danger text-navy-900',
  vacio: 'border border-white/20 bg-transparent',
};
const SIMBOLO = { ok: '✓', proceso: '', correccion: '!', rechazado: '✕', vacio: '' };
const TONO_RESUMEN = {
  autorizado: 'text-state-success',
  proceso: 'text-sky2-light',
  correccion: 'text-state-warning',
  rechazado: 'text-state-danger',
};
const CON_DETALLE = { BNC: 'bnc', VF: 'vf', CC: 'cc', EC: 'ec' };

function Punto({ etapa, estado }) {
  return (
    <span className="flex flex-col items-center gap-0.5" title={`${ETAPA_NOMBRE[etapa]}: ${ESTADO_ETAPA_NOMBRE[estado]}`}>
      <span
        className={`flex h-3.5 w-3.5 items-center justify-center rounded-full text-[8px] font-bold leading-none ${PUNTO[estado]}`}
        aria-hidden="true"
      >
        {SIMBOLO[estado]}
      </span>
      <span className="font-cifra text-[8px] uppercase leading-none text-ink-faint">{etapa === 'Captura' ? 'Cap' : etapa}</span>
    </span>
  );
}

/** Chip de folio + puntos de etapa. `noDrag` evita que el toque arrastre la tarjeta. */
export default function EtapasDinamo({ folio, credito, noDrag }) {
  const [abierto, setAbierto] = useState(false);
  if (!folio) return null;
  const r = credito ? resumen(credito) : null;

  return (
    <div className="mt-2 rounded-lg bg-navy-900/50 px-2 py-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="shrink-0 whitespace-nowrap font-cifra text-[11px] text-gold">Folio {folio}</span>
        {r ? (
          <span className={`truncate text-[10px] font-medium ${TONO_RESUMEN[r.estado]}`}>{r.detalle}</span>
        ) : (
          <span className="text-[10px] italic text-ink-faint">Sin datos de Dinamo</span>
        )}
      </div>
      {credito && (
        <button
          type="button"
          {...noDrag}
          onClick={() => setAbierto(true)}
          className="mt-1.5 flex w-full items-center justify-between gap-1 rounded-md px-0.5 py-0.5 transition hover:bg-white/5"
          aria-label={`Ver detalle de Dinamo del folio ${folio}`}
        >
          {ETAPAS.map((e) => (
            <Punto key={e} etapa={e} estado={estadoEtapa(credito.etapas?.[e])} />
          ))}
        </button>
      )}
      {abierto && <DetalleDinamo credito={credito} onClose={() => setAbierto(false)} />}
    </div>
  );
}

// ─── Detalle ────────────────────────────────────────────────────────────────

/** Una lectura más vieja que esto se vuelve a pedir al abrirla. */
const LECTURA_VIGENTE_MS = 30 * 60 * 1000;

/**
 * Trae el detalle del crédito (todas sus etapas llegan juntas). Si no hay
 * lectura, se la pide a las máquinas y sondea cada 12 s hasta que llegue.
 */
function useDetalle(folio) {
  const { dinamo } = useData();
  const [estado, setEstado] = useState('cargando'); // cargando | listo | pidiendo | error
  const [detalle, setDetalle] = useState(null);
  const [error, setError] = useState('');
  const sondeo = useRef(null);

  const parar = () => {
    if (sondeo.current) clearInterval(sondeo.current);
    sondeo.current = null;
  };

  const sondear = useCallback(
    (antes) => {
      parar();
      sondeo.current = setInterval(async () => {
        try {
          const d = (await dinamo.detalle(folio)) ?? {};
          if (d.datos && d.actualizado_en !== antes) {
            antes = d.actualizado_en;
            setDetalle(d);
            setEstado('listo');
          }
          if (!d.pendiente && d.datos) parar();
        } catch {
          /* reintenta en el próximo sondeo */
        }
      }, 12000);
    },
    [dinamo, folio],
  );

  const pedir = useCallback(async () => {
    setError('');
    try {
      const antes = (await dinamo.detalle(folio))?.actualizado_en ?? null;
      await dinamo.pedirDetalle(folio);
      setEstado((e) => (e === 'listo' ? e : 'pidiendo'));
      setDetalle((d) => (d ? { ...d, pendiente: true } : d));
      sondear(antes);
    } catch (err) {
      setError(err.message);
      setEstado('error');
    }
  }, [dinamo, folio, sondear]);

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const d = (await dinamo.detalle(folio)) ?? {};
        if (!vivo) return;
        if (d.datos) {
          setDetalle(d);
          setEstado('listo');
          if (d.pendiente) sondear(d.actualizado_en);
          else if (Date.now() - Date.parse(d.actualizado_en) > LECTURA_VIGENTE_MS) await pedir();
        } else await pedir();
      } catch (err) {
        if (!vivo) return;
        setError(err.message);
        setEstado('error');
      }
    })();
    return () => {
      vivo = false;
      parar();
    };
  }, [dinamo, folio, pedir, sondear]);

  return { estado, detalle, error, pedir };
}

function DetalleDinamo({ credito, onClose }) {
  const abribles = Object.keys(CON_DETALLE);
  const [etapa, setEtapa] = useState(() => {
    // Abre en la primera etapa con algo que atender, o en BNC.
    const pendiente = abribles.find((e) => !['ok', 'vacio'].includes(estadoEtapa(credito.etapas?.[e])));
    return pendiente ?? 'BNC';
  });
  const { estado, detalle, error, pedir } = useDetalle(credito.folio);
  const datos = detalle?.datos?.[CON_DETALLE[etapa]];

  return (
    <Modal open onClose={onClose} title={`Dinamo · Folio ${credito.folio}`} size="lg">
      <div className="space-y-3">
        <div className="text-xs text-ink-muted">
          <div className="font-semibold text-ink">{credito.cliente}</div>
          {[credito.esquema, credito.moto, credito.puntoVenta].filter(Boolean).join(' · ')}
          {credito.fechaCaptura && <> · Captura {credito.fechaCaptura}</>}
        </div>

        <div className="flex flex-wrap gap-1.5" role="tablist">
          {abribles.map((e) => {
            const est = estadoEtapa(credito.etapas?.[e]);
            return (
              <button
                key={e}
                type="button"
                role="tab"
                aria-selected={e === etapa}
                onClick={() => setEtapa(e)}
                className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition ${
                  e === etapa ? 'bg-gold/20 text-gold' : 'bg-white/5 text-ink-muted hover:bg-white/10 hover:text-ink'
                }`}
              >
                <span className={`h-2 w-2 rounded-full ${PUNTO[est]}`} aria-hidden="true" />
                {ETAPA_NOMBRE[e]}
              </button>
            );
          })}
        </div>

        <div className="min-h-[120px] rounded-xl bg-navy-900/50 p-3 text-xs text-ink" role="tabpanel">
          {estado === 'cargando' && <p className="animate-pulse text-ink-muted">Cargando…</p>}
          {estado === 'pidiendo' && (
            <p className="animate-pulse text-ink-muted">
              Pidiendo el detalle a las máquinas de la agencia. Suele tardar uno o dos minutos.
            </p>
          )}
          {estado === 'error' && <p className="text-state-danger">{error}</p>}
          {estado === 'listo' && <ContenidoEtapa etapa={etapa} datos={datos} pendiente={detalle?.pendiente} />}
        </div>

        {estado === 'listo' && (
          <div className="flex items-center justify-between gap-2 text-[11px] text-ink-faint">
            <span>
              Leído de Dinamo {hace(detalle.actualizado_en)}
              {detalle.pendiente && ' · actualizando…'}
            </span>
            <button
              type="button"
              onClick={pedir}
              className="flex items-center gap-1 rounded-md px-2 py-1 text-sky2-light transition hover:bg-white/5"
            >
              <RefreshCw size={12} /> Volver a leer
            </button>
          </div>
        )}
      </div>
    </Modal>
  );
}

/** «DATOS PERSONALES DEL CLIENTE» → «Datos personales del cliente». */
function oracion(t) {
  const s = String(t ?? '').trim().toLowerCase();
  return s.replace(/\p{L}/u, (c) => c.toUpperCase());
}

function Estatus({ texto }) {
  const e = String(texto ?? '').toUpperCase();
  const clase =
    e.startsWith('AUTORIZ') || e.startsWith('RECOMENDAD')
      ? 'bg-state-success/15 text-state-success'
      : e.startsWith('RECHAZ') || e.startsWith('NO RECOMENDAD')
        ? 'bg-state-danger/15 text-state-danger'
        : e.startsWith('CORREGIR') || e.startsWith('SOLICITUD')
          ? 'bg-state-warning/15 text-state-warning'
          : e
            ? 'bg-sky2/15 text-sky2-light'
            : 'bg-white/5 text-ink-faint';
  return <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${clase}`}>{texto ? oracion(texto) : 'Sin revisar'}</span>;
}

function Historial({ items }) {
  return (
    <ol className="space-y-2">
      {items.map((h, i) => (
        <li key={i} className="rounded-lg bg-white/5 p-2">
          <div className="mb-1 flex flex-wrap items-center gap-2 text-[10px] text-ink-faint">
            <span className="font-medium text-ink-muted">{h.usuario}</span>
            <span>{h.fecha}</span>
            {h.estatus && <Estatus texto={h.estatus} />}
          </div>
          <p className="whitespace-pre-line leading-snug">{h.comentario}</p>
        </li>
      ))}
    </ol>
  );
}

const Nota = ({ children }) => <p className="text-ink-muted">{children}</p>;

function ContenidoEtapa({ etapa, datos, pendiente }) {
  const sinLector = <Nota>Esta sección todavía no se puede leer desde Marga; revísala en la intranet.</Nota>;
  if (datos?.error) return <p className="text-state-danger">No se pudo leer esta página de Dinamo: {datos.error}</p>;

  if (etapa === 'BNC') {
    return datos?.comentarios ? (
      <pre className="whitespace-pre-wrap font-sans leading-snug">{datos.comentarios}</pre>
    ) : (
      <Nota>Los analistas aún no dejan comentarios de buró.</Nota>
    );
  }

  if (etapa === 'EC') {
    if (!datos?.historial) return sinLector;
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-ink-muted">Estatus de la evaluación</span>
          <Estatus texto={datos.estatus} />
        </div>
        {datos.historial.length ? <Historial items={datos.historial} /> : <Nota>Sin comentarios de evaluación todavía.</Nota>}
      </div>
    );
  }

  if (etapa === 'CC') {
    if (!datos?.bloques) return sinLector;
    return (
      <ul className="space-y-2">
        {datos.bloques.map((b, i) => (
          <li key={i} className="rounded-lg bg-white/5 p-2">
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium">{oracion(b.titulo)}</span>
              <Estatus texto={b.estatus} />
            </div>
            {b.comentarios && <pre className="mt-1 whitespace-pre-wrap font-sans leading-snug text-ink-muted">{b.comentarios}</pre>}
          </li>
        ))}
      </ul>
    );
  }

  if (etapa === 'VF') {
    if (!datos?.visitas) return sinLector;
    if (!datos.visitas.length) return <Nota>Todavía no hay visitas asignadas.</Nota>;
    return (
      <ul className="space-y-2">
        {datos.visitas.map((v, i) => (
          <li key={v.pk ?? i} className="space-y-1.5 rounded-lg bg-white/5 p-2">
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium">{oracion(v.titulo)}</span>
              <Estatus texto={v.estatus} />
            </div>
            {v.pregunta && v.respuesta && (
              <Nota>
                {oracion(v.pregunta)} {oracion(v.respuesta)}
              </Nota>
            )}
            {!v.historial ? (
              <Nota>{pendiente ? 'Trayendo comentarios…' : 'No se pudieron traer los comentarios.'}</Nota>
            ) : v.historial.length ? (
              <Historial items={v.historial} />
            ) : (
              <Nota>Sin comentarios del verificador.</Nota>
            )}
          </li>
        ))}
      </ul>
    );
  }
  return sinLector;
}

