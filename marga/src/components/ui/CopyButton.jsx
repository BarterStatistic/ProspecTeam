import { useEffect, useRef, useState } from 'react';
import { Copy, Check } from 'lucide-react';

/**
 * Copies `value` to the device clipboard. The async Clipboard API only exists
 * in secure contexts (https / localhost); on http or older mobile browsers it
 * is undefined, so fall back to a hidden textarea + execCommand('copy').
 */
async function copyToClipboard(value) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(value);
      return true;
    } catch {
      // Permission denied or non-secure context — fall through to the legacy path.
    }
  }
  const ta = document.createElement('textarea');
  ta.value = value;
  ta.setAttribute('readonly', '');
  // Keep it off-screen but focusable, otherwise iOS refuses to select it.
  ta.style.cssText = 'position:fixed;top:0;left:-9999px;opacity:0';
  document.body.appendChild(ta);
  ta.select();
  ta.setSelectionRange(0, ta.value.length);
  let ok = false;
  try {
    ok = document.execCommand('copy');
  } catch {
    ok = false;
  }
  document.body.removeChild(ta);
  return ok;
}

/**
 * Small icon button that copies `value` and confirms with a check mark for a
 * moment. Used next to phone numbers across the app.
 */
export default function CopyButton({
  value,
  label = 'Copiar',
  size = 12,
  className = '',
  ...props
}) {
  const [state, setState] = useState('idle'); // idle | done | error
  const timer = useRef(null);

  useEffect(() => () => clearTimeout(timer.current), []);

  async function handleClick(e) {
    // Inside cards/rows this button sits within clickable parents; never let the
    // click bubble into "open the client" or a drag sensor.
    e.preventDefault();
    e.stopPropagation();
    if (!value) return;
    const ok = await copyToClipboard(String(value));
    setState(ok ? 'done' : 'error');
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setState('idle'), 1500);
  }

  const done = state === 'done';
  const failed = state === 'error';

  return (
    <button
      type="button"
      onClick={handleClick}
      title={done ? 'Copiado' : failed ? 'No se pudo copiar' : `${label}: ${value}`}
      aria-label={done ? 'Copiado' : `${label} ${value}`}
      className={`inline-flex shrink-0 items-center justify-center rounded-md p-1 transition
        ${done ? 'text-state-success' : failed ? 'text-state-danger' : 'text-ink-faint hover:bg-white/10 hover:text-sky2'}
        ${className}`}
      {...props}
    >
      {done ? <Check size={size} /> : <Copy size={size} />}
    </button>
  );
}
