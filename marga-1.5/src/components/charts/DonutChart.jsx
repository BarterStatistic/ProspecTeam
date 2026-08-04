// Donut chart. `slices` = [{ label, value, color }]. Renders arcs with the SVG
// path A command; a single non-zero slice becomes a full ring (an arc of exactly
// 360° collapses to a point, so that case is special-cased).

const SIZE = 200;
const R = 80;
const THICK = 26;
const C = SIZE / 2;

function arcPath(startAngle, endAngle) {
  const outer = R;
  const inner = R - THICK;
  const p = (angle, radius) => [
    C + radius * Math.cos(angle - Math.PI / 2),
    C + radius * Math.sin(angle - Math.PI / 2),
  ];
  const [x1, y1] = p(startAngle, outer);
  const [x2, y2] = p(endAngle, outer);
  const [x3, y3] = p(endAngle, inner);
  const [x4, y4] = p(startAngle, inner);
  const large = endAngle - startAngle > Math.PI ? 1 : 0;
  return `M${x1},${y1} A${outer},${outer} 0 ${large} 1 ${x2},${y2} L${x3},${y3} A${inner},${inner} 0 ${large} 0 ${x4},${y4} Z`;
}

export default function DonutChart({ slices, centerLabel, centerValue }) {
  const data = slices.filter((s) => s.value > 0);
  const total = data.reduce((acc, s) => acc + s.value, 0);

  let angle = 0;

  return (
    <div className="flex flex-wrap items-center justify-center gap-6">
      <svg
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        className="h-44 w-44 shrink-0"
        role="img"
        aria-label="Reparto por vendedor"
      >
        {total === 0 && (
          <circle cx={C} cy={C} r={R - THICK / 2} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth={THICK} />
        )}
        {data.length === 1 ? (
          <circle
            cx={C}
            cy={C}
            r={R - THICK / 2}
            fill="none"
            stroke={data[0].color}
            strokeWidth={THICK}
          >
            <title>{`${data[0].label}: ${data[0].value}`}</title>
          </circle>
        ) : (
          data.map((s) => {
            const start = angle;
            const end = start + (s.value / total) * Math.PI * 2;
            angle = end;
            return (
              <path key={s.label} d={arcPath(start, end)} fill={s.color}>
                <title>{`${s.label}: ${s.value} (${Math.round((s.value / total) * 100)}%)`}</title>
              </path>
            );
          })
        )}
        <text x={C} y={C - 2} textAnchor="middle" fontSize="26" fontWeight="700" fill="#F8FAFC">
          {centerValue ?? total}
        </text>
        <text x={C} y={C + 16} textAnchor="middle" fontSize="10" fill="#64748B">
          {centerLabel}
        </text>
      </svg>

      <ul className="space-y-1.5 text-xs">
        {slices.map((s) => (
          <li key={s.label} className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: s.color }} />
            <span className="text-ink-muted">{s.label}</span>
            <span className="font-semibold text-ink">{s.value}</span>
            {total > 0 && (
              <span className="text-ink-faint">({Math.round((s.value / total) * 100)}%)</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
