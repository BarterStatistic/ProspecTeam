import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Lightbulb, Image as ImageIcon, Megaphone, CalendarRange, AtSign, MessageCircle, CheckCircle2, PlugZap, Send, RefreshCw,
} from 'lucide-react';
import Card from '../ui/Card.jsx';
import Button from '../ui/Button.jsx';
import Modal from '../ui/Modal.jsx';
import { formatDate } from '../../lib/format.js';
import { hace } from '../../lib/publicidad.js';
import {
  cargarBandeja, contarPendientes, decidir, desdeTexto, miniaturaDrive, quitarDecidida,
} from '../../lib/agencia.js';

const MOTIVOS = [
  ['moto', 'La moto'], ['gancho', 'El gancho o el texto'], ['diseno', 'El diseño o formato'],
  ['ya_visto', 'Ya lo vi antes'], ['no_aplica', 'No aplica ahora'],
];

const ESTADO_LEGIBLE = {
  autorizada: 'Autorizada', descartada: 'Descartada', aprobada_final: 'Publicándose', programada: 'Programada',
  cambios_pedidos: 'Cambios pedidos', rechazada: 'Rechazada', aprobada: 'Aprobada', ejecutada: 'Aplicada en Meta',
  caducada: 'Caducada', activa: 'Creada', agregada: 'Agregada', respondido: 'Respondido', ignorado: 'Ignorado',
  publicada: 'Publicada', en_produccion: 'En producción', respondiendo: 'Respondiendo',
};

/**
 * Qué pide cada botón antes de mandar la decisión (mismo texto que la página de Telegram).
 * `campo`: 'motivo' | 'cuando' | 'texto' | 'texto_req'.
 */
const CONFIRMAR = {
  'idea:autorizar': { titulo: 'Autorizar idea', boton: 'Sí, autorizar', variante: 'gold', nota: 'Pasa al Productor. La vuelves a ver antes de publicarla.' },
  'idea:descartar': { titulo: 'Descartar idea', boton: 'Sí, descartar', variante: 'danger', campo: 'motivo', nota: 'No publica ni cambia nada en Facebook.' },
  'pieza:publicar': { titulo: 'Publicar en Facebook', boton: 'Sí, publicar ahora', variante: 'gold', nota: 'Se publica de inmediato en la página de Dinamo y queda visible para todos.' },
  'pieza:programar': { titulo: 'Programar publicación', boton: 'Programar', variante: 'sky', campo: 'cuando', nota: 'Hora de Monterrey, de 15 minutos a 30 días. Se publica sola a esa hora.' },
  'pieza:cambios': { titulo: 'Sugerir cambios', boton: 'Enviar cambios al Productor', variante: 'sky', campo: 'texto_req', nota: 'El Productor corrige esta misma pieza y te la manda de nuevo.' },
  'pieza:rechazar': { titulo: 'Rechazar pieza', boton: 'Rechazar y hacer otra', variante: 'danger', campo: 'texto', nota: 'Se hace otra pieza de la misma idea con otro enfoque y pasa directo a producción.' },
  'propuesta:aprobar': { titulo: 'Aprobar propuesta', boton: 'Sí, aprobar', variante: 'gold' },
  'propuesta:rechazar': { titulo: 'Rechazar propuesta', boton: 'Sí, rechazar', variante: 'danger', nota: 'Rechazar no cambia nada en Meta.' },
  'campana:crear': { titulo: 'Crear campaña', boton: 'Sí, crear', variante: 'gold', nota: 'El Creativo le dedica una idea en cada tanda mientras esté vigente.' },
  'campana:no': { titulo: 'No crear la campaña', boton: 'No crear', variante: 'danger' },
  'cuenta:agregar': { titulo: 'Agregar cuenta', boton: 'Sí, agregar', variante: 'gold', nota: 'El Investigador la lee desde su próxima corrida.' },
  'cuenta:no': { titulo: 'No agregar la cuenta', boton: 'No agregar', variante: 'danger', nota: 'No se lee ni se vuelve a proponer.' },
  'comentario:responder': { titulo: 'Responder en Facebook', boton: 'Responder', variante: 'sky', campo: 'texto_req', nota: 'Se publica como respuesta de la página de Dinamo.' },
  'comentario:ignorar': { titulo: 'Ignorar comentario', boton: 'Sí, ignorar', variante: 'outline', nota: 'No se responde nada.' },
};

