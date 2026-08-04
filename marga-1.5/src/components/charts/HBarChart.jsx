// Horizontal bars with the label alongside — used for the stage funnel, where
// column names are long and a vertical axis would be unreadable.
// `rows` = [{ label, value, color, hint }].

export default function HBarChart({ rows, emptyText = 'Sin datos.' }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  if (rows.every((r) => r.value === 0)) {
    return <p className="py-6 text-center text-xs text-ink-faint">{emptyText}</p>;
  }

  return (
    <ul className="space-y-2">
      {rows.map((r) => (
        <li key={r.label} className="flex items-center gap-3">
          <span className="w-40 shrink-0 truncate text-xs text-ink-muted" title={r.label}>
            {r.label}
          </span>
          <span className="h-3 min-w-0 flex-1 overflow-hidden rounded-full bg-white/5">
            <span
              className="block h-full rounded-full transition-all"
              style={{ width: `${(r.value / max) * 100}%`, backgroundColor: r.color }}
            />
          </span>
          <span className="w-8 shrink-0 text-right text-xs font-semibold text-ink">{r.value}</span>
        </li>
      ))}
    </ul>
  );
}
