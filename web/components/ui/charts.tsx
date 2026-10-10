// Small hand-made charts (plain SVG and CSS, no chart library).

type Segment = { value: number; color: string };

/**
 * A ring chart. Segments share the whole circle, or pass `max` to leave
 * the rest of the ring empty (e.g. budget not used yet).
 */
export function Donut({ segments, max, thickness = 16, track = "#edf1f6", round = false, className = "" }: {
  segments: Segment[];
  max?: number;
  thickness?: number;
  track?: string;
  round?: boolean;
  className?: string;
}) {
  const r = (100 - thickness) / 2;
  const c = 2 * Math.PI * r;
  const total = max || segments.reduce((sum, s) => sum + s.value, 0);
  const useGap = !round && segments.filter((s) => s.value > 0).length > 1;
  let offset = 0;

  return (
    <svg viewBox="0 0 100 100" className={`block size-full -rotate-90 ${className}`} aria-hidden>
      <circle cx="50" cy="50" r={r} fill="none" stroke={track} strokeWidth={thickness} />
      {total > 0 &&
        segments.map((s, i) => {
          if (s.value <= 0) return null;
          const length = (Math.min(s.value, total) / total) * c;
          const dash = Math.max(length - (useGap ? 1.2 : 0), 0.01);
          const arc = (
            <circle
              key={i}
              cx="50"
              cy="50"
              r={r}
              fill="none"
              stroke={s.color}
              strokeWidth={thickness}
              strokeDasharray={`${dash} ${c}`}
              strokeDashoffset={-offset}
              strokeLinecap={round ? "round" : "butt"}
            />
          );
          offset += length;
          return arc;
        })}
    </svg>
  );
}

/** A thin progress bar. `fill` is a background class such as "bg-blue-500". */
export function Progress({ value, fill = "bg-blue-500", track = "", className = "h-2", label }: { value: number; fill?: string; track?: string; className?: string; label?: string }) {
  // The value read out stays between 0 and 100 (a goal can be passed; the bar is then simply full).
  return (
    <div className={`progress ${track} ${className}`} role="progressbar" aria-label={label} aria-valuenow={Math.round(Math.max(0, Math.min(100, value)))} aria-valuemin={0} aria-valuemax={100}>
      <span className={fill} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
}

/** A tiny line for trends (heart rate, weight). */
export function Sparkline({ values, className = "h-7 w-full" }: { values: number[]; className?: string }) {
  if (values.length < 2) return <div className={className} />;
  const w = 120;
  const h = 28;
  const pad = 4;
  const min = Math.min(...values);
  const range = Math.max(...values) - min || 1;
  const points = values.map((v, i) => [(i / (values.length - 1)) * (w - pad * 2) + pad, h - pad - ((v - min) / range) * (h - pad * 2)]);
  const [lx, ly] = points[points.length - 1];
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <polyline points={points.map((p) => p.join(",")).join(" ")} />
      <circle cx={lx} cy={ly} r="3" fill="currentColor" stroke="none" />
    </svg>
  );
}
