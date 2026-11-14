import { Search, Plus, Bot } from 'lucide-react';
import { VIEW_META } from '../../lib/constants.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { useUI } from '../../context/UIContext.jsx';
import { canAddClient, canUsarBartersito } from '../../lib/permissions.js';
import Button from '../ui/Button.jsx';
import NotificationBell from './NotificationBell.jsx';
import BackupMenu from './BackupMenu.jsx';

export default function TopBar({ section, onOpenSearch }) {
  const { role } = useAuth();
  const { openAddClient, openBartersito } = useUI();
  const meta = VIEW_META[section] ?? { label: 'Mi día', type: 'midia' };
  const showAdd = meta.type === 'board' && canAddClient(role, section);

  return (
    <header className="z-30 flex shrink-0 items-center gap-2 border-b border-white/[0.08] bg-navy-900 px-4 py-2.5 sm:px-5 md:gap-2.5 md:py-3">
      <h2 className="min-w-0 flex-1 truncate font-head text-[19px] font-extrabold text-ink md:text-xl">
        {meta.label}
      </h2>

      {/* Computadora: campo de búsqueda con su atajo. Celular: solo el ícono. */}
      <button
        onClick={onOpenSearch}
        aria-label="Buscar clientes"
        className="flex h-10 items-center gap-2 rounded-[10px] px-2.5 text-sm text-ink-faint transition hover:text-ink-muted md:h-[38px] md:min-w-[240px] md:border md:border-white/[0.08] md:bg-navy-800 md:px-3"
      >
        <Search size={18} className="md:h-4 md:w-4" />
        <span className="hidden whitespace-nowrap md:inline">Buscar cliente o teléfono</span>
        <kbd className="m-kbd ml-auto hidden md:inline">/</kbd>
      </button>

      {/* Bartersito: solo administrador (canUsarBartersito). En celular está en "Más". */}
      {canUsarBartersito(role) && (
        <button
          onClick={openBartersito}
          aria-label="Hablar con Bartersito"
          title="Hablar con Bartersito (tecla B)"
          className="hidden h-[38px] w-[38px] place-items-center rounded-[10px] text-ink-muted transition hover:bg-navy-700 hover:text-ink md:grid"
        >
          <Bot size={20} />
        </button>
      )}

      <NotificationBell />
      {/* En celular Respaldo vive en la hoja "Más". */}
      <div className="hidden md:block">
        <BackupMenu />
      </div>

      {showAdd && (
        <Button variant="gold" size="md" onClick={() => openAddClient(section)} className="hidden md:inline-flex">
          <Plus size={18} />
          Agregar cliente
        </Button>
      )}
    </header>
  );
}
