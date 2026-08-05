import { useRef, useState } from 'react';
import { ImageUp, Trash2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.jsx';
import { useData } from '../../context/DataContext.jsx';
import { compressAvatar } from '../../lib/image.js';
import { ROLE_LABELS, userColor } from '../../lib/constants.js';
import Modal from '../ui/Modal.jsx';
import Button from '../ui/Button.jsx';
import Avatar from '../ui/Avatar.jsx';

/**
 * Own-profile sheet, opened from the session block in the sidebar. Any role can
 * set or clear their own picture here; the username and role are read-only —
 * only an admin changes those, from "Gestor de usuarios".
 */
export default function ProfileModal({ open, onClose }) {
  const { user, role } = useAuth();
  const { myProfile, updateOwnPhoto } = useData();
  const fileRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // myProfile is the live record; fall back to the session while the users
  // mirror is still loading, so the modal always has a name to show.
  const profile = myProfile ?? user;
  const photo = profile?.photo ?? '';
  const color = userColor(profile);

  async function handleFile(e) {
    const file = e.target.files?.[0];
    // Reset first: picking the same file twice must re-fire onChange.
    e.target.value = '';
    if (!file) return;
    setBusy(true);
    setError('');
    try {
      await updateOwnPhoto(await compressAvatar(file));
    } catch (err) {
      setError(err.message || 'No se pudo guardar la foto.');
    } finally {
      setBusy(false);
    }
  }

  async function handleRemove() {
    setBusy(true);
    setError('');
    try {
      await updateOwnPhoto('');
    } catch (err) {
      setError(err.message || 'No se pudo quitar la foto.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Mi perfil" size="sm">
      <div className="flex flex-col items-center gap-3 py-2">
        <Avatar photo={photo} name={profile?.username} color={color} size={112} fallback="icon" />

        <div className="text-center">
          <p className="text-lg font-semibold text-ink">{profile?.username}</p>
          <span
            className={`m-chip mt-1 ${
              role === 'admin' ? 'bg-gold/15 text-gold' : 'bg-sky2/15 text-sky2-light'
            }`}
          >
            {ROLE_LABELS[role] ?? role}
          </span>
        </div>

        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFile}
        />

        <div className="mt-1 flex flex-wrap justify-center gap-2">
          <Button variant="gold" onClick={() => fileRef.current?.click()} disabled={busy}>
            <ImageUp size={16} />
            {busy ? 'Guardando…' : photo ? 'Cambiar foto' : 'Subir foto'}
          </Button>
          {photo && (
            <Button variant="ghost" onClick={handleRemove} disabled={busy}>
              <Trash2 size={16} className="text-state-danger" /> Quitar foto
            </Button>
          )}
        </div>

        {error && <p className="text-center text-sm text-state-danger">{error}</p>}

        <p className="mt-1 text-center text-[11px] text-ink-faint">
          Tu foto aparece junto a los clientes que registras. El nombre y el rol solo los
          cambia un administrador.
        </p>
      </div>
    </Modal>
  );
}
