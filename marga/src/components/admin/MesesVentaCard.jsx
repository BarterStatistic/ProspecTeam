import { useMemo, useState } from 'react';
import { CalendarPlus, Pencil, Trash2, AlertTriangle, Flame, X } from 'lucide-react';
import { useData } from '../../context/DataContext.jsx';
import {
  etiquetaMes,
  mesVenta,
  periodosVenta,
  periodoVentaPara,
  sumarMes,
} from '../../lib/comisiones.js';
import { toDateInput, fromDateInput, formatDateShort as formatDate } from '../../lib/format.js';
import Card from '../ui/Card.jsx';
import Button from '../ui/Button.jsx';
import Input from '../ui/Input.jsx';

const DAY = 86_400_000;

const uuid = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `mv-${Date.now()}-${Math.random().toString(16).slice(2)}`;

/** Días completos del rango, contando inicio y fin. */
const duracion = (p) => Math.round((p.fin - p.inicio) / DAY) + 1;

/** Mismo día del mes siguiente, menos uno: el fin sugerido de un periodo. */
function finSugerido(inicioTs) {
  const d = new Date(inicioTs);
  return new Date(d.getFullYear(), d.getMonth() + 1, d.getDate() - 1).getTime();
}

/**
 * Valores por default del formulario: el mes siguiente al último registrado,
 * arrancando el día después de que termina; sin registros, el mes de venta en
 * curso desde hoy.
 */
function valoresNuevos(periodos, config) {
  const ultimo = periodos[periodos.length - 1];
  if (ultimo) {
    const inicio = ultimo.fin + DAY;
    return {
      clave: sumarMes(ultimo.clave, 1),
      inicio: toDateInput(inicio),
      fin: toDateInput(finSugerido(inicio)),
    };
  }
  const hoy = fromDateInput(toDateInput(Date.now()));
  return {
    clave: mesVenta(hoy, config),
    inicio: toDateInput(hoy),
    fin: toDateInput(finSugerido(hoy)),
  };
}

/**
 * Meses de venta: el admin registra el inicio y el fin de cada mes de venta, y
 * ese rango es la duración de la racha de los vendedores en ese mes. Los días
 * que no cubre ningún mes registrado siguen la regla "el mes arranca el día N"
 * de Reglas de comisiones.
 */
