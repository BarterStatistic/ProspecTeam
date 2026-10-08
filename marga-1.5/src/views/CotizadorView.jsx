import { useEffect, useMemo, useState } from 'react';
import { Search, Check } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { useData } from '../context/DataContext.jsx';
import { MODELS, SCHEMES, SCHEME_IDS, motoPorNombre } from '../lib/motos.js';
import { precioEfectivo, parcialidad, redondearPct } from '../lib/cotizador.js';
import { descargarCotizacionJPG } from '../lib/cotizacionImagen.js';
import { formatMXN0, formatPct } from '../lib/format.js';
import ResultadoCotizacion from '../components/cotizador/ResultadoCotizacion.jsx';
import PanelDescarga from '../components/cotizador/PanelDescarga.jsx';

// Último esquema usado: ahorra un clic en cada cotización (igual que el original).
const LS_ESQUEMA = 'marga_cot_esquema';

function slug(str) {
  return String(str)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

function esquemaGuardado() {
  try {
    const k = localStorage.getItem(LS_ESQUEMA);
    return k && SCHEMES[k] ? k : '';
  } catch {
    return '';
  }
}

/** Texto de un campo numérico a partir de un número; '' si no hay valor. */
const txt = (n) => (n === null || Number.isNaN(n) ? '' : String(n));

/**
 * Cotizador PT dentro de Marga. Mismo flujo que el cotizador independiente
 * (`cotizador-pt/index.html`): sin pasos, las tres secciones (modelo, esquema,
 * enganche) siempre visibles y la cotización recalculándose en vivo. La
 * descarga ofrece tabla completa, varios plazos o un plazo, y la imagen sale
 * con el formato exacto del original. Cada descarga se registra para contar
 * cotizaciones por vendedor en el Panel ADMIN.
 */
export default function CotizadorView() {
  const { user } = useAuth();
  const { registrarCotizacion } = useData();

  const [query, setQuery] = useState('');
  const [motoNombre, setMotoNombre] = useState('');
  const [esquemaId, setEsquemaId] = useState(esquemaGuardado);
  // dp (porcentaje) es la única fuente de verdad; los campos son vistas de él.
  const [dp, setDp] = useState(() => {
    const k = esquemaGuardado();
    return k ? SCHEMES[k].min : null;
  });
  const [modo, setModo] = useState('pct');
  // El servicio preventivo entra activado: es como se cotiza de forma habitual.
  const [incluyeServicio, setIncluyeServicio] = useState(true);
  const [pctTxt, setPctTxt] = useState(() => txt(dp));
  const [montoTxt, setMontoTxt] = useState('');
  const [panelAbierto, setPanelAbierto] = useState(false);
  const [aviso, setAviso] = useState(null);

  const moto = motoNombre ? motoPorNombre(motoNombre) : null;
  const esquema = esquemaId ? SCHEMES[esquemaId] : null;
  const precio = moto ? precioEfectivo(moto, incluyeServicio) : null;
  const dpOk = !!esquema && dp !== null && !Number.isNaN(dp) && dp >= esquema.min && dp <= esquema.max;

  // El monto sigue al porcentaje cuando cambia el precio (moto o servicio).
  useEffect(() => {
    setMontoTxt(precio !== null && dp !== null ? txt(Math.round(precio * (dp / 100))) : '');
    // Solo al cambiar el precio: al teclear el monto no se debe reescribir.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [precio]);

  useEffect(() => {
    if (!aviso) return undefined;
    const t = setTimeout(() => setAviso(null), 3200);
    return () => clearTimeout(t);
  }, [aviso]);

  /** Fija el porcentaje desde fuera de los campos (slider, esquema) y sincroniza ambos. */
  function fijarDp(v) {
    setDp(v);
    setPctTxt(txt(Math.round(v * 100) / 100));
    setMontoTxt(precio !== null ? txt(Math.round(precio * (v / 100))) : '');
  }

  function onPct(valor) {
    setPctTxt(valor);
    const v = parseFloat(valor);
    if (Number.isNaN(v)) return setDp(null);
    setDp(v);
    setMontoTxt(precio !== null ? txt(Math.round(precio * (v / 100))) : '');
  }

  function onMonto(valor) {
    setMontoTxt(valor);
    const amt = parseFloat(valor);
    if (Number.isNaN(amt) || !precio) return setDp(null);
    const v = (amt / precio) * 100;
    setDp(v);
    setPctTxt(txt(Math.round(v * 100) / 100));
  }

  function elegirEsquema(id) {
    const sc = SCHEMES[id];
    setEsquemaId(id);
    // Al cambiar de esquema, el enganche se ajusta al nuevo rango en vez de quedar inválido.
    if (dp === null || dp < sc.min || dp > sc.max) fijarDp(sc.min);
    try {
      localStorage.setItem(LS_ESQUEMA, id);
    } catch {
      // Sin almacenamiento solo se pierde el recordatorio.
    }
  }

  // Cálculo en vivo. Nunca debe tumbar la pantalla: si falla, se muestra el mensaje.
  const calculo = useMemo(() => {
    if (!moto || !esquema || !dpOk) return null;
    try {
      const enganche = precio * (dp / 100);
      const montoACredito = precio - enganche;
      const pagos = {};
      for (const plazo of esquema.terms) {
        pagos[plazo] = Math.round(
          parcialidad({ esquemaId, montoACredito, enganchePct: dp, plazo }),
        );
      }
      return { enganche, montoACredito, pagos };
    } catch (e) {
      return { error: e?.message || 'No se pudo calcular la cotización con estos datos.' };
    }
  }, [moto, esquema, esquemaId, dpOk, dp, precio]);

  const listo = !!calculo && !calculo.error;

  // Si la cotización deja de ser válida con el panel abierto, se cierra.
  useEffect(() => {
    if (!listo) setPanelAbierto(false);
  }, [listo]);

  async function descargar({ modo: modoDl, plazos }) {
    const fecha = Date.now();
    await descargarCotizacionJPG({
      moto,
      esquema,
      enganchePct: dp,
      incluyeServicio,
      pagos: calculo.pagos,
      plazos,
      modo: modoDl,
      vendedor: user?.username,
      fecha,
    });
    // La cotización se "emite" al descargarla: es lo que se cuenta por vendedor.
    const plazo = modoDl === 'single' ? plazos[0] : esquema.terms.at(-1);
    registrarCotizacion({
      moto: moto.nombre,
      esquemaId,
      precioEfectivo: precio,
      enganchePct: redondearPct(dp),
      plazo,
      parcialidad: calculo.pagos[plazo],
    }).catch(() => setAviso({ texto: 'Imagen descargada, pero no se pudo registrar la cotización.', error: true }));
    setAviso({ texto: 'Imagen descargada.' });
  }

  const visibles = useMemo(() => {
    const q = slug(query.trim());
    return q ? MODELS.filter((m) => slug(m.nombre).includes(q)) : MODELS;
  }, [query]);

  const fueraDeRango = !!esquema && dp !== null && !dpOk;
  let hint;
  if (!esquema) hint = 'Elige un esquema para habilitar el rango.';
  else if (fueraDeRango) hint = `Fuera de rango. Permitido: ${esquema.min}% – ${esquema.max}%`;
  else if (precio !== null && dp !== null) hint = `${formatPct(dp)} · ${formatMXN0(precio * (dp / 100))} de enganche`;
  else hint = `Rango permitido: ${esquema.min}% – ${esquema.max}%`;

  return (
    <div className="h-full overflow-y-auto px-4 py-5 sm:px-6">
      <div className="mx-auto max-w-6xl">
        <div className="mb-5">
          <h1 className="font-head text-2xl font-extrabold tracking-tight text-ink sm:text-3xl">
            Genera tu cotización
          </h1>
          <p className="mt-1 max-w-[64ch] text-sm text-ink-muted">
            Elige modelo, esquema y enganche. Las parcialidades de todos los plazos se recalculan
            mientras ajustas.
          </p>
        </div>

        <div className="grid items-start gap-4 lg:grid-cols-[minmax(340px,400px)_1fr] lg:gap-5">
          {/* ══ CONFIGURADOR ══ */}
          <div className="m-glass overflow-hidden rounded-2xl lg:sticky lg:top-0">
            <Seccion n={1} titulo="Modelo" listo={!!moto} estado="Listo">
              {moto ? (
                <div className="flex items-center justify-between gap-3 rounded-xl border border-gold/35 bg-gold/10 px-3 py-2.5">
                  <div>
                    <div className="font-head text-base font-bold text-gold-light">{moto.nombre}</div>
                    <div className="font-cifra text-sm text-ink-muted">{formatMXN0(moto.precio)}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setMotoNombre('');
                      setQuery('');
                    }}
                    className="whitespace-nowrap text-xs text-ink-faint underline hover:text-state-danger"
                  >
                    Cambiar modelo
                  </button>
                </div>
              ) : (
                <>
                  <div className="relative mb-2">
                    <Search
                      size={15}
                      className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint"
                    />
                    <input
                      type="search"
                      className="m-input pl-9"
                      placeholder="Buscar modelo…"
                      aria-label="Buscar modelo de motocicleta"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                    />
                  </div>
                  <p className="mb-2 font-cifra text-xs text-ink-faint" role="status">
                    {visibles.length} modelo{visibles.length === 1 ? '' : 's'} disponible
                    {visibles.length === 1 ? '' : 's'}
                  </p>
                  {visibles.length ? (
                    <div className="grid max-h-72 grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-1.5 overflow-y-auto pr-1">
                      {visibles.map((m) => (
                        <button
                          key={m.nombre}
                          type="button"
                          onClick={() => setMotoNombre(m.nombre)}
                          className="rounded-lg border border-white/10 bg-navy-700/60 px-2.5 py-2 text-left transition hover:border-gold hover:bg-gold/10"
                        >
                          <span className="block font-head text-[13px] font-bold leading-tight text-ink">
                            {m.nombre}
                          </span>
                          <span className="block font-cifra text-xs text-gold">{formatMXN0(m.precio)}</span>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="py-4 text-center text-sm text-ink-faint">
                      Ningún modelo coincide con esa búsqueda.
                    </p>
                  )}
                </>
              )}
            </Seccion>

            <Seccion n={2} titulo="Esquema de crédito" listo={!!esquema} estado="Listo">
              <div className="grid grid-cols-2 gap-1.5">
                {SCHEME_IDS.map((id) => {
                  const s = SCHEMES[id];
                  const on = esquemaId === id;
                  return (
                    <button
                      key={id}
                      type="button"
                      aria-pressed={on}
                      onClick={() => elegirEsquema(id)}
                      className={`rounded-lg border px-2.5 py-2 text-left transition ${
                        on
                          ? 'border-sky2 bg-sky2/15 shadow-[inset_0_0_0_1px] shadow-sky2'
                          : 'border-white/10 bg-navy-700/60 hover:border-sky2 hover:bg-sky2/10'
                      }`}
                    >
                      <span className={`block font-head text-[13px] font-bold ${on ? 'text-sky2-light' : 'text-ink'}`}>
                        {s.label}
                      </span>
                      <span className="block text-xs text-ink-faint">
                        Enganche {s.min}% – {s.max}%{s.termUnit === 'semanas' ? ' · Semanal' : ''}
                      </span>
                    </button>
                  );
                })}
              </div>
            </Seccion>

            <Seccion n={3} titulo="Enganche" listo={dpOk} estado={dpOk ? formatPct(dp) : 'Pendiente'}>
              <div
                className="mb-3 flex gap-1 rounded-lg border border-white/10 bg-navy-900/60 p-1"
                role="group"
                aria-label="Unidad del enganche"
              >
                {[
                  ['pct', 'Porcentaje'],
                  ['monto', 'Monto'],
                ].map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    aria-pressed={modo === id}
                    onClick={() => setModo(id)}
                    className={`flex-1 rounded-md px-2 py-1.5 text-xs font-semibold transition ${
                      modo === id ? 'bg-navy-600 text-ink' : 'text-ink-faint hover:text-ink'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <label className="m-label" htmlFor={modo === 'pct' ? 'cot-pct' : 'cot-monto'}>
                {modo === 'pct' ? 'Porcentaje de enganche' : 'Monto de enganche'}
              </label>
              <div className="relative">
                {modo === 'pct' ? (
                  <input
                    id="cot-pct"
                    type="number"
                    step="0.01"
                    inputMode="decimal"
                    placeholder="20"
                    value={pctTxt}
                    onChange={(e) => onPct(e.target.value)}
                    className={`m-input pr-10 font-cifra text-lg ${fueraDeRango ? 'border-state-danger' : ''}`}
                  />
                ) : (
                  <input
                    id="cot-monto"
                    type="number"
                    step="1"
                    inputMode="decimal"
                    placeholder="15000"
                    value={montoTxt}
                    onChange={(e) => onMonto(e.target.value)}
                    className={`m-input pr-10 font-cifra text-lg ${fueraDeRango ? 'border-state-danger' : ''}`}
                  />
                )}
                <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 font-cifra text-ink-faint">
                  {modo === 'pct' ? '%' : '$'}
                </span>
              </div>

              <input
                type="range"
                aria-label="Porcentaje de enganche"
                min={esquema?.min ?? 0}
                max={esquema?.max ?? 75}
                step="0.5"
                value={dp ?? esquema?.min ?? 0}
                disabled={!esquema}
                onChange={(e) => fijarDp(parseFloat(e.target.value))}
                className="mt-4 w-full cursor-pointer accent-gold disabled:cursor-not-allowed disabled:opacity-40"
              />
              <div className="flex justify-between font-cifra text-xs text-ink-faint">
                <span>{esquema ? `${esquema.min}%` : '—'}</span>
                <span>{esquema ? `${esquema.max}%` : '—'}</span>
              </div>
              <p className={`mt-2 font-cifra text-xs ${fueraDeRango ? 'text-state-danger' : 'text-ink-faint'}`}>
                {hint}
              </p>

              <div className="mt-4 flex items-start gap-3 border-t border-white/10 pt-3.5">
                <button
                  type="button"
                  aria-pressed={incluyeServicio}
                  aria-label="Incluir servicio preventivo"
                  onClick={() => setIncluyeServicio((v) => !v)}
                  className={`relative h-[21px] w-[38px] flex-none rounded-full border transition ${
                    incluyeServicio ? 'border-gold bg-gold/25' : 'border-white/20 bg-navy-700'
                  }`}
                >
                  <span
                    className={`absolute left-0.5 top-0.5 h-[15px] w-[15px] rounded-full transition ${
                      incluyeServicio ? 'translate-x-[17px] bg-gold' : 'bg-ink-faint'
                    }`}
                  />
                </button>
                <div>
                  <div className="text-sm font-semibold text-ink">Servicio preventivo</div>
                  <div className="font-cifra text-xs text-ink-faint">
                    {!moto
                      ? 'Elige un modelo para ver el costo.'
                      : moto.servicio > 0
                        ? `${incluyeServicio ? 'Incluido' : 'Disponible'}: +${formatMXN0(moto.servicio)}`
                        : 'Sin costo definido para este modelo.'}
                  </div>
                </div>
              </div>
            </Seccion>
          </div>

          {/* ══ RESULTADO EN VIVO ══ */}
          <ResultadoCotizacion
            moto={moto}
            esquema={esquema}
            dp={dp}
            dpOk={dpOk}
            incluyeServicio={incluyeServicio}
            calculo={calculo}
            vendedor={user?.username}
            onDescargar={() => setPanelAbierto(true)}
          />
        </div>
      </div>

      {listo && (
        <PanelDescarga
          open={panelAbierto}
          onClose={() => setPanelAbierto(false)}
          esquema={esquema}
          pagos={calculo.pagos}
          onDescargar={descargar}
          onError={() => setAviso({ texto: 'No se pudo generar la imagen. Intenta de nuevo.', error: true })}
        />
      )}

      {aviso && (
        <div
          role="status"
          aria-live="polite"
          className={`fixed bottom-6 left-1/2 z-[80] -translate-x-1/2 animate-fadeIn rounded-lg border bg-navy-700 px-4 py-2.5 text-sm shadow-card ${
            aviso.error ? 'border-state-danger text-state-danger' : 'border-white/15 text-ink'
          }`}
        >
          {aviso.texto}
        </div>
      )}
    </div>
  );
}

/** Sección numerada del configurador: el número se vuelve palomita al completarse. */
function Seccion({ n, titulo, listo, estado, children }) {
  return (
    <section className="border-b border-white/10 p-4 last:border-b-0 sm:px-5">
      <div className="mb-3 flex items-center gap-2.5">
        <span
          className={`grid h-[22px] w-[22px] flex-none place-items-center rounded-full border font-cifra text-xs transition ${
            listo
              ? 'border-state-success bg-state-success/10 text-state-success'
              : 'border-white/20 bg-navy-900/60 text-ink-faint'
          }`}
        >
          {listo ? <Check size={11} strokeWidth={3.4} /> : n}
        </span>
        <h2 className="font-head text-[15px] font-bold text-ink">{titulo}</h2>
        <span className={`ml-auto font-cifra text-xs ${listo ? 'text-state-success' : 'text-ink-faint'}`}>
          {listo ? estado : 'Pendiente'}
        </span>
      </div>
      {children}
    </section>
  );
}
