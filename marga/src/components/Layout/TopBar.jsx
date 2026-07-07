import { Menu, Search, Plus } from 'lucide-react';
import { SECTIONS } from '../../lib/constants.js';
import { useUI } from '../../context/UIContext.jsx';
import Button from '../ui/Button.jsx';
import BackupMenu from './BackupMenu.jsx';

export default function TopBar({ section, onOpenSidebar, onOpenSearch }) {
  const { openAddClient } = useUI();
  const meta = SECTIONS[section];
  const isBoard = meta.type === 'board';

  return (
    <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-white/5 bg-navy-900/70 px-4 py-3 backdrop-blur-md sm:px-6">
      <button
        onClick={onOpenSidebar}
        className="rounded-lg p-2 text-ink-muted hover:bg-white/5 md:hidden"
        aria-label="Abrir menú"
      >
        <Menu size={20} />
      </button>

      <div className="min-w-0 flex-1">
        <h2 className="truncate text-lg font-bold text-ink">{meta.label}</h2>
      </div>

      <button
        onClick={onOpenSearch}
        className="flex items-center gap-2 rounded-lg border border-white/10 bg-navy-900/50 px-3 py-2 text-sm text-ink-faint transition hover:border-sky2/40 hover:text-ink-muted"
        aria-label="Buscar clientes"
      >
        <Search size={16} />
        <span className="hidden sm:inline">Buscar…</span>
      </button>

      <BackupMenu />

      {isBoard && (
        <Button variant="gold" size="md" onClick={() => openAddClient(section)}>
          <Plus size={18} />
          <span className="hidden sm:inline">Agregar cliente</span>
        </Button>
      )}
    </header>
  );
}
