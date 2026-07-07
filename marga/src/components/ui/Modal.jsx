import { useEffect } from 'react';
import { X } from 'lucide-react';

const WIDTHS = {
  sm: 'max-w-sm',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
};

export default function Modal({ open, onClose, title, size = 'md', children, footer }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === 'Escape' && onClose?.();
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-navy-900/70 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`m-glass w-full ${WIDTHS[size]} animate-fadeIn rounded-t-2xl sm:rounded-2xl
          max-h-[92vh] overflow-hidden flex flex-col`}
      >
        <div className="flex items-center justify-between border-b border-white/5 px-5 py-4">
          <h2 className="text-lg font-semibold text-ink">{title}</h2>
          <button
            onClick={onClose}
            aria-label="Cerrar"
            className="rounded-lg p-1.5 text-ink-muted transition hover:bg-white/5 hover:text-ink"
          >
            <X size={20} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && (
          <div className="flex items-center justify-end gap-2 border-t border-white/5 px-5 py-4">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
