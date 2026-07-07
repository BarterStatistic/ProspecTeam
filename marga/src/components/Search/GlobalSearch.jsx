import { useEffect, useMemo, useState } from 'react';
import { Search, Phone } from 'lucide-react';
import { useData } from '../../context/DataContext.jsx';
import { useUI } from '../../context/UIContext.jsx';
import { fullName, normalizeName, normalizePhone } from '../../lib/clients.js';
import { SECTIONS, stageLabel } from '../../lib/constants.js';

export default function GlobalSearch({ open, onClose }) {
  const { clients } = useData();
  const { openEditClient, goToSection } = useUI();
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (open) setQuery('');
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const results = useMemo(() => {
    const q = normalizeName(query);
    const digits = normalizePhone(query);
    if (!query.trim()) return [];
    return clients
      .filter((c) => {
        const name = normalizeName(fullName(c));
        const moto = normalizeName(c.motorcycles || '');
        return (
          (q && (name.includes(q) || moto.includes(q))) ||
          (digits && normalizePhone(c.phone).includes(digits))
        );
      })
      .slice(0, 40);
  }, [clients, query]);

  if (!open) return null;

  function pick(client) {
    goToSection(client.section);
    openEditClient(client);
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-navy-900/70 px-4 pt-[12vh] backdrop-blur-sm"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="mx-auto w-full max-w-xl animate-fadeIn overflow-hidden rounded-2xl border border-white/10 bg-navy-800 shadow-card">
        <div className="flex items-center gap-3 border-b border-white/5 px-4 py-3">
          <Search size={18} className="text-ink-faint" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por nombre, apellidos, teléfono o moto…"
            className="w-full bg-transparent text-sm text-ink outline-none placeholder:text-ink-faint"
          />
        </div>

        <div className="max-h-[55vh] overflow-y-auto">
          {query.trim() && results.length === 0 && (
            <p className="px-4 py-8 text-center text-sm text-ink-faint">Sin resultados.</p>
          )}
          {results.map((c) => (
            <button
              key={c.id}
              onClick={() => pick(c)}
              className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-white/5"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-ink">{fullName(c)}</p>
                {c.phone && (
                  <span className="flex items-center gap-1 text-xs text-gold">
                    <Phone size={11} /> {c.phone}
                  </span>
                )}
              </div>
              <span className="m-chip shrink-0 bg-white/5 text-ink-muted">
                {SECTIONS[c.section]?.label}
                {c.stage ? ` · ${stageLabel(c.section, c.stage)}` : ''}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
