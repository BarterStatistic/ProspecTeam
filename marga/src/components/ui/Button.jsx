const VARIANTS = {
  gold: 'bg-gold text-navy-900 hover:bg-gold-light font-semibold shadow-card',
  sky: 'bg-sky2 text-navy-900 hover:bg-sky2-light font-semibold',
  outline: 'border border-white/15 text-ink hover:bg-white/5',
  ghost: 'text-ink-muted hover:text-ink hover:bg-white/5',
  danger: 'bg-state-danger/90 text-white hover:bg-state-danger font-medium',
};

const SIZES = {
  sm: 'px-2.5 py-1.5 text-xs',
  md: 'px-4 py-2 text-sm',
  lg: 'px-5 py-2.5 text-base',
  icon: 'p-2',
};

export default function Button({
  variant = 'outline',
  size = 'md',
  className = '',
  type = 'button',
  children,
  ...props
}) {
  return (
    <button
      type={type}
      className={`inline-flex items-center justify-center gap-2 rounded-lg transition
        disabled:opacity-50 disabled:pointer-events-none
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky2/50
        ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
