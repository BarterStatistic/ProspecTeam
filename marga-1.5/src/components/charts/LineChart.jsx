// Multi-series line chart over time. `points` = [{ label, values: [n, …] }]
// (one entry per bucket, already ordered), `series` = [{ label, color }].

const W = 640;
const H = 240;
const PAD = { top: 16, right: 14, bottom: 30, left: 34 };

function niceMax(max) {
  if (max <= 4) return Math.max(1, max);
  const pow = 10 ** Math.floor(Math.log10(max));
  return Math.ceil(max / (pow / 2)) * (pow / 2);
}

export default function LineChart({ points, series, height = H }) {
  const plotW = W - PAD.left - PAD.right;
  const plotH = height - PAD.top - PAD.bottom;
  const top = niceMax(Math.max(1, ...points.flatMap((p) => p.values)));
  const ticks = [...new Set([0, 0.5, 1].map((f) => Math.round(top * f)))];

  const x = (i) => PAD.left + (points.length <= 1 ? plotW / 2 : (i / (points.length - 1)) * plotW);
  const y = (v) => PAD.top + plotH - (v / top) * plotH;

  // Label density: never draw more than ~8 x-axis labels, whatever the bucket.
  const labelStep = Math.max(1, Math.ceil(points.length / 8));

  return (
    <div className="w-full overflow-x-auto">
      <svg
        viewBox={`0 0 ${W} ${height}`}
        className="h-auto w-full min-w-[380px]"
        role="img"
        aria-label="Evolución en el tiempo"
      >
        {ticks.map((t) => (
          <g key={t}>
            <line
              x1={PAD.left}
              x2={W - PAD.right}
              y1={y(t)}
              y2={y(t)}
              stroke="rgba(255,255,255,0.07)"
            />
            <text x={PAD.left - 6} y={y(t) + 4} textAnchor="end" fontSize="10" fill="#64748B">
              {t}
            </text>
          </g>
        ))}

        {series.map((s, si) => {
          const path = points
            .map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.values[si]).toFixed(1)}`)
            .join(' ');
          return (
            <g key={s.label}>
              <path d={path} fill="none" stroke={s.color} strokeWidth="2" strokeLinejoin="round" />
              {points.map((p, i) => (
                <circle key={p.label + i} cx={x(i)} cy={y(p.values[si])} r="2.5" fill={s.color}>
                  <title>{`${p.label} · ${s.label}: ${p.values[si]}`}</title>
                </circle>
              ))}
            </g>
          );
        })}

        {points.map((p, i) =>
          i % labelStep === 0 ? (
            <text
              key={p.label + i}
              x={x(i)}
              y={height - PAD.bottom + 16}
              textAnchor="middle"
              fontSize="9"
              fill="#64748B"
            >
              {p.label}
            </text>
          ) : null,
        )}

        <line
          x1={PAD.left}
          x2={W - PAD.right}
          y1={PAD.top + plotH}
          y2={PAD.top + plotH}
          stroke="rgba(255,255,255,0.15)"
        />
      </svg>
    </div>
  );
}
