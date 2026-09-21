import { useRef, useState } from 'react';
import { Download, Check } from 'lucide-react';
import { useData } from '../context/DataContext.jsx';
import { SCHEMES, motoPorNombre } from '../lib/motos.js';
import { precioEfectivo, parcialidad } from '../lib/cotizador.js';
import { toDateInput } from '../lib/format.js';
import Card from '../components/ui/Card.jsx';
import Button from '../components/ui/Button.jsx';
import PasoMoto from '../components/cotizador/PasoMoto.jsx';
import PasoEsquema from '../components/cotizador/PasoEsquema.jsx';
import PasoEnganche from '../components/cotizador/PasoEnganche.jsx';
import Cotizacion from '../components/cotizador/Cotizacion.jsx';

const PASOS = ['Moto', 'Esquema', 'Enganche'];

/**
 * Cotizador PT dentro de Marga. Mismo flujo que el cotizador estático de
 * cotizador-pt/, con los primitivos y la paleta de Marga. Cada cotización
 * generada se registra para contarlas por vendedor en el Panel ADMIN.
 */
export default function CotizadorView() {
  const { registrarCotizacion } = useData();
  const [paso, setPaso] = useState(0);
  const [motoNombre, setMotoNombre] = useState('');
  const [esquemaId, setEsquemaId] = useState('');
  const [enganchePct, setEnganchePct] = useState(0);
  const [incluyeServicio, setIncluyeServicio] = useState(false);
  const [generada, setGenerada] = useState(false);
  const [error, setError] = useState('');
  const [descargando, setDescargando] = useState(false);
  const cotizacionRef = useRef(null);

  const moto = motoNombre ? motoPorNombre(motoNombre) : null;
  const esquema = esquemaId ? SCHEMES[esquemaId] : null;
  const enRango = !!esquema && enganchePct >= esquema.min && enganchePct <= esquema.max;
  const puedeGenerar = !!moto && !!esquema && enRango;

  // Cambiar cualquier dato invalida la cotización que ya está en pantalla, para
  // que nadie descargue una imagen que no corresponde a lo que ve.
  const invalidar = (fn) => (v) => {
    setGenerada(false);
    setError('');
    fn(v);
  };

  function elegirMoto(nombre) {
    setGenerada(false);
    setError('');
    setMotoNombre(nombre);
    setPaso(1);
  }

  function elegirEsquema(id) {
    setGenerada(false);
    setError('');
    setEsquemaId(id);
    // El enganche arranca en el mínimo permitido del esquema elegido (decisión
    // del dueño), en vez de quedar vacío/en 0 y forzar al vendedor a mirar el
    // mínimo aparte. Sigue siendo editable; cambiar de esquema lo reajusta al
    // mínimo del esquema nuevo, porque esta función corre en cada elección.
    setEnganchePct(SCHEMES[id].min);
    setPaso(2);
  }

  function generar() {
    // Segunda línea de defensa: si ya hay una cotización vigente, no crear
    // otro registro aunque lleguen dos clics antes del re-render que
    // deshabilita el botón.
    if (!puedeGenerar || generada) return;
    const precio = precioEfectivo(moto, incluyeServicio);
    const plazo = esquema.terms.at(-1);
    const montoACredito = precio - (precio * enganchePct) / 100;
    // Se valida ANTES de marcar la cotización como generada: si el cálculo
    // falla (enganche sin nivel de factores, plazo inexistente), se muestra el
    // mensaje y no se registra nada ni se pinta una cotización rota.
    let pagoPlazoMax;
    try {
      // Todos los plazos, igual que Cotizacion.jsx; el último es `plazo`.
      for (const p of esquema.terms) {
        pagoPlazoMax = parcialidad({ esquemaId, montoACredito, enganchePct, plazo: p });
      }
    } catch (e) {
      setError(e?.message || 'No se pudo calcular la cotización con estos datos.');
      return;
    }
    setError('');
    setGenerada(true);
    registrarCotizacion({
      moto: motoNombre,
      esquemaId,
      precioEfectivo: precio,
      enganchePct,
      plazo,
      // Redondeado al peso: es el mismo valor que Cotizacion.jsx muestra, para
      // que el registro coincida con lo que vio el vendedor.
      parcialidad: Math.round(pagoPlazoMax),
    });
  }

  async function descargar() {
    if (!cotizacionRef.current) return;
    setDescargando(true);
    try {
      // Import diferido: html2canvas pesa ~200 KB y solo hace falta aquí.
      const { default: html2canvas } = await import('html2canvas');
      const canvas = await html2canvas(cotizacionRef.current, {
        backgroundColor: '#0B1E3B',
        scale: 2,
      });
      const a = document.createElement('a');
      a.download = `cotizacion-${motoNombre.replace(/\s+/g, '-').toLowerCase()}-${toDateInput(Date.now())}.png`;
      a.href = canvas.toDataURL('image/png');
      a.click();
    } finally {
      setDescargando(false);
    }
  }

  return (
    <div className="h-full overflow-y-auto px-4 py-5 sm:px-6">
      <div className="mx-auto max-w-4xl space-y-4">
        <div className="flex gap-2">
          {PASOS.map((label, i) => {
            const habilitado = i === 0 || (i === 1 && moto) || (i === 2 && moto && esquema);
            const activo = paso === i;
            return (
              <button
                key={label}
                type="button"
                disabled={!habilitado}
                onClick={() => setPaso(i)}
                className={`flex flex-1 items-center justify-center gap-2 rounded-xl px-3 py-2 text-xs font-medium
                  transition disabled:pointer-events-none disabled:opacity-40
                  ${activo ? 'bg-gold/15 text-gold' : 'bg-white/5 text-ink-muted hover:text-ink'}`}
              >
                <span className="flex h-5 w-5 items-center justify-center rounded-full border border-current text-[10px]">
                  {i < paso ? <Check size={11} strokeWidth={3} /> : `0${i + 1}`}
                </span>
                {label}
              </button>
            );
          })}
        </div>

        <Card className="p-4">
          {paso === 0 && <PasoMoto value={motoNombre} onChange={elegirMoto} />}
          {paso === 1 && <PasoEsquema value={esquemaId} onChange={elegirEsquema} />}
          {paso === 2 && moto && esquema && (
            <PasoEnganche
              moto={moto}
              esquemaId={esquemaId}
              enganchePct={enganchePct}
              onEnganchePct={invalidar(setEnganchePct)}
              incluyeServicio={incluyeServicio}
              onIncluyeServicio={invalidar(setIncluyeServicio)}
            />
          )}
        </Card>

        {error && <p className="text-right text-sm text-state-danger">{error}</p>}

        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="gold" onClick={generar} disabled={!puedeGenerar || generada}>
            Generar cotización
          </Button>
          {generada && (
            <Button variant="outline" onClick={descargar} disabled={descargando}>
              <Download size={16} />
              {descargando ? 'Generando…' : 'Descargar imagen'}
            </Button>
          )}
        </div>

        {generada && moto && esquema ? (
          <Cotizacion
            ref={cotizacionRef}
            moto={moto}
            esquemaId={esquemaId}
            enganchePct={enganchePct}
            incluyeServicio={incluyeServicio}
          />
        ) : (
          <Card className="p-10">
            <p className="text-center text-xs text-ink-faint">
              Elige moto, esquema y enganche para generar la cotización.
            </p>
          </Card>
        )}
      </div>
    </div>
  );
}
