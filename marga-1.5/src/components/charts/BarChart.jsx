// Grouped vertical bar chart. `groups` = [{ label, color, values: [n, n, …] }],
// `series` = [{ label, color }] describing each bar inside a group.
// Rendered as a plain responsive SVG (viewBox + preserveAspectRatio none is
// avoided so text keeps its aspect ratio; the chart scales via width: 100%).

const W = 640;
const H = 260;
const PAD = { top: 16, right: 12, bottom: 46, left: 34 };

/** Nice-ish upper bound for the value axis, so gridlines land on round numbers. */
function niceMax(max) {
  if (max <= 4) return Math.max(1, max);
  const pow = 10 ** Math.floor(Math.log10(max));
  return Math.ceil(max / (pow / 2)) * (pow / 2);
}

export default function BarChart({ groups, series, height = H }) {
  const plotW = W - PAD.left - PAD.right;
  const plotH = height - PAD.top - PAD.bottom;
  const maxValue = Math.max(1, ...groups.flatMap((g) => g.values));
  const top = niceMax(maxValue);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(top * f));
  const uniqueTicks = [...new Set(ticks)];

  const bandW = plotW / Math.max(1, groups.length);
  const barGap = 4;
  const barW = Math.max(6, (bandW * 0.62 - barGap * (series.length - 1)) / series.length);
  const y = (v) => PAD.top + plotH - (v / top) * plotH;

  return (
    <div className="w-full overflow-x-auto">
      <svg
        viewBox={`0 0 ${W} ${height}`}
        className="h-auto w-full min-w-[380px]"
        role="img"
        aria-label="Gráfica de barras comparativa por vendedor"
      >
        {uniqueTicks.map((t) => (
          <g key={t}>
            <line
              x1={PAD.left}
              x2={W - PAD.right}
              y1={y(t)}
              y2={y(t)}
              stroke="rgba(255,255,255,0.07)"
              strokeWidth="1"
            />
            <text x={PAD.left - 6} y={y(t) + 4} textAnchor="end" fontSize="10" fill="#64748B">
              {t}
            </text>
          </g>
        ))}

        {groups.map((g, gi) => {
          const bandX = PAD.left + gi * bandW;
          const groupW = series.length * barW + (series.length - 1) * barGap;
          const startX = bandX + (bandW - groupW) / 2;
          return (
            <g key={g.label}>
              {g.values.map((v, si) => {
                const x = startX + si * (barW + barGap);
                const barH = Math.max(v > 0 ? 2 : 0, (v / top) * plotH);
                return (
                  <g key={series[si].label}>
                    <rect
                      x={x}
                      y={PAD.top + plotH - barH}
                      width={barW}
                      height={barH}
                      rx="3"
                      fill={si === 0 ? g.color : series[si].color}
                      opacity={si === 0 ? 1 : 0.9}
                    >
                      <title>{`${g.label} · ${series[si].label}: ${v}`}</title>
                    </rect>
                    {v > 0 && (
                      <text
                        x={x + barW / 2}
                        y={PAD.top + plotH - barH - 4}
                        textAnchor="middle"
                        fontSize="9"
                        fill="#94A3B8"
                      >
                        {v}
                      </text>
                    )}
                  </g>
                );
              })}
              {/* Seller name under the group, split so long names stay readable */}
              <text
                x={bandX + bandW / 2}
                y={height - PAD.bottom + 16}
                textAnchor="middle"
                fontSize="10"
                fill="#94A3B8"
              >
                {g.label.split(' ')[0]}
              </text>
              <text
                x={bandX + bandW / 2}
                y={height - PAD.bottom + 28}
                textAnchor="middle"
                fontSize="9"
                fill="#64748B"
              >
                {g.label.split(' ').slice(1).join(' ')}
              </text>
            </g>
          );
        })}

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
