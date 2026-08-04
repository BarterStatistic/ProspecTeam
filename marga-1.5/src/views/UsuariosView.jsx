import { useMemo, useState } from 'react';
import { UserPlus, Pencil, Trash2, ShieldCheck, UserRound } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { useData } from '../context/DataContext.jsx';
import { canManageUsers } from '../lib/permissions.js';
import { ROLES, ROLE_LABELS, COLOR_PALETTE, userColor } from '../lib/constants.js';
import { formatDateTime } from '../lib/format.js';
import Card from '../components/ui/Card.jsx';
import Button from '../components/ui/Button.jsx';
import Modal from '../components/ui/Modal.jsx';
import Input from '../components/ui/Input.jsx';

/** Swatch grid for the vendedor's accent colour. */
function ColorPicker({ value, onChange }) {
  return (
    <div>
      <label className="m-label">Color característico</label>
      <div className="flex flex-wrap gap-2">
        {COLOR_PALETTE.map((hex) => {
          const selected = value?.toLowerCase() === hex.toLowerCase();
          return (
            <button
              key={hex}
              type="button"
              onClick={() => onChange(hex)}
              aria-label={`Usar el color ${hex}`}
              aria-pressed={selected}
              className={`h-8 w-8 rounded-full transition hover:scale-110 ${
                selected ? 'ring-2 ring-ink ring-offset-2 ring-offset-navy-800' : 'ring-1 ring-white/10'
              }`}
              style={{ backgroundColor: hex }}
            />
          );
        })}
      </div>
      <p className="mt-2 text-[11px] text-ink-faint">
        Tiñe las tarjetas que registra este usuario, el filtro por vendedor y las gráficas del
        Panel ADMIN.
      </p>
    </div>
  );
}

