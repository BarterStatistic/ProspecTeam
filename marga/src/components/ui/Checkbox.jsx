import { Check } from 'lucide-react';

export default function Checkbox({ checked, onChange, label, className = '', ...props }) {
  return (
    <label
      className={`inline-flex cursor-pointer select-none items-center gap-2 text-sm ${className}`}
    >
      <span
        className={`flex h-5 w-5 items-center justify-center rounded-md border transition
          ${checked ? 'border-gold bg-gold text-navy-900' : 'border-white/20 bg-navy-900/60 text-transparent'}`}
      >
        <Check size={14} strokeWidth={3} />
      </span>
      <input
        type="checkbox"
        className="sr-only"
        checked={checked}
        onChange={(e) => onChange?.(e.target.checked)}
        {...props}
      />
      {label && <span className="text-ink">{label}</span>}
    </label>
  );
}
