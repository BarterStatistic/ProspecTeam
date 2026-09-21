import { useEffect, useState } from 'react';
import { Plus, Trash2, RefreshCw, AlertTriangle } from 'lucide-react';
import { useData } from '../../context/DataContext.jsx';
import { mesVenta } from '../../lib/comisiones.js';
import { toDateInput, fromDateInput } from '../../lib/format.js';
import Card from '../ui/Card.jsx';
import Button from '../ui/Button.jsx';
import Input, { Textarea } from '../ui/Input.jsx';
import Select from '../ui/Select.jsx';

const DIAS = [
  { value: '1', label: 'Lunes' },
  { value: '2', label: 'Martes' },
  { value: '3', label: 'Miércoles' },
  { value: '4', label: 'Jueves' },
  { value: '5', label: 'Viernes' },
  { value: '6', label: 'Sábado' },
  { value: '7', label: 'Domingo' },
];

const uuid = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `exc-${Date.now()}-${Math.random().toString(16).slice(2)}`;

/**
 * Segunda línea de defensa para los selectores de día: solo un entero 1..7 se
 * guarda. `Select.jsx` ya no ofrece una opción en blanco (placeholder={null}),
 * pero si algo más llegara a producir un valor vacío o fuera de rango, esto
 * evita que un `diaCorte`/`diaPago` de 0 (u otro no válido) corra en silencio
 * todas las fechas de pago del equipo.
 */
function diaValido(value) {
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 && n <= 7 ? n : null;
}

/**
 * Configuración de comisiones: cuándo arranca el mes de venta, la regla base de
 * corte y pago, las excepciones por semana concreta y la nota que ven los
 * vendedores. Todo se guarda en el documento único config/comisiones.
 */
