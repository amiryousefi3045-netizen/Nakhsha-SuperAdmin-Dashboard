/**
 * Dependency-free SVG charts for the admin dashboard.
 * Renders server-side-safe; no charting library required.
 */

const PRIMARY = "#1a5f7a";
const MUTED = "#c7ccd8";
const PALETTE = ["#1a5f7a", "#d9a441", "#8b9dc3", "#4caf7d", "#e0756d", "#7c6bb0"];

export interface LinePoint {
  label: string;
  value: number;
}

export function MiniLineChart({
  data,
  height = 160,
  color = PRIMARY,
}: {
  data: LinePoint[];
  height?: number;
  color?: string;
}) {
  if (data.length === 0) {
    return <div className="flex h-40 items-center justify-center text-sm text-[var(--color-muted)]">داده‌ای نیست</div>;
  }

  const width = 600;
  const padX = 10;
  const padTop = 12;
  const padBottom = 22;
  const plotW = width - padX * 2;
  const plotH = height - padTop - padBottom;

  const max = Math.max(...data.map((d) => d.value), 1);
  const stepX = data.length > 1 ? plotW / (data.length - 1) : 0;

  const points = data.map((d, i) => ({
    x: padX + i * stepX,
    y: padTop + plotH - (d.value / max) * plotH,
    d,
  }));

  const line = points.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const area = `${padX},${(padTop + plotH).toFixed(1)} ${line} ${points.length ? `${points[points.length - 1].x.toFixed(1)},${(padTop + plotH).toFixed(1)}` : ""}`;

  const labelEvery = Math.max(1, Math.ceil(data.length / 8));

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="w-full"
      role="img"
      aria-label="نمودار روند"
      preserveAspectRatio="none"
    >
      <defs>
        <linearGradient id="lineFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.25" />
          <stop offset="100%" stopColor={color} stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <line x1={padX} y1={padTop + plotH} x2={width - padX} y2={padTop + plotH} stroke={MUTED} strokeWidth="1" />
      <polygon points={area} fill="url(#lineFill)" />
      <polyline points={line} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      {points.map((p, i) => (
        <g key={i}>
          {i % labelEvery === 0 ? (
            <text
              x={p.x}
              y={height - 6}
              textAnchor="middle"
              fontSize="9"
              fill={MUTED}
            >
              {p.d.label}
            </text>
          ) : null}
          <circle cx={p.x} cy={p.y} r="2.5" fill={color} />
        </g>
      ))}
    </svg>
  );
}

export interface DonutSlice {
  label: string;
  value: number;
  color?: string;
}

export function DonutChart({ data, size = 200 }: { data: DonutSlice[]; size?: number }) {
  const total = data.reduce((sum, d) => sum + d.value, 0);
  if (total <= 0) {
    return <div className="flex h-40 items-center justify-center text-sm text-[var(--color-muted)]">داده‌ای نیست</div>;
  }

  const stroke = 28;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  let acc = 0;

  return (
    <div className="flex flex-wrap items-center justify-center gap-6">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label="نمودار توزیع">
        <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
          {data.map((d, i) => {
            const frac = d.value / total;
            const dash = frac * c;
            const offset = c - acc * c;
            acc += frac;
            return (
              <circle
                key={i}
                cx={size / 2}
                cy={size / 2}
                r={r}
                fill="none"
                stroke={d.color ?? PALETTE[i % PALETTE.length]}
                strokeWidth={stroke}
                strokeDasharray={`${dash} ${c - dash}`}
                strokeDashoffset={offset}
              />
            );
          })}
        </g>
        <text
          x="50%"
          y="50%"
          textAnchor="middle"
          dominantBaseline="central"
          fontSize="18"
          fontWeight="700"
          fill={PRIMARY}
        >
          {total}
        </text>
      </svg>
      <ul className="space-y-1.5 text-sm">
        {data.map((d, i) => (
          <li key={i} className="flex items-center gap-2">
            <span
              className="inline-block h-3 w-3 rounded-sm"
              style={{ backgroundColor: d.color ?? PALETTE[i % PALETTE.length] }}
            />
            <span className="text-[var(--color-text)]">{d.label}</span>
            <span className="font-semibold text-[var(--color-muted)]">{d.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}