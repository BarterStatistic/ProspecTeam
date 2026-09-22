import { useEffect, useMemo, useState } from 'react';
import { useData } from '../../context/DataContext.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { canAssignPromotor } from '../../lib/permissions.js';
import { emptyClient, findDuplicate } from '../../lib/clients.js';
import { normalizarEsquema } from '../../lib/motos.js';
import { SALE_TYPES, CREDIT_SCHEMES } from '../../lib/constants.js';
import Modal from '../ui/Modal.jsx';
import Button from '../ui/Button.jsx';
import Input, { Textarea } from '../ui/Input.jsx';
import Select from '../ui/Select.jsx';
import Checkbox from '../ui/Checkbox.jsx';
import MotoPicker from '../ui/MotoPicker.jsx';
import DuplicateWarningModal from './DuplicateWarningModal.jsx';

// Only these fields are user-editable; section/stage/order/timestamps are managed
// by the data layer.
const EDITABLE = [
  'firstName',
  'lastName',
  'phone',
  'saleType',
  'creditScheme',
  'motorcycles',
  'prospectTeamSeller',
  'promotorEncargado',
  'notes',
  'buroAutorizado',
];

function pickEditable(values) {
  return EDITABLE.reduce((acc, k) => ({ ...acc, [k]: values[k] }), {});
}

export default function ClientFormModal({ open, initial, onClose }) {
  const { clients, createClient, updateClient, promotorUsernames } = useData();
  const { role } = useAuth();
  const [values, setValues] = useState(emptyClient());
  const [error, setError] = useState('');
  const [dupMatch, setDupMatch] = useState(null);

  const isEdit = !!initial?.id;

  // "Promotor encargado" only applies to the Procesos board.
  const showPromotor = values.section === 'procesos' && canAssignPromotor(role);

  // Keep a stored name that no longer matches a promotor account (renamed or
  // deleted user) in the list, so opening the form doesn't silently clear it.
  const promotorOptions = useMemo(() => {
    const current = values.promotorEncargado;
    if (current && !promotorUsernames.includes(current)) {
      return [...promotorUsernames, current];
    }
    return promotorUsernames;
  }, [promotorUsernames, values.promotorEncargado]);

  useEffect(() => {
    if (open) {
      const base = initial ?? emptyClient();
      setValues({ ...base, creditScheme: normalizarEsquema(base.creditScheme ?? '') });
      setError('');
      setDupMatch(null);
    }
  }, [open, initial]);

  const set = (key) => (val) => setValues((v) => ({ ...v, [key]: val }));
  const setInput = (key) => (e) => setValues((v) => ({ ...v, [key]: e.target.value }));

  function validate() {
    if (!values.firstName?.trim() || !values.lastName?.trim() || !values.phone?.trim()) {
      setError('Nombre(s), apellidos y teléfono son obligatorios.');
      return false;
    }
    setError('');
    return true;
  }

  function handleSubmit(e) {
    e.preventDefault();
    if (!validate()) return;
    // Duplicate check only on new clients (exclude self on edit is implicit).
    if (!isEdit) {
      const match = findDuplicate(clients, values);
      if (match) {
        setDupMatch(match);
        return;
      }
    }
    save();
  }

  async function save() {
    if (isEdit) {
      await updateClient(initial.id, pickEditable(values));
    } else {
      await createClient(values);
    }
    onClose();
  }

  return (
    <>
      <Modal
        open={open && !dupMatch}
        onClose={onClose}
        title={isEdit ? 'Editar cliente' : 'Agregar cliente'}
        footer={
          <>
            <Button variant="ghost" onClick={onClose}>
              Cancelar
            </Button>
            <Button variant="gold" onClick={handleSubmit}>
              {isEdit ? 'Guardar cambios' : 'Agregar'}
            </Button>
          </>
        }
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input
              label="Nombre(s)"
              required
              value={values.firstName}
              onChange={setInput('firstName')}
              placeholder="Juan"
            />
            <Input
              label="Apellidos"
              required
              value={values.lastName}
              onChange={setInput('lastName')}
              placeholder="Pérez López"
            />
          </div>

          <Input
            label="Número de teléfono"
            required
            type="tel"
            value={values.phone}
            onChange={setInput('phone')}
            placeholder="844 123 4567"
          />

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Select
              label="Tipo de venta"
              options={SALE_TYPES}
              value={values.saleType}
              onChange={setInput('saleType')}
              placeholder="Opcional"
            />
            <Select
              label="Esquema de crédito"
              options={CREDIT_SCHEMES}
              value={values.creditScheme}
              onChange={setInput('creditScheme')}
              placeholder="Opcional"
            />
          </div>

          <MotoPicker value={values.motorcycles ?? ''} onChange={set('motorcycles')} />

          <Input
            label="Vendedor Prospect Team"
            value={values.prospectTeamSeller ?? ''}
            onChange={setInput('prospectTeamSeller')}
            placeholder="Opcional"
          />

          {showPromotor && (
            <div>
              <Select
                label="Promotor encargado"
                options={promotorOptions}
                value={values.promotorEncargado ?? ''}
                onChange={setInput('promotorEncargado')}
                placeholder="Sin asignar"
              />
              {promotorOptions.length === 0 && (
                <p className="mt-1 text-[11px] text-ink-faint">
                  Aún no hay usuarios con rol Promotor. Créalos en el Gestor de usuarios.
                </p>
              )}
            </div>
          )}

          <Textarea
            label="Notas"
            value={values.notes}
            onChange={setInput('notes')}
            placeholder="Comentarios, seguimiento, detalles…"
          />

          <Checkbox
            checked={!!values.buroAutorizado}
            onChange={set('buroAutorizado')}
            label="Buró de crédito autorizado"
          />

          {error && <p className="text-sm text-state-danger">{error}</p>}

          {/* Hidden submit so Enter submits the form */}
          <button type="submit" className="hidden" aria-hidden="true" />
        </form>
      </Modal>

      <DuplicateWarningModal
        match={dupMatch}
        onCancel={() => setDupMatch(null)}
        onConfirm={() => {
          setDupMatch(null);
          save();
        }}
      />
    </>
  );
}