export default function ReglasPagoCard() {
  const { configComisiones, guardarConfigComisiones, renumerarMes } = useData();
  const [nota, setNota] = useState('');
  const [mensaje, setMensaje] = useState('');

  useEffect(() => {
    setNota(configComisiones.notaVendedores ?? '');
  }, [configComisiones.notaVendedores]);

  const excepciones = configComisiones.excepciones ?? [];

  function guardarExcepciones(lista) {
    return guardarConfigComisiones({
      excepciones: lista.sort((a, b) => a.desde - b.desde),
    });
  }

  function agregarExcepcion() {
    const hoy = new Date();
    const lunes = fromDateInput(toDateInput(hoy.getTime()));
    guardarExcepciones([
      ...excepciones,
      { id: uuid(), desde: lunes, hasta: lunes + 6 * 86_400_000, fechaPago: lunes + 11 * 86_400_000, nota: '' },
    ]);
  }

  function editarExcepcion(id, patch) {
    guardarExcepciones(excepciones.map((e) => (e.id === id ? { ...e, ...patch } : e)));
  }

  async function renumerar() {
    const clave = mesVenta(Date.now(), configComisiones);
    const n = await renumerarMes(clave);
    setMensaje(
      n === 0
        ? `El mes ${clave} ya estaba numerado correctamente.`
        : `Se renumeraron ${n} comisión${n === 1 ? '' : 'es'} del mes ${clave}.`,
    );
  }

  return (
    <Card className="p-4">
      <h3 className="text-sm font-semibold text-ink">Reglas de comisiones</h3>
      <p className="mb-3 text-[11px] text-ink-faint">
        Cambiar estas reglas recalcula al instante la fecha de pago de todas las comisiones.
      </p>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Input
          label="El mes de venta arranca el día"
          type="number"
          min="1"
          max="28"
          value={configComisiones.diaInicioMes ?? 1}
          onChange={(e) =>
            guardarConfigComisiones({
              diaInicioMes: Math.min(28, Math.max(1, Number(e.target.value) || 1)),
            })
          }
        />
        <Select
          label="Día de corte"
          options={DIAS}
          value={String(configComisiones.diaCorte ?? 1)}
          onChange={(e) => {
            const dia = diaValido(e.target.value);
            if (dia != null) guardarConfigComisiones({ diaCorte: dia });
          }}
          placeholder={null}
        />
        <Select
          label="Día de pago"
          options={DIAS}
          value={String(configComisiones.diaPago ?? 5)}
          onChange={(e) => {
            const dia = diaValido(e.target.value);
            if (dia != null) guardarConfigComisiones({ diaPago: dia });
          }}
          placeholder={null}
        />
      </div>

      <div className="mt-4 border-t border-white/5 pt-3">
        <div className="mb-2 flex items-center justify-between gap-3">
          <div>
            <h4 className="text-xs font-semibold text-ink">Semanas con corte especial</h4>
            <p className="text-[11px] text-ink-faint">
              Las ventas facturadas dentro del rango se pagan en la fecha indicada.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={agregarExcepcion}>
            <Plus size={14} /> Agregar
          </Button>
        </div>

        {excepciones.length === 0 ? (
          <p className="py-3 text-center text-[11px] text-ink-faint">
            Sin excepciones: aplica la regla base.
          </p>
        ) : (
          <ul className="space-y-2">
            {excepciones.map((e) => {
              // No se bloquea el guardado: mientras el admin mueve `desde` y
              // `hasta` por separado, el rango pasa por estados intermedios
              // invertidos (p. ej. al adelantar `desde` más allá de `hasta`
              // vigente). Solo se avisa mientras la inversión persiste, para
              // que no quede una excepción que fechaPago() nunca encuentra
              // sin que nadie se entere.
              const invertida = e.hasta < e.desde;
              return (
                <li
                  key={e.id}
                  className="grid grid-cols-1 gap-2 rounded-lg bg-navy-900/50 p-3 sm:grid-cols-4"
                >
                  <Input
                    label="Desde"
                    type="date"
                    value={toDateInput(e.desde)}
                    onChange={(ev) =>
                      editarExcepcion(e.id, { desde: fromDateInput(ev.target.value) })
                    }
                  />
                  <Input
                    label="Hasta"
                    type="date"
                    value={toDateInput(e.hasta)}
                    onChange={(ev) =>
                      editarExcepcion(e.id, { hasta: fromDateInput(ev.target.value) })
                    }
                  />
                  <Input
                    label="Se paga el"
                    type="date"
                    value={toDateInput(e.fechaPago)}
                    onChange={(ev) =>
                      editarExcepcion(e.id, { fechaPago: fromDateInput(ev.target.value) })
                    }
                  />
                  <div className="flex items-end gap-2">
                    <Input
                      label="Nota"
                      className="flex-1"
                      value={e.nota ?? ''}
                      onChange={(ev) => editarExcepcion(e.id, { nota: ev.target.value })}
                      placeholder="Motivo"
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label="Eliminar excepción"
                      onClick={() => guardarExcepciones(excepciones.filter((x) => x.id !== e.id))}
                    >
                      <Trash2 size={14} className="text-state-danger" />
                    </Button>
                  </div>
                  {invertida && (
                    <p className="col-span-full flex items-center gap-1.5 text-[11px] text-state-warning">
                      <AlertTriangle size={12} />
                      La fecha final es anterior a la inicial: esta excepción no se aplicará.
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="mt-4 border-t border-white/5 pt-3">
        <Textarea
          label="Nota para los vendedores"
          value={nota}
          onChange={(e) => setNota(e.target.value)}
          onBlur={() => guardarConfigComisiones({ notaVendedores: nota })}
          placeholder="Aparece arriba de sus comisiones."
        />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-white/5 pt-3">
        <Button variant="outline" size="sm" onClick={renumerar}>
          <RefreshCw size={14} /> Renumerar mes en curso
        </Button>
        <span className="text-[11px] text-ink-faint">
          Reordena la racha por fecha de facturación. Solo cuando corrijas o borres una venta.
        </span>
        {mensaje && <span className="text-[11px] text-state-success">{mensaje}</span>}
      </div>
    </Card>
  );
}
