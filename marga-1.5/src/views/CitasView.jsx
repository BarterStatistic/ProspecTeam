import { useMemo, useRef, useState } from 'react';
import {
  CalendarPlus,
  CalendarClock,
  CalendarRange,
  RefreshCw,
  Pencil,
  Trash2,
  Phone,
  Bike,
  UserRound,
  Download,
  ImageUp,
  IdCard,
  CheckCircle2,
  X,
} from 'lucide-react';
import { useData } from '../context/DataContext.jsx';
import { sellerColor } from '../lib/constants.js';
import { formatDate, formatDateTime, toDateInput, fromDateInput } from '../lib/format.js';
import { compressImage } from '../lib/image.js';
import { downloadCitaSummary } from '../lib/citaSummary.js';
import Card from '../components/ui/Card.jsx';
import Button from '../components/ui/Button.jsx';
import Modal from '../components/ui/Modal.jsx';
import Checkbox from '../components/ui/Checkbox.jsx';
import Input, { Textarea } from '../components/ui/Input.jsx';
import CopyButton from '../components/ui/CopyButton.jsx';
import Avatar from '../components/ui/Avatar.jsx';

// Period filters for the shared agenda. Week runs Monday–Sunday (es-MX).
const FILTERS = [
  { id: 'hoy', label: 'Hoy' },
  { id: 'semana', label: 'Esta semana' },
  { id: 'mes', label: 'Este mes' },
  { id: 'todas', label: 'Todas' },
  { id: 'atendidas', label: 'Atendidas' },
];

/** [start, end] (ms, inclusive) for a filter id, or null for "todas"/"atendidas". */
function periodRange(filterId) {
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (filterId === 'hoy') {
    return [startOfDay.getTime(), startOfDay.getTime() + 86_399_999];
  }
  if (filterId === 'semana') {
    const dow = (startOfDay.getDay() + 6) % 7; // 0 = Monday
    const monday = startOfDay.getTime() - dow * 86_400_000;
    return [monday, monday + 7 * 86_400_000 - 1];
  }
  if (filterId === 'mes') {
    const first = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1).getTime();
    return [first, nextMonth - 1];
  }
  return null;
}

/** Combine a date input value + optional "HH:MM" into a timestamp (ms). */
function combineDateTime(dateValue, timeValue) {
  const base = fromDateInput(dateValue);
  if (base == null) return null;
  if (!timeValue) return base;
  const [h, m] = timeValue.split(':').map(Number);
  return base + h * 3_600_000 + m * 60_000;
}

const timeOf = (cita) =>
  cita?.hasTime && cita.fechaCita ? new Date(cita.fechaCita).toTimeString().slice(0, 5) : '';

