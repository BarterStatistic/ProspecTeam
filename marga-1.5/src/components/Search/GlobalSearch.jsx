import { useEffect, useMemo, useState } from 'react';
import { Search, Phone } from 'lucide-react';
import { useData } from '../../context/DataContext.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useUI } from '../../context/UIContext.jsx';
import { canEditClient, visibleSections } from '../../lib/permissions.js';
import { fullName, normalizeName, normalizePhone } from '../../lib/clients.js';
import { SECTIONS, stageLabel } from '../../lib/constants.js';
import CopyButton from '../ui/CopyButton.jsx';

export default function GlobalSearch({ open, onClose }) {
  const { clients } = useData();
  const { user, role } = useAuth();
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
    // Only surface clients in sections this role can open.
    const sections = visibleSections(role);
    return clients
      .filter((c) => sections.includes(c.section))
      .filter((c) => {
        const name = normalizeName(fullName(c));
        const moto = normalizeName(c.motorcycles || '');
        return (
          (q && (name.includes(q) || moto.includes(q))) ||
          (digits && normalizePhone(c.phone).includes(digits))
        );
      })
      .slice(0, 40);
  }, [clients, query, role]);

  if (!open) return null;

  function pick(client) {
    goToSection(client.section);
    // Read-only records just navigate to their section; the card/row shows the details.
    if (canEditClient(role, client, user?.username)) openEditClient(client);
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
          {/* The row opens the client, but "copiar teléfono" must stay its own
              button — so the row action is an absolute overlay and the copy
              control opts back into pointer events above it. */}
          {results.map((c) => (
            <div
              key={c.id}
              className="relative flex w-full items-center gap-3 px-4 py-3 transition hover:bg-white/5"
            >
              <button
                onClick={() => pick(c)}
                aria-label={`Abrir ${fullName(c)}`}
                className="absolute inset-0"
              />
              <div className="pointer-events-none relative min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-ink">{fullName(c)}</p>
                {c.phone && (
                  <span className="flex items-center gap-1 text-xs text-gold">
                    <Phone size={11} /> {c.phone}
                    <CopyButton
                      value={c.phone}
                      label="Copiar teléfono"
                      size={11}
                      className="pointer-events-auto"
                    />
                  </span>
                )}
              </div>
              <span className="m-chip pointer-events-none relative shrink-0 bg-white/5 text-ink-muted">
                {SECTIONS[c.section]?.label}
                {c.stage ? ` · ${stageLabel(c.section, c.stage)}` : ''}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