function Grupo({ icon: Icon, titulo, items, children }) {
  if (!items.length) return null;
  return (
    <section className="mt-4 first:mt-0">
      <h4 className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-faint">
        <Icon size={13} className="text-sky2" />
        {titulo}
        <span className="rounded-full bg-navy-700 px-1.5 text-[10.5px] tabular-nums text-ink-muted">{items.length}</span>
      </h4>
      <ul className="space-y-2">{children}</ul>
    </section>
  );
}

function Tarjeta({ titulo, meta, children, acciones, imagen }) {
  return (
    <li className="rounded-xl border border-white/[0.08] bg-navy-800/60 p-3">
      <div className="flex gap-3">
        {imagen}
        <div className="min-w-0 flex-1">
          {meta && <p className="text-[11.5px] text-ink-faint">{meta}</p>}
          <p className="break-words font-semibold leading-snug text-ink">{titulo}</p>
          {children}
        </div>
      </div>
      {acciones && <div className="mt-2.5 flex flex-wrap gap-1.5">{acciones}</div>}
    </li>
  );
}

function Vista({ archivo }) {
  const [rota, setRota] = useState(false);
  const src = miniaturaDrive(archivo);
  if (!src || rota) {
    return (
      <div className="grid h-20 w-16 shrink-0 place-items-center rounded-lg bg-navy-700 text-ink-faint" aria-hidden="true">
        <ImageIcon size={18} />
      </div>
    );
  }
  return (
    <img
      src={src}
      alt="Vista previa de la pieza"
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setRota(true)}
      className="h-20 w-16 shrink-0 rounded-lg bg-navy-700 object-cover"
    />
  );
}