function CitaFormModal({ open, initial, onClose, onSave }) {
  const isEdit = !!initial;
  // Parent remounts this modal via `key` on every open, so initial values seed state.
  const [values, setValues] = useState(() => ({
    clientName: initial?.clientName ?? '',
    phone: initial?.phone ?? '',
    motorcycle: initial?.motorcycle ?? '',
    description: initial?.description ?? '',
    fecha: initial ? toDateInput(initial.fechaCita) : toDateInput(Date.now()),
    hora: timeOf(initial),
    ineImage: initial?.ineImage ?? '',
  }));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [imgBusy, setImgBusy] = useState(false);
  const fileRef = useRef(null);

  const setInput = (key) => (e) => setValues((v) => ({ ...v, [key]: e.target.value }));

  async function handleFile(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setImgBusy(true);
    setError('');
    try {
      const dataUrl = await compressImage(file);
      setValues((v) => ({ ...v, ineImage: dataUrl }));
    } catch (err) {
      setError(err.message || 'No se pudo procesar la imagen.');
    } finally {
      setImgBusy(false);
    }
  }

  async function handleSubmit(e) {
    e?.preventDefault();
    if (!values.clientName.trim() || !values.phone.trim()) {
      return setError('El nombre y el teléfono del cliente son obligatorios.');
    }
    const fechaCita = combineDateTime(values.fecha, values.hora);
    if (fechaCita == null) return setError('La fecha de la cita es obligatoria.');
    setBusy(true);
    setError('');
    try {
      await onSave({
        clientName: values.clientName,
        phone: values.phone,
        motorcycle: values.motorcycle,
        description: values.description,
        fechaCita,
        hasTime: !!values.hora,
        ineImage: values.ineImage,
      });
      onClose();
    } catch (err) {
      setError(err.message || 'No se pudo guardar la cita.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? 'Editar cita' : 'Agendar cita'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="gold" onClick={handleSubmit} disabled={busy || imgBusy}>
            {busy ? 'Guardando…' : isEdit ? 'Guardar cambios' : 'Agendar'}
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input
            label="Nombre del cliente"
            required
            value={values.clientName}
            onChange={setInput('clientName')}
            placeholder="Nombre y apellido"
          />
          <Input
            label="Teléfono del cliente"
            required
            type="tel"
            value={values.phone}
            onChange={setInput('phone')}
            placeholder="844 123 4567"
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input
            label="Fecha de la cita"
            required
            type="date"
            value={values.fecha}
            onChange={setInput('fecha')}
          />
          <Input label="Hora (opcional)" type="time" value={values.hora} onChange={setInput('hora')} />
        </div>

        <Input
          label="Moto(s)"
          value={values.motorcycle}
          onChange={setInput('motorcycle')}
          placeholder="Super sport, SPF 250, B-52…"
        />

        <Textarea
          label="Descripción / intención del cliente"
          value={values.description}
          onChange={setInput('description')}
          placeholder="Qué busca el cliente, motivo de la cita…"
          rows={3}
        />

        {/* INE image (optional) */}
        <div>
          <label className="m-label">INE del cliente (imagen)</label>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFile}
          />
          {values.ineImage ? (
            <div className="flex items-center gap-3">
              <img
                src={values.ineImage}
                alt="INE del cliente"
                className="h-20 w-32 rounded-lg border border-white/10 object-cover"
              />
              <div className="flex flex-col gap-1.5">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => fileRef.current?.click()}
                  disabled={imgBusy}
                >
                  <ImageUp size={14} /> Cambiar
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setValues((v) => ({ ...v, ineImage: '' }))}
                >
                  <X size={14} /> Quitar
                </Button>
              </div>
            </div>
          ) : (
            <Button
              variant="outline"
              size="md"
              onClick={() => fileRef.current?.click()}
              disabled={imgBusy}
            >
              <ImageUp size={16} /> {imgBusy ? 'Procesando…' : 'Subir foto de la INE'}
            </Button>
          )}
        </div>

        {error && <p className="text-sm text-state-danger">{error}</p>}
        <button type="submit" className="hidden" aria-hidden="true" />
      </form>
    </Modal>
  );
}

/** Quick reschedule: only date + time, prefilled with the current values. */
function ReagendarModal({ cita, onClose, onSave }) {
  const [fecha, setFecha] = useState(cita ? toDateInput(cita.fechaCita) : '');
  const [hora, setHora] = useState(timeOf(cita));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function confirm() {
    const fechaCita = combineDateTime(fecha, hora);
    if (fechaCita == null) return setError('La fecha es obligatoria.');
    setBusy(true);
    try {
      await onSave({ fechaCita, hasTime: !!hora });
      onClose();
    } catch (err) {
      setError(err.message || 'No se pudo reagendar.');
      setBusy(false);
    }
  }

  return (
    <Modal
      open={!!cita}
      onClose={onClose}
      title="Reagendar cita"
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="gold" onClick={confirm} disabled={busy}>
            <RefreshCw size={16} /> {busy ? 'Guardando…' : 'Reagendar'}
          </Button>
        </>
      }
    >
      {cita && (
        <div className="space-y-3">
          <p className="text-sm text-ink-muted">
            Nueva fecha para la cita de <span className="font-semibold text-ink">{cita.clientName}</span>.
          </p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input label="Fecha" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
            <Input label="Hora (opcional)" type="time" value={hora} onChange={(e) => setHora(e.target.value)} />
          </div>
          {error && <p className="text-sm text-state-danger">{error}</p>}
        </div>
      )}
    </Modal>
  );
}

/** Prompt for an optional comment when marking a cita as attended. */
function AttendModal({ cita, onClose, onConfirm }) {
  const [nota, setNota] = useState('');
  const [busy, setBusy] = useState(false);

  async function confirm() {
    setBusy(true);
    try {
      await onConfirm(nota.trim());
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={!!cita}
      onClose={onClose}
      title="Marcar cita como atendida"
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="gold" onClick={confirm} disabled={busy}>
            <CheckCircle2 size={16} /> {busy ? 'Guardando…' : 'Cerrar como atendida'}
          </Button>
        </>
      }
    >
      {cita && (
        <div className="space-y-3">
          <p className="text-sm text-ink-muted">
            La cita de <span className="font-semibold text-ink">{cita.clientName}</span> se marcará
            como <span className="text-state-success">Atendida</span> y saldrá de la agenda activa.
          </p>
          <Textarea
            label="Comentario (opcional)"
            value={nota}
            onChange={(e) => setNota(e.target.value)}
            placeholder="Cómo salió la cita, acuerdos, siguiente paso…"
            rows={3}
          />
        </div>
      )}
    </Modal>
  );
}

