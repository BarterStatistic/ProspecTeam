import { useEffect, useState } from 'react';
import { useData } from '../../context/DataContext.jsx';
import { emptyClient, findDuplicate } from '../../lib/clients.js';
import { SALE_TYPES, CREDIT_SCHEMES } from '../../lib/constants.js';
import Modal from '../ui/Modal.jsx';
import Button from '../ui/Button.jsx';
import Input, { Textarea } from '../ui/Input.jsx';
import Select from '../ui/Select.jsx';
import Checkbox from '../ui/Checkbox.jsx';
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
  'notes',
  'buroAutorizado',
];

function pickEditable(values) {
  return EDITABLE.reduce((acc, k) => ({ ...acc, [k]: values[k] }), {});
}

export default function ClientFormModal({ open, initial, onClose }) {
  const { clients, createClient, updateClient } = useData();
  const [values, setValues] = useState(emptyClient());
  const [error, setError] = useState('');
  const [dupMatch, setDupMatch] = useState(null);

  const isEdit = !!initial?.id;

  useEffect(() => {
    if (open) {
      setValues(initial ?? emptyClient());
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

          <Input
            label="Moto(s)"
            value={values.motorcycles}
            onChange={setInput('motorcycles')}
            placeholder="Super sport, SPF 250, B-52…"
          />

          <Input
            label="Vendedor Prospect Team"
            value={values.prospectTeamSeller ?? ''}
            onChange={setInput('prospectTeamSeller')}
            placeholder="Opcional"
          />

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
