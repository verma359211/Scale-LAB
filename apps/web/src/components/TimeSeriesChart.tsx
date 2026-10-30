import type { MetricPoint } from "../lab-types";
import { splitMetricGaps } from "../lib/chart-data";

type ChartSeries = { label: string; color: string; points: MetricPoint[] };
type Props = {
  title: string;
  description: string;
  series: ChartSeries[];
  formatValue: (value: number) => string;
  referenceLines?: Array<{ label: string; value: number; color: string }>;
  timeRange?: { start: number; end: number };
  compact?: boolean;
  stepped?: boolean;
};

export function TimeSeriesChart({ title, description, series, formatValue, referenceLines = [], timeRange, compact = false, stepped = false }: Props) {
  const points = series.flatMap((entry) => entry.points);
  const minTime = timeRange?.start ?? (points.length ? Math.min(...points.map((point) => point.timestamp)) : 0);
  const maxTime = timeRange?.end ?? (points.length ? Math.max(...points.map((point) => point.timestamp)) : 1);
  const maxValue = Math.max(1, ...points.map((point) => point.value), ...referenceLines.map((line) => line.value));
  const width = 400;
  const height = compact ? 116 : 190;
  const left = 52;
  const right = 12;
  const top = 14;
  const bottom = 28;
  const x = (timestamp: number) => left + ((timestamp - minTime) / Math.max(1, maxTime - minTime)) * (width - left - right);
  const y = (value: number) => top + (1 - value / maxValue) * (height - top - bottom);

  return (
    <article className={compact ? "min-w-0 rounded-lg border border-slate-200 bg-white p-3" : "min-w-0 rounded-xl border border-slate-200 bg-white p-4"}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-950">{title}</h3>
          <p className="mt-1 text-xs text-slate-500">{description}</p>
        </div>
        <div className="flex flex-wrap gap-3 text-xs text-slate-600">
          {series.map((entry) => (
            <span key={entry.label} className="flex min-w-0 max-w-full items-center gap-1.5 break-all">
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: entry.color }} />{entry.label}
            </span>
          ))}
          {referenceLines.map((line) => (
            <span key={line.label} style={{ color: line.color }}>{line.label}</span>
          ))}
        </div>
      </div>

      {points.length === 0 ? (
        <div style={{ aspectRatio: `${width}/${height}` }} className="mt-3 grid place-items-center rounded-lg border border-dashed border-slate-200 bg-slate-50 text-sm text-slate-600">
          No metric samples yet
        </div>
      ) : (
        <svg className="mt-3 h-auto w-full" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${title} time-series chart`}>
          <desc>{description}. {series.map((entry) => `${entry.label}: latest ${entry.points.length ? formatValue(entry.points[entry.points.length - 1]!.value) : "unavailable"}`).join(". ")}</desc>
          {[0, 0.5, 1].map((ratio) => {
            const value = maxValue * (1 - ratio);
            const lineY = top + ratio * (height - top - bottom);
            return (
              <g key={ratio}>
                <line x1={left} x2={width - right} y1={lineY} y2={lineY} stroke="#e2e8f0" strokeWidth="1" />
                <text x={left - 8} y={lineY + 4} textAnchor="end" fontSize="12" fill="#475569">{formatValue(value)}</text>
              </g>
            );
          })}
          {referenceLines.map((line) => <line key={line.label} x1={left} x2={width - right} y1={y(line.value)} y2={y(line.value)} stroke={line.color} strokeWidth="1.5" strokeDasharray="5 4" />)}
          {series.flatMap((entry, seriesIndex) => splitMetricGaps(entry.points).map((segment, index) => (
            <polyline
              key={`${entry.label}-${index}`}
              fill="none"
              stroke={entry.color}
              strokeWidth="2"
              strokeDasharray={stepped && seriesIndex > 0 ? "5 4" : undefined}
              strokeLinejoin="round"
              strokeLinecap="round"
              points={segment.map((point, i) => `${stepped && i > 0 ? `${x(point.timestamp)},${y(segment[i - 1]!.value)} ` : ""}${x(point.timestamp)},${y(point.value)}`).join(" ")}
            />
          )))}
          <text x={left} y={height - 7} fontSize="12" fill="#475569">{new Date(minTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</text>
          <text x={width - right} y={height - 7} textAnchor="end" fontSize="12" fill="#475569">{new Date(maxTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</text>
        </svg>
      )}
    </article>
  );
}