function CitaRow({ cita, onEdit, onDelete, onToggleAttended, onReagendar }) {
  const { sellerColors, sellerAvatars } = useData();
  const [downloading, setDownloading] = useState(false);
  // A cita counts as past once its day (or exact time) has gone by.
  const cutoff = cita.hasTime ? cita.fechaCita : cita.fechaCita + 86_399_999;
  const isPast = cutoff < Date.now();

  async function handleDownload() {
    setDownloading(true);
    try {
      await downloadCitaSummary(cita);
    } catch (err) {
      alert(err.message || 'No se pudo generar el resumen.');
    } finally {
      setDownloading(false);
    }
  }

  return (
    <Card className={`p-4 ${!cita.atendida && isPast ? 'opacity-60' : ''}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
            <span className="m-chip bg-gold/15 text-gold">
              <CalendarClock size={12} />
              {cita.hasTime ? formatDateTime(cita.fechaCita) : formatDate(cita.fechaCita)}
            </span>
            {cita.atendida && (
              <span className="m-chip bg-state-success/15 text-state-success">
                <CheckCircle2 size={12} /> Atendida
              </span>
            )}
            {cita.ineImage && (
              <span className="m-chip bg-sky2/15 text-sky2-light">
                <IdCard size={12} /> INE
              </span>
            )}
          </div>
          <p className="text-sm font-semibold text-ink">{cita.clientName}</p>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-ink-muted">
            {cita.phone && (
              <span className="flex items-center gap-1">
                <Phone size={11} className="text-sky2" />
                <span className="text-gold">{cita.phone}</span>
                <CopyButton value={cita.phone} label="Copiar teléfono" size={11} />
              </span>
            )}
            {cita.motorcycle && (
              <span className="flex items-center gap-1">
                <Bike size={11} className="text-sky2" /> {cita.motorcycle}
              </span>
            )}
            {cita.createdBy && (
              <span className="flex items-center gap-1">
                <Avatar
                  photo={sellerAvatars[cita.createdBy]}
                  name={cita.createdBy}
                  color={sellerColor(cita.createdBy, sellerColors)}
                  size={18}
                />
                <UserRound size={11} className="text-sky2" /> Agendó: {cita.createdBy}
              </span>
            )}
          </div>
          {cita.description && (
            <p className="mt-2 whitespace-pre-line text-xs italic text-ink-muted">
              {cita.description}
            </p>
          )}
          {cita.atendida && cita.notaAtencion && (
            <p className="mt-2 rounded-lg bg-state-success/10 px-2 py-1.5 text-xs text-ink-muted">
              <span className="font-medium text-state-success">Atención:</span> {cita.notaAtencion}
            </p>
          )}
        </div>

        <div className="flex shrink-0 gap-1">
          <Button variant="ghost" size="icon" onClick={onEdit} aria-label="Editar cita">
            <Pencil size={16} />
          </Button>
          <Button variant="ghost" size="icon" onClick={onDelete} aria-label="Eliminar cita">
            <Trash2 size={16} className="text-state-danger" />
          </Button>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-white/5 pt-3">
        <Checkbox
          checked={!!cita.atendida}
          onChange={onToggleAttended}
          label="Cliente atendido"
          className="text-xs text-ink-muted"
        />
        <div className="ml-auto flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={onReagendar}>
            <RefreshCw size={14} /> Reagendar
          </Button>
          <Button variant="sky" size="sm" onClick={handleDownload} disabled={downloading}>
            <Download size={14} /> {downloading ? 'Generando…' : 'Descargar resumen'}
          </Button>
        </div>
      </div>
    </Card>
  );
}

export default function CitasView() {
  const { citas, createCita, updateCita, deleteCita } = useData();
  const [filter, setFilter] = useState('semana');
  // Custom date range (like Ventas concretadas). When either bound is set it
  // takes over from the period chips; picking a chip clears the range.
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [modal, setModal] = useState({ open: false, initial: null });
  const [attendTarget, setAttendTarget] = useState(null);
  const [reagendarTarget, setReagendarTarget] = useState(null);

  const rangeActive = !!(desde || hasta);
  const showingAttended = !rangeActive && filter === 'atendidas';

  const filtered = useMemo(() => {
    let range = periodRange(filter);
    if (rangeActive) {
      const min = fromDateInput(desde);
      const max = fromDateInput(hasta);
      range = [min ?? -Infinity, max != null ? max + 86_399_999 : Infinity];
    }
    return citas
      .filter((c) => {
        if (filter === 'atendidas' && !rangeActive) return c.atendida;
        // Date periods / range / "Todas" hide attended citas from the active agenda,
        // except "Todas" which shows everything.
        if (filter !== 'todas' && c.atendida) return false;
        return !range || (c.fechaCita >= range[0] && c.fechaCita <= range[1]);
      })
      .sort((a, b) => (a.fechaCita ?? 0) - (b.fechaCita ?? 0));
  }, [citas, filter, desde, hasta, rangeActive]);

  function pickChip(id) {
    setFilter(id);
    setDesde('');
    setHasta('');
  }

  async function handleSave(values) {
    if (modal.initial) await updateCita(modal.initial.id, values);
    else await createCita(values);
  }

  function handleDelete(cita) {
    if (confirm(`¿Eliminar la cita de ${cita.clientName}?`)) deleteCita(cita.id);
  }

  function handleToggleAttended(cita, checked) {
    if (checked) {
      setAttendTarget(cita);
    } else {
      updateCita(cita.id, { atendida: false, notaAtencion: '', fechaAtencion: null });
    }
  }

  return (
    <div className="h-full overflow-y-auto px-4 py-5 sm:px-6">
      <div className="mx-auto max-w-3xl">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-1.5">
            {FILTERS.map((f) => (
              <button
                key={f.id}
                onClick={() => pickChip(f.id)}
                className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                  !rangeActive && filter === f.id
                    ? 'bg-gold/20 text-gold'
                    : 'bg-white/5 text-ink-muted hover:bg-white/10 hover:text-ink'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
          <Button variant="gold" onClick={() => setModal({ open: true, initial: null })}>
            <CalendarPlus size={16} /> Agendar cita
          </Button>
        </div>

        <div className="mb-4 flex flex-wrap items-end gap-3 rounded-2xl border border-white/5 bg-navy-900/40 px-4 py-3">
          <span className="mb-2 flex items-center gap-1.5 text-xs font-medium text-ink-muted">
            <CalendarRange size={14} className="text-sky2" /> Rango de fechas
          </span>
          <Input
            label="Desde"
            type="date"
            value={desde}
            onChange={(e) => setDesde(e.target.value)}
            className="w-40"
          />
          <Input
            label="Hasta"
            type="date"
            value={hasta}
            onChange={(e) => setHasta(e.target.value)}
            className="w-40"
          />
          {rangeActive && (
            <Button
              variant="ghost"
              size="sm"
              className="mb-0.5"
              onClick={() => {
                setDesde('');
                setHasta('');
              }}
            >
              <X size={14} /> Limpiar
            </Button>
          )}
          <span className="mb-2 ml-auto text-xs text-ink-faint">
            {filtered.length} de {citas.length} cita(s)
          </span>
        </div>

        {filtered.length === 0 ? (
          <p className="px-2 py-16 text-center text-sm text-ink-faint">
            No hay citas{' '}
            {rangeActive
              ? 'en este rango de fechas'
              : showingAttended
                ? 'atendidas'
                : filter !== 'todas'
                  ? 'en este periodo'
                  : 'agendadas'}
            .
          </p>
        ) : (
          <div className="space-y-2">
            {filtered.map((cita) => (
              <CitaRow
                key={cita.id}
                cita={cita}
                onEdit={() => setModal({ open: true, initial: cita })}
                onDelete={() => handleDelete(cita)}
                onToggleAttended={(checked) => handleToggleAttended(cita, checked)}
                onReagendar={() => setReagendarTarget(cita)}
              />
            ))}
          </div>
        )}
      </div>

      {/* key forces a fresh form per open, so initial values load correctly */}
      <CitaFormModal
        key={modal.initial?.id ?? String(modal.open)}
        open={modal.open}
        initial={modal.initial}
        onClose={() => setModal({ open: false, initial: null })}
        onSave={handleSave}
      />

      <ReagendarModal
        cita={reagendarTarget}
        onClose={() => setReagendarTarget(null)}
        onSave={(patch) =>
          updateCita(reagendarTarget.id, {
            ...patch,
            atendida: false,
            notaAtencion: '',
            fechaAtencion: null,
          })
        }
      />

      <AttendModal
        cita={attendTarget}
        onClose={() => setAttendTarget(null)}
        onConfirm={(nota) =>
          updateCita(attendTarget.id, {
            atendida: true,
            notaAtencion: nota,
            fechaAtencion: Date.now(),
          })
        }
      />
    </div>
  );
}
