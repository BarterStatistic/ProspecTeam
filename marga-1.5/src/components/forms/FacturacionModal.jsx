import { useEffect, useMemo, useState } from 'react';
import { useData } from '../../context/DataContext.jsx';
import { MODELS, SCHEMES, SCHEME_IDS, normalizarEsquema } from '../../lib/motos.js';
import { calcularFinanciamiento } from '../../lib/cotizador.js';
import {
  calcularComision,
  fechaPago,
  mesVenta,
  numeroVentaPara,
} from '../../lib/comisiones.js';
import { formatMXN, formatPct, formatDate, toDateInput, fromDateInput } from '../../lib/format.js';
import Modal from '../ui/Modal.jsx';
import Button from '../ui/Button.jsx';
import Input from '../ui/Input.jsx';
import Select from '../ui/Select.jsx';
import Checkbox from '../ui/Checkbox.jsx';

const MOTO_OPTIONS = MODELS.map((m) => ({ value: m.nombre, label: m.nombre }));
const ESQUEMA_OPTIONS = SCHEME_IDS.map((id) => ({ value: id, label: SCHEMES[id].label }));

/** "HH:MM" de un timestamp, para <input type="time">. */
function toTimeInput(ts) {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** Primera moto del campo de texto libre de la tarjeta, si está en el catálogo. */
function motoInicial(cliente) {
  const primera = (cliente?.motorcycles ?? '').split(',')[0]?.trim() ?? '';
  return MODELS.some((m) => m.nombre === primera) ? primera : '';
}

/**
 * Captura de "Moto Facturada": día y hora, enganche en pesos y servicio
 * preventivo. Muestra el resultado del cálculo antes de confirmar, para que
 * quien captura vea la comisión que va a generar.
 */
export default function FacturacionModal({ cliente, onClose }) {
  const {
    comisiones,
    configComisiones,
    registrarFacturacion,
    actualizarFacturacion,
  } = useData();

  const comisionPrevia = useMemo(
    () => comisiones.find((c) => c.id === cliente?.comisionId) ?? null,
    [comisiones, cliente],
  );
  const esEdicion = !!comisionPrevia;

  const [fecha, setFecha] = useState('');
  const [hora, setHora] = useState('');
  const [enganche, setEnganche] = useState('');
  const [incluyeServicio, setIncluyeServicio] = useState(false);
  const [motoNombre, setMotoNombre] = useState('');
  const [esquemaId, setEsquemaId] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  // El enganche llega vacío al registrar una facturación nueva: sin esto, la
  // vista previa marca "Captura el enganche en pesos." en rojo desde antes de
  // que el usuario haya tecleado nada. Se enciende con la primera
  // interacción del campo y se apaga cada vez que el modal se reabre.
  const [engancheTocado, setEngancheTocado] = useState(false);

  useEffect(() => {
    if (!cliente) return;
    const base = comisionPrevia?.fechaFacturacion ?? Date.now();
    setFecha(toDateInput(base));
    setHora(toTimeInput(base));
    setEnganche(comisionPrevia ? String(comisionPrevia.enganche) : '');
    setIncluyeServicio(comisionPrevia?.incluyeServicio ?? false);
    setMotoNombre(comisionPrevia?.moto ?? motoInicial(cliente));
    setEsquemaId(
      comisionPrevia?.esquemaId ?? normalizarEsquema(cliente.creditScheme ?? ''),
    );
    setError('');
    setGuardando(false);
    setEngancheTocado(false);
  }, [cliente, comisionPrevia]);

  const fechaFacturacion = useMemo(() => {
    const dia = fromDateInput(fecha);
    if (!dia) return null;
    const [h, m] = (hora || '00:00').split(':').map(Number);
    return dia + h * 3_600_000 + m * 60_000;
  }, [fecha, hora]);

  // Vista previa del cálculo. Cualquier dato inválido se reporta como texto,
  // nunca revienta el modal.
  const preview = useMemo(() => {
    const monto = Number(enganche);
    if (!motoNombre || !esquemaId || !fechaFacturacion) return { error: '' };
    if (!Number.isFinite(monto) || monto <= 0) {
      // No es un error de cálculo (rango/banda): es que todavía no hay
      // enganche capturado. Se marca `esVacio` para que la vista solo lo
      // muestre en rojo después de que el usuario haya tocado el campo.
      return { error: 'Captura el enganche en pesos.', esVacio: true };
    }
    try {
      const fin = calcularFinanciamiento({
        motoNombre,
        incluyeServicio,
        esquemaId,
        enganche: monto,
      });
      const clave = mesVenta(fechaFacturacion, configComisiones);
      // Mismo criterio que `actualizarFacturacion`/`registrarFacturacion` en
      // `src/lib/db.js`, vía `numeroVentaPara`: si la edición no cambia de mes
      // de venta, conserva el número de venta original; si cambia, recuenta
      // las ventas de ese vendedor en el mes nuevo EXCLUYENDO la propia
      // comisión que se edita.
      const numeroVenta = esEdicion
        ? clave === comisionPrevia.mesVenta
          ? comisionPrevia.numeroVenta
          : numeroVentaPara(comisiones, {
              vendedor: comisionPrevia.vendedor,
              clave,
              excluirId: comisionPrevia.id,
            })
        : numeroVentaPara(comisiones, { vendedor: cliente.createdBy ?? '', clave });
      const com = calcularComision({
        montoFinanciado: fin.montoFinanciado,
        esquemaId,
        numeroVenta,
        tienePromotor: !!cliente.promotorEncargado,
      });
      return {
        error: '',
        fin,
        com,
        numeroVenta,
        pago: fechaPago(fechaFacturacion, configComisiones),
      };
    } catch (e) {
      return { error: e.message };
    }
  }, [
    motoNombre,
    esquemaId,
    enganche,
    incluyeServicio,
    fechaFacturacion,
    cliente,
    comisiones,
    comisionPrevia,
    esEdicion,
    configComisiones,
  ]);

  const puedeGuardar = !!preview.fin && !preview.error && !guardando;

  async function guardar() {
    if (!puedeGuardar) return;
    setGuardando(true);
    setError('');
    const values = {
      fechaFacturacion,
      enganche: Number(enganche),
      incluyeServicio,
      motoNombre,
      esquemaId,
    };
    try {
      if (esEdicion) await actualizarFacturacion(comisionPrevia.id, values);
      else await registrarFacturacion(cliente.id, values);
      setGuardando(false);
      onClose(true);
    } catch (e) {
      setError(e.message);
      setGuardando(false);
    }
  }

  return (
    <Modal
      open={!!cliente}
      onClose={() => onClose(false)}
      size="lg"
      title={esEdicion ? 'Editar facturación' : 'Moto facturada'}
      footer={
        <>
          <Button variant="ghost" onClick={() => onClose(false)}>
            Cancelar
          </Button>
          <Button variant="gold" onClick={guardar} disabled={!puedeGuardar}>
            {esEdicion ? 'Guardar cambios' : 'Registrar facturación'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-xs text-ink-faint">
          Cliente: <span className="text-ink-muted">{`${cliente?.firstName ?? ''} ${cliente?.lastName ?? ''}`.trim()}</span>
        </p>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input
            label="Día de facturación"
            type="date"
            required
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
          />
          <Input
            label="Hora aproximada"
            type="time"
            required
            value={hora}
            onChange={(e) => setHora(e.target.value)}
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Select
            label="Moto vendida"
            required
            options={MOTO_OPTIONS}
            value={motoNombre}
            onChange={(e) => setMotoNombre(e.target.value)}
            placeholder="Selecciona el modelo"
          />
          <Select
            label="Esquema de crédito"
            required
            options={ESQUEMA_OPTIONS}
            value={esquemaId}
            onChange={(e) => setEsquemaId(e.target.value)}
            placeholder="Selecciona el esquema"
          />
        </div>

        <Input
          label="Enganche (pesos)"
          type="number"
          min="0"
          step="1"
          required
          value={enganche}
          onChange={(e) => {
            setEnganche(e.target.value);
            setEngancheTocado(true);
          }}
          onBlur={() => setEngancheTocado(true)}
          placeholder="Ej. 15000"
        />

        <Checkbox
          checked={incluyeServicio}
          onChange={setIncluyeServicio}
          label="Incluye servicio preventivo"
        />

        {preview.error && (!preview.esVacio || engancheTocado) && (
          <p className="text-sm text-state-danger">{preview.error}</p>
        )}

        {preview.fin && (
          <div className="rounded-xl border border-white/10 bg-navy-900/60 p-4">
            <p className="mb-2 text-xs font-medium text-ink-muted">Resultado del cálculo</p>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
              <dt className="text-ink-faint">Enganche</dt>
              <dd className="text-right text-ink">
                {formatPct(preview.fin.enganchePct)}
              </dd>
              <dt className="text-ink-faint">
                Parcialidad ({preview.fin.plazoMax} {SCHEMES[esquemaId].termUnit})
              </dt>
              <dd className="text-right text-ink">{formatMXN(preview.fin.parcialidad)}</dd>
              <dt className="text-ink-faint">Monto financiado</dt>
              <dd className="text-right text-sky2">
                {formatMXN(preview.fin.montoFinanciado)}
              </dd>
              <dt className="text-ink-faint">Comisión total</dt>
              <dd className="text-right text-ink">{formatMXN(preview.com.comisionTotal)}</dd>
              <dt className="text-ink-faint">
                Comisión del vendedor (venta #{preview.numeroVenta} ·{' '}
                {(preview.com.porcentajeRacha * 100).toFixed(0)}%)
              </dt>
              <dd className="text-right font-semibold text-gold">
                {formatMXN(preview.com.comisionVendedor)}
              </dd>
              <dt className="text-ink-faint">
                {cliente?.promotorEncargado
                  ? `Comisión del promotor (${cliente.promotorEncargado})`
                  : 'Sin promotor'}
              </dt>
              <dd className="text-right text-ink">
                {formatMXN(preview.com.comisionPromotor)}
              </dd>
              <dt className="text-ink-faint">Neto admin</dt>
              <dd className="text-right text-ink">{formatMXN(preview.com.netoAdmin)}</dd>
              <dt className="text-ink-faint">Se paga el</dt>
              <dd className="text-right text-ink">{formatDate(preview.pago)}</dd>
            </dl>
          </div>
        )}

        {error && <p className="text-sm text-state-danger">{error}</p>}
      </div>
    </Modal>
  );
}