export default function MesesVentaCard() {
  const { configComisiones, guardarPeriodosVenta } = useData();
  const periodos = useMemo(() => periodosVenta(configComisiones), [configComisiones]);

  const [editando, setEditando] = useState(null); // id del periodo en edición
  const [valores, setValores] = useState(() => valoresNuevos(periodos, configComisiones));
  const [error, setError] = useState('');
  const [mensaje, setMensaje] = useState('');
  const [guardando, setGuardando] = useState(false);

  const hoy = Date.now();
  const enCurso = periodoVentaPara(hoy, configComisiones);
  const claveHoy = mesVenta(hoy, configComisiones);

  // Huecos entre meses consecutivos: días que caen en la regla de respaldo.
  const huecos = useMemo(() => {
    const lista = [];
    for (let i = 1; i < periodos.length; i++) {
      const prev = periodos[i - 1];
      const sig = periodos[i];
      if (sig.inicio - prev.fin > DAY) {
        lista.push({ desde: prev.fin + DAY, hasta: sig.inicio - DAY });
      }
    }
    return lista;
  }, [periodos]);

  const set = (campo) => (e) => {
    const v = e.target.value;
    setValores((prev) => {
      const next = { ...prev, [campo]: v };
      // Mover el inicio arrastra el fin sugerido, mientras no se haya tocado a mano.
      if (campo === 'inicio' && !editando) {
        const ts = fromDateInput(v);
        if (ts != null) next.fin = toDateInput(finSugerido(ts));
      }
      return next;
    });
    setError('');
  };

  function cancelarEdicion() {
    setEditando(null);
    setValores(valoresNuevos(periodos, configComisiones));
    setError('');
  }

  function editar(p) {
    setEditando(p.id);
    setValores({ clave: p.clave, inicio: toDateInput(p.inicio), fin: toDateInput(p.fin) });
    setError('');
    setMensaje('');
  }

  async function persistir(lista, texto) {
    setGuardando(true);
    setError('');
    try {
      const movidas = await guardarPeriodosVenta(lista);
      setMensaje(
        movidas === 0
          ? texto
          : `${texto} ${movidas} venta${movidas === 1 ? '' : 's'} ya facturada${
              movidas === 1 ? '' : 's'
            } cambi${movidas === 1 ? 'ó' : 'aron'} de mes y se recalcularon las rachas.`,
      );
      return true;
    } catch (err) {
      setError(err?.message || 'No se pudo guardar el mes de venta.');
      return false;
    } finally {
      setGuardando(false);
    }
  }

  async function guardar(e) {
    e?.preventDefault();
    const inicio = fromDateInput(valores.inicio);
    const fin = fromDateInput(valores.fin);
    if (!/^\d{4}-\d{2}$/.test(valores.clave ?? '')) return setError('Elige el mes.');
    if (inicio == null || fin == null) return setError('Captura la fecha de inicio y la de fin.');
    if (fin < inicio) return setError('La fecha de fin es anterior a la de inicio.');

    const otros = periodos.filter((p) => p.id !== editando);
    const repetido = otros.find((p) => p.clave === valores.clave);
    if (repetido) return setError(`${etiquetaMes(valores.clave)} ya está registrado.`);
    const empalme = otros.find((p) => inicio <= p.fin && fin >= p.inicio);
    if (empalme) {
      return setError(
        `Se empalma con ${etiquetaMes(empalme.clave)} (${formatDate(empalme.inicio)} – ${formatDate(empalme.fin)}).`,
      );
    }

    const periodo = { id: editando ?? uuid(), clave: valores.clave, inicio, fin };
    const lista = [...otros, periodo].sort((a, b) => a.inicio - b.inicio);
    const ok = await persistir(
      lista,
      editando
        ? `${etiquetaMes(periodo.clave)} actualizado.`
        : `${etiquetaMes(periodo.clave)} registrado.`,
    );
    if (!ok) return;
    setEditando(null);
    setValores(valoresNuevos(lista, configComisiones));
  }

  async function eliminar(p) {
    if (
      !window.confirm(
        `¿Eliminar el mes de venta ${etiquetaMes(p.clave)}? Sus días volverán a la regla "el mes arranca el día ${configComisiones.diaInicioMes ?? 1}".`,
      )
    ) {
      return;
    }
    const lista = periodos.filter((x) => x.id !== p.id);
    const ok = await persistir(lista, `${etiquetaMes(p.clave)} eliminado.`);
    if (ok && editando === p.id) {
      setEditando(null);
      setValores(valoresNuevos(lista, configComisiones));
    }
  }

  return (
    <Card className="p-4">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-ink">Meses de venta</h3>
          <p className="text-[11px] text-ink-faint">
            La racha de cada vendedor dura del inicio al fin del mes de venta: las ventas
            facturadas en ese rango suman a la misma racha.
          </p>
        </div>
        <span className="flex items-center gap-1.5 rounded-full bg-gold/10 px-3 py-1 text-[11px] font-medium text-gold">
          <Flame size={12} />
          Hoy: {etiquetaMes(claveHoy)}
          {enCurso
            ? ` (${formatDate(enCurso.inicio)} – ${formatDate(enCurso.fin)})`
            : ' (regla por día)'}
        </span>
      </div>

      <form
        onSubmit={guardar}
        className="grid grid-cols-1 items-end gap-3 rounded-lg bg-navy-900/50 p-3 sm:grid-cols-[1fr_1fr_1fr_auto]"
      >
        <Input label="Mes de venta" type="month" value={valores.clave} onChange={set('clave')} />
        <Input label="Inicio" type="date" value={valores.inicio} onChange={set('inicio')} />
        <Input label="Fin" type="date" value={valores.fin} onChange={set('fin')} />
        <div className="flex gap-2">
          <Button type="submit" variant="gold" size="sm" disabled={guardando}>
            <CalendarPlus size={14} /> {editando ? 'Guardar' : 'Agregar'}
          </Button>
          {editando && (
            <Button type="button" variant="ghost" size="sm" onClick={cancelarEdicion}>
              <X size={14} />
            </Button>
          )}
        </div>
      </form>

      {error && (
        <p className="mt-2 flex items-center gap-1.5 text-[11px] text-state-danger">
          <AlertTriangle size={12} /> {error}
        </p>
      )}
      {mensaje && !error && <p className="mt-2 text-[11px] text-state-success">{mensaje}</p>}

      {periodos.length === 0 ? (
        <p className="py-4 text-center text-[11px] text-ink-faint">
          Aún no hay meses de venta registrados: el mes arranca el día{' '}
          {configComisiones.diaInicioMes ?? 1} de cada mes (Reglas de comisiones).
        </p>
      ) : (
        <ul className="mt-3 space-y-1.5">
          {[...periodos].reverse().map((p) => {
            const actual = enCurso?.id === p.id;
            return (
              <li
                key={p.id}
                className={`flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg px-3 py-2 text-xs ${
                  editando === p.id ? 'bg-gold/10' : 'bg-white/[0.03]'
                }`}
              >
                <span className="min-w-[120px] font-semibold text-ink">{etiquetaMes(p.clave)}</span>
                <span className="text-ink-muted">
                  {formatDate(p.inicio)} – {formatDate(p.fin)}
                </span>
                <span className="text-ink-faint">{duracion(p)} días</span>
                {actual && (
                  <span className="m-chip bg-state-success/15 text-state-success">En curso</span>
                )}
                <span className="ml-auto flex gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={`Editar ${etiquetaMes(p.clave)}`}
                    onClick={() => editar(p)}
                  >
                    <Pencil size={14} />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={`Eliminar ${etiquetaMes(p.clave)}`}
                    onClick={() => eliminar(p)}
                    disabled={guardando}
                  >
                    <Trash2 size={14} className="text-state-danger" />
                  </Button>
                </span>
              </li>
            );
          })}
        </ul>
      )}

      {huecos.map((h) => (
        <p
          key={h.desde}
          className="mt-2 flex items-center gap-1.5 text-[11px] text-state-warning"
        >
          <AlertTriangle size={12} />
          Del {formatDate(h.desde)} al {formatDate(h.hasta)} no hay mes de venta registrado: esas
          ventas siguen la regla por día.
        </p>
      ))}
    </Card>
  );
}