/** "en 2 h" / "mañana 7:00 pm" para la hora programada. */
function horaLegible(ts) {
  if (!Number.isFinite(ts)) return '';
  return new Date(ts).toLocaleString('es-MX', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
}

/**
 * Bandeja "Por decidir hoy" (Fase C): lo mismo que llega a Telegram, con los mismos botones.
 * Decidir aquí edita el mensaje de Telegram; decidir en Telegram quita la tarjeta de aquí
 * (Realtime). Si las dos pantallas deciden a la vez, gana la primera y la otra recibe
 * "Ya se decidió desde …".
 */
export default function PorDecidir({ modo, store }) {
  // undefined = cargando · { datos } · { sinConectar } · { error }
  const [estado, setEstado] = useState(undefined);
  const [pidiendo, setPidiendo] = useState(null); // { tipo, id, accion, item }
  const [entrada, setEntrada] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [aviso, setAviso] = useState(null); // { tono, texto }
  const vivo = useRef(true);

  const recargar = useCallback(() => {
    cargarBandeja(modo, store)
      .then((r) => vivo.current && setEstado(r))
      .catch((err) => vivo.current && setEstado({ error: err?.message || 'No se pudo leer lo que hay por decidir.' }));
  }, [modo, store]);

  useEffect(() => {
    vivo.current = true;
    recargar();
    // Telegram → Marga: cualquier cambio en las tablas de la agencia recarga la bandeja
    let pendiente = null;
    const dejar = modo !== 'demo' && typeof store?.escucharAgencia === 'function'
      ? store.escucharAgencia(() => {
          clearTimeout(pendiente);
          pendiente = setTimeout(recargar, 400);
        })
      : null;
    return () => {
      vivo.current = false;
      clearTimeout(pendiente);
      dejar?.();
    };
  }, [modo, store, recargar]);

  const abrir = (tipo, item, accion) => {
    setPidiendo({ tipo, id: item.id, accion, item });
    setEntrada(tipo === 'comentario' && accion === 'responder' ? item.respuesta : '');
    setAviso(null);
  };

  const confirmar = async () => {
    const { tipo, id, accion, item } = pidiendo;
    const cfg = CONFIRMAR[`${tipo}:${accion}`];
    const pedido = { tipo, id, accion };
    if (cfg.campo === 'motivo' && entrada) pedido.motivo = entrada;
    if (cfg.campo === 'cuando') pedido.cuando = entrada;
    if (cfg.campo === 'texto' || cfg.campo === 'texto_req') pedido.texto = entrada;
    setEnviando(true);
    const r = await decidir(modo, store, pedido);
    if (!vivo.current) return;
    setEnviando(false);
    setPidiendo(null);
    if (r?.ok && r.cambio) {
      setEstado((e) => (e?.datos ? { datos: quitarDecidida(e.datos, { tipo, id, accion, desde: 'marga' }) } : e));
      setAviso({
        tono: 'ok',
        texto: tipo === 'pieza'
          ? `${cfg.titulo}: listo. Los botones de la pieza en Telegram ya no hacen nada (dicen “ya se decidió desde Marga”).`
          : `${cfg.titulo}: listo. En Telegram el mensaje ya dice “desde Marga”.`,
      });
    } else if (r?.ok && r.yaDecidida) {
      setAviso({ tono: 'info', texto: `${item.titulo || item.nombre || 'Esto'}: ${r.mensaje}` });
    } else {
      setAviso({ tono: 'error', texto: r?.error || 'No se pudo decidir. Intenta de nuevo.' });
    }
    recargar();
  };

  const b = (tipo, item, accion, etiqueta, variante = 'outline') => (
    <Button key={accion} size="sm" variant={variante} onClick={() => abrir(tipo, item, accion)}>
      {etiqueta}
    </Button>
  );

  if (estado === undefined) {
    return (
      <Card className="p-4">
        <p className="py-6 text-center text-sm text-ink-faint">Cargando lo que hay por decidir…</p>
      </Card>
    );
  }

  if (!estado.datos) {
    return (
      <Card className="flex items-start gap-3 p-4">
        <PlugZap size={20} className="mt-0.5 shrink-0 text-state-warning" />
        <div className="text-sm text-ink-muted">
          <p className="font-semibold text-ink">
            {estado.error ? 'No se pudo leer lo que hay por decidir' : 'Por decidir hoy: todavía sin conectar'}
          </p>
          <p className="mt-1">
            {estado.error ??
              'Falta aplicar supabase/marga_centro_de_mando.sql y desplegar la función marga-agencia. Mientras tanto, todo se sigue decidiendo desde Telegram.'}
          </p>
        </div>
      </Card>
    );
  }

  const d = estado.datos;
  const total = contarPendientes(d);
  const cfg = pidiendo && CONFIRMAR[`${pidiendo.tipo}:${pidiendo.accion}`];
  const falta = cfg && ((cfg.campo === 'texto_req' && !entrada.trim()) || (cfg.campo === 'cuando' && !entrada));

  return (
    <Card className="p-4">
      <div className="mb-3 flex flex-wrap items-center gap-x-2.5 gap-y-1">
        <h3 className="font-head text-[15.5px] font-bold text-ink">Por decidir hoy</h3>
        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums ${total ? 'bg-gold text-navy-900' : 'bg-navy-700 text-ink-muted'}`}>
          {total}
        </span>
        <p className="text-xs text-ink-faint">Lo que no se decide hoy se descarta al cierre del día (11:55 pm).</p>
        <button
          onClick={recargar}
          aria-label="Volver a leer"
          className="ml-auto rounded-lg p-1.5 text-ink-faint transition hover:bg-white/5 hover:text-ink"
        >
          <RefreshCw size={15} />
        </button>
      </div>

      <p aria-live="polite" className="min-h-0">
        {aviso && (
          <span
            className={`mb-3 block rounded-[10px] px-3 py-2 text-[12.5px] ${
              aviso.tono === 'error' ? 'bg-state-danger/15 text-state-danger' : aviso.tono === 'ok' ? 'bg-state-success/10 text-state-success' : 'bg-navy-700 text-ink-muted'
            }`}
          >
            {aviso.texto}
          </span>
        )}
      </p>

      {total === 0 && (
        <p className="flex items-center gap-2 rounded-[10px] bg-navy-700 px-3 py-3 text-[13px] text-ink-muted">
          <CheckCircle2 size={16} className="text-state-success" /> Nada pendiente. Lo nuevo llega aquí y a Telegram al mismo tiempo.
        </p>
      )}

      <Grupo icon={ImageIcon} titulo="Piezas en revisión" items={d.piezas}>
        {d.piezas.map((p) => (
          <Tarjeta
            key={p.id}
            imagen={<Vista archivo={p.archivo} />}
            meta={`Idea #${p.id} · versión ${p.version} · ${p.tipo} · ${p.modelo}${p.desde ? ` · ${hace(p.desde)}` : ''}`}
            titulo={p.titulo}
            acciones={[
              b('pieza', p, 'publicar', '✅ Publicar', 'gold'),
              p.estado === 'en_revision' && b('pieza', p, 'programar', '🕐 Programar'),
              p.estado === 'en_revision' && b('pieza', p, 'cambios', '✏️ Sugerir cambios'),
              p.estado === 'en_revision' && b('pieza', p, 'rechazar', '🔄 Rechazar'),
            ].filter(Boolean)}
          >
            <p className="mt-1 line-clamp-3 text-[12.5px] text-ink-muted">{p.texto}</p>
            {p.estado === 'programada' && (
              <p className="mt-1 text-[12px] font-semibold text-sky2">Programada: {horaLegible(p.programada)}</p>
            )}
          </Tarjeta>
        ))}
      </Grupo>

      <Grupo icon={Lightbulb} titulo="Ideas del Creativo" items={d.ideas}>
        {d.ideas.map((i) => (
          <Tarjeta
            key={i.id}
            meta={`Idea #${i.id} · ${i.tipo} · ${i.modelo}${i.angulo ? ` · ${i.angulo}` : ''}`}
            titulo={i.titulo}
            acciones={[b('idea', i, 'autorizar', '✅ Autorizar', 'gold'), b('idea', i, 'descartar', '❌ Descartar')]}
          >
            <p className="mt-1 line-clamp-3 text-[12.5px] text-ink-muted">{i.texto}</p>
            {i.razon && <p className="mt-1 text-[12px] text-ink-faint">Por qué: {i.razon}</p>}
          </Tarjeta>
        ))}
      </Grupo>

      <Grupo icon={Megaphone} titulo="Propuestas de Meta Ads" items={d.propuestas}>
        {d.propuestas.map((p) => (
          <Tarjeta
            key={p.id}
            meta={`Propuesta #${p.id}${p.dinero ? ' · mueve dinero' : ''}`}
            titulo={p.titulo}
            acciones={[b('propuesta', p, 'aprobar', '✅ Aprobar', 'gold'), b('propuesta', p, 'rechazar', '❌ Rechazar')]}
          >
            {p.detalle && <p className="mt-1 text-[12.5px] text-ink-muted">{p.detalle}</p>}
            {p.cambio && (
              <p className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[12px]">
                <span className="text-ink-faint">{p.cambio.que}:</span>
                {p.cambio.antes && <span className="rounded bg-navy-700 px-1.5 py-0.5 text-ink-muted line-through decoration-ink-faint/60">{p.cambio.antes}</span>}
                {p.cambio.antes && <span className="text-ink-faint">→</span>}
                {p.cambio.despues && <span className="rounded bg-gold/15 px-1.5 py-0.5 font-semibold text-gold">{p.cambio.despues}</span>}
              </p>
            )}
            {p.manual && <p className="mt-1 text-[12px] text-ink-faint">Sin acción automática: aprobarla no cambia nada en Meta.</p>}
          </Tarjeta>
        ))}
      </Grupo>

      <Grupo icon={CalendarRange} titulo="Campañas de temporada" items={d.campanas}>
        {d.campanas.map((c) => (
          <Tarjeta
            key={c.id}
            meta={`${c.desde ? formatDate(Date.parse(`${c.desde}T12:00:00`)) : ''} → ${c.hasta ? formatDate(Date.parse(`${c.hasta}T12:00:00`)) : ''} · ${c.piezas} piezas`}
            titulo={c.nombre}
            acciones={[b('campana', c, 'crear', '✅ Crear', 'gold'), b('campana', c, 'no', '❌ No')]}
          >
            <p className="mt-1 text-[12.5px] text-ink-muted">«{c.mensaje}»</p>
          </Tarjeta>
        ))}
      </Grupo>

      <Grupo icon={AtSign} titulo="Cuentas que propone el Investigador" items={d.cuentas}>
        {d.cuentas.map((c) => (
          <Tarjeta
            key={c.id}
            meta={c.tipo}
            titulo={`@${c.id}`}
            acciones={[b('cuenta', c, 'agregar', '✅ Agregar', 'gold'), b('cuenta', c, 'no', '❌ No')]}
          >
            {c.notas && <p className="mt-1 text-[12.5px] text-ink-muted">{c.notas}</p>}
          </Tarjeta>
        ))}
      </Grupo>

      <Grupo icon={MessageCircle} titulo="Comentarios de la página" items={d.comentarios}>
        {d.comentarios.map((c) => (
          <Tarjeta
            key={c.id}
            meta={`${c.clase === 'compra' ? 'Quiere comprar' : 'Pregunta'}${c.creado ? ` · ${hace(c.creado)}` : ''}`}
            titulo={`«${c.texto}»`}
            acciones={[b('comentario', c, 'responder', '💬 Responder', 'sky'), b('comentario', c, 'ignorar', 'Ignorar')]}
          >
            {c.respuesta && <p className="mt-1 text-[12px] text-ink-faint">Sugerida: {c.respuesta}</p>}
          </Tarjeta>
        ))}
      </Grupo>

      {d.decididasHoy.length > 0 && (
        <details className="mt-4 rounded-[10px] bg-navy-700/60 px-3 py-2 text-[12.5px]">
          <summary className="cursor-pointer select-none text-ink-muted">Decidido hoy ({d.decididasHoy.length})</summary>
          <ul className="mt-2 space-y-1">
            {d.decididasHoy.slice(0, 20).map((x, k) => (
              <li key={`${x.tipo}-${x.id}-${k}`} className="flex flex-wrap gap-x-2 text-ink-muted">
                <span className="font-semibold text-ink">{ESTADO_LEGIBLE[x.estado] ?? x.estado}</span>
                <span className="min-w-0 flex-1 truncate">{x.titulo}</span>
                <span className="text-ink-faint">
                  desde {desdeTexto(x.desde) || '—'}{Number.isFinite(x.cuando) ? ` · ${hace(x.cuando)}` : ''}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}

      <Modal
        open={!!pidiendo}
        onClose={() => !enviando && setPidiendo(null)}
        title={cfg?.titulo ?? ''}
        size="sm"
        footer={
          cfg && (
            <>
              <Button variant="ghost" onClick={() => setPidiendo(null)} disabled={enviando}>
                Cancelar
              </Button>
              <Button variant={cfg.variante} onClick={confirmar} disabled={enviando || falta}>
                <Send size={14} />
                {enviando ? 'Enviando…' : cfg.boton}
              </Button>
            </>
          )
        }
      >
        {pidiendo && cfg && (
          <div className="space-y-3 text-sm">
            <p className="font-semibold text-ink">{pidiendo.item.titulo || pidiendo.item.nombre || `@${pidiendo.item.id}`}</p>
            {pidiendo.tipo === 'propuesta' && (
              <p className={`rounded-[10px] px-3 py-2 text-[12.5px] ${pidiendo.accion === 'aprobar' && pidiendo.item.ejecutaEnMeta ? 'bg-gold/15 text-gold' : 'bg-navy-700 text-ink-muted'}`}>
                {pidiendo.accion === 'aprobar'
                  ? pidiendo.item.ejecutaEnMeta
                    ? 'Al confirmar, este cambio SE APLICA en Meta de inmediato.'
                    : 'Aprobar no cambia nada en Meta: después la aplicas en el Administrador de anuncios.'
                  : 'Rechazar no cambia nada en Meta.'}
              </p>
            )}
            {cfg.campo === 'motivo' && (
              <fieldset>
                <legend className="mb-1.5 text-[12.5px] text-ink-muted">¿Por qué? (opcional, un toque)</legend>
                <div className="grid grid-cols-2 gap-1.5">
                  {MOTIVOS.map(([k, t]) => (
                    <label
                      key={k}
                      className={`cursor-pointer rounded-lg border px-2.5 py-2 text-[12.5px] ${entrada === k ? 'border-gold text-ink' : 'border-white/10 text-ink-muted'}`}
                    >
                      <input type="radio" name="motivo" value={k} checked={entrada === k} onChange={() => setEntrada(k)} className="sr-only" />
                      {t}
                    </label>
                  ))}
                </div>
              </fieldset>
            )}
            {cfg.campo === 'cuando' && (
              <label className="block">
                <span className="mb-1 block text-[12.5px] text-ink-muted">Fecha y hora</span>
                <input
                  type="datetime-local"
                  value={entrada}
                  onChange={(e) => setEntrada(e.target.value)}
                  className="w-full rounded-lg border border-white/10 bg-navy-800 px-3 py-2 text-ink"
                />
              </label>
            )}
            {(cfg.campo === 'texto' || cfg.campo === 'texto_req') && (
              <textarea
                value={entrada}
                onChange={(e) => setEntrada(e.target.value)}
                maxLength={pidiendo.tipo === 'comentario' ? 1000 : 1500}
                rows={4}
                aria-label={cfg.titulo}
                placeholder={
                  pidiendo.tipo === 'comentario'
                    ? 'Respuesta'
                    : cfg.campo === 'texto_req'
                      ? 'Ejemplo: letra más grande, quita el fondo rojo, acerca la moto…'
                      : 'Opcional: qué no te gustó'
                }
                className="w-full rounded-lg border border-white/10 bg-navy-800 px-3 py-2 text-ink placeholder:text-ink-faint"
              />
            )}
            {cfg.nota && <p className="text-[12.5px] text-ink-faint">{cfg.nota}</p>}
            <p className="text-[11.5px] text-ink-faint">
              {pidiendo.tipo === 'pieza'
                ? 'Mismo botón que en Telegram: si la pieza ya se decidió allá, aquí te lo digo.'
                : 'El mensaje de Telegram se actualiza solo y dice “desde Marga”.'}
            </p>
          </div>
        )}
      </Modal>
    </Card>
  );
}