function UserFormModal({ open, initial, onClose, onSave }) {
  const isEdit = !!initial;
  // The parent remounts this modal via `key` on every open, so initial values
  // can seed state directly.
  const [username, setUsername] = useState(initial?.username ?? '');
  const [role, setRole] = useState(initial?.role ?? ROLES.VENDEDOR);
  // Seed with the colour already in use (stored or name-based) so opening the
  // form doesn't silently reset an existing accent.
  const [color, setColor] = useState(initial ? userColor(initial) : COLOR_PALETTE[0]);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e) {
    e?.preventDefault();
    const name = username.trim();
    if (!name) return setError('El nombre de usuario es obligatorio.');
    if (!isEdit && password.length < 6)
      return setError('La contraseña debe tener al menos 6 caracteres.');
    if (isEdit && password && password.length < 6)
      return setError('La nueva contraseña debe tener al menos 6 caracteres.');
    setBusy(true);
    setError('');
    try {
      await onSave({ username: name, role, password, color });
      onClose();
    } catch (err) {
      setError(err.message || 'No se pudo guardar el usuario.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? 'Editar usuario' : 'Agregar usuario'}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="gold" onClick={handleSubmit} disabled={busy}>
            {busy ? 'Guardando…' : isEdit ? 'Guardar cambios' : 'Agregar'}
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          label="Nombre de usuario"
          required
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="Nombre y apellido"
        />

        <div>
          <label className="m-label" htmlFor="user-role">
            Rol
          </label>
          <select
            id="user-role"
            className="m-input appearance-none pr-8"
            value={role}
            onChange={(e) => setRole(e.target.value)}
          >
            <option value={ROLES.VENDEDOR}>{ROLE_LABELS.vendedor}</option>
            <option value={ROLES.ADMIN}>{ROLE_LABELS.admin}</option>
          </select>
        </div>

        <ColorPicker value={color} onChange={setColor} />

        <Input
          label={isEdit ? 'Nueva contraseña' : 'Contraseña'}
          required={!isEdit}
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder={isEdit ? 'Dejar en blanco para no cambiarla' : 'Mínimo 6 caracteres'}
          autoComplete="new-password"
        />

        {error && <p className="text-sm text-state-danger">{error}</p>}
        <button type="submit" className="hidden" aria-hidden="true" />
      </form>
    </Modal>
  );
}

export default function UsuariosView() {
  const { user, role } = useAuth();
  const { users, addUser, editUser, deleteUser } = useData();
  const [modal, setModal] = useState({ open: false, initial: null });
  const [error, setError] = useState('');

  const sorted = useMemo(
    () =>
      [...users].sort(
        (a, b) => (a.role === b.role ? a.username.localeCompare(b.username) : a.role === 'admin' ? -1 : 1),
      ),
    [users],
  );

  if (!canManageUsers(role)) {
    return (
      <p className="px-2 py-16 text-center text-sm text-ink-faint">
        Solo los administradores pueden gestionar usuarios.
      </p>
    );
  }

  const adminCount = users.filter((u) => u.role === ROLES.ADMIN).length;

  function guardDelete(target) {
    if (target.id === user.id) return 'No puedes eliminar tu propia cuenta.';
    if (target.role === ROLES.ADMIN && adminCount <= 1)
      return 'Debe existir al menos un administrador.';
    return null;
  }

  async function handleDelete(target) {
    const blocked = guardDelete(target);
    if (blocked) return setError(blocked);
    if (!confirm(`¿Eliminar al usuario ${target.username}?`)) return;
    setError('');
    await deleteUser(target.id);
  }

  async function handleSave(values) {
    if (modal.initial) {
      // Demoting the last admin would lock everyone out of this view.
      if (
        modal.initial.role === ROLES.ADMIN &&
        values.role !== ROLES.ADMIN &&
        adminCount <= 1
      ) {
        throw new Error('Debe existir al menos un administrador.');
      }
      await editUser(modal.initial.id, values);
    } else {
      await addUser(values);
    }
  }

  return (
    <div className="h-full overflow-y-auto px-4 py-5 sm:px-6">
      <div className="mx-auto max-w-3xl">
        <div className="mb-4 flex items-center justify-between gap-3">
          <p className="text-sm text-ink-muted">
            Cuentas con acceso a Marga. Los cambios se aplican de inmediato en todos los
            dispositivos.
          </p>
          <Button variant="gold" onClick={() => setModal({ open: true, initial: null })}>
            <UserPlus size={16} /> Agregar usuario
          </Button>
        </div>

        {error && (
          <p className="mb-3 rounded-lg bg-state-danger/10 px-3 py-2 text-sm text-state-danger">
            {error}
          </p>
        )}

        <div className="space-y-2">
          {sorted.map((u) => {
            const color = userColor(u);
            return (
            <Card key={u.id} className="flex items-center gap-3 p-4">
              {/* Avatar tinted with the user's accent colour — the same one that
                  marks the cards they register. */}
              <span
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
                style={{ backgroundColor: `${color}26`, color }}
              >
                {u.role === ROLES.ADMIN ? <ShieldCheck size={18} /> : <UserRound size={18} />}
              </span>

              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-ink">
                  {u.username}
                  {u.id === user.id && <span className="ml-2 text-xs text-ink-faint">(tú)</span>}
                </p>
                <p className="flex items-center gap-1.5 text-xs text-ink-faint">
                  <span className={u.role === ROLES.ADMIN ? 'text-gold' : 'text-sky2-light'}>
                    {ROLE_LABELS[u.role] ?? u.role}
                  </span>
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: color }} />
                  {u.createdAt ? `· desde ${formatDateTime(u.createdAt)}` : ''}
                </p>
              </div>

              <Button
                variant="ghost"
                size="icon"
                onClick={() => setModal({ open: true, initial: u })}
                aria-label={`Editar a ${u.username}`}
              >
                <Pencil size={16} />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => handleDelete(u)}
                aria-label={`Eliminar a ${u.username}`}
              >
                <Trash2 size={16} className="text-state-danger" />
              </Button>
            </Card>
            );
          })}
        </div>
      </div>

      {/* key forces a fresh form per open, so initial values load correctly */}
      <UserFormModal
        key={modal.initial?.id ?? String(modal.open)}
        open={modal.open}
        initial={modal.initial}
        onClose={() => setModal({ open: false, initial: null })}
        onSave={handleSave}
      />
    </div>
  );
}
