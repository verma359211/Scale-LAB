import type { MetricPoint, MetricsSummary, MetricsTimeseries, RunState } from "../lab-types";

export type ClusterSignal = "connecting" | "reporting" | "delayed";

export function clusterSignal(summary: MetricsSummary | null, error: string | null, now = Date.now()): ClusterSignal {
  if (error) return "delayed";
  if (!summary) return "connecting";
  const age = now - Date.parse(summary.generatedAt);
  return Number.isFinite(age) && age >= -5000 && age < 30000 && (summary.metrics.apiPodCount ?? 0) > 0 ? "reporting" : "delayed";
}

export function metricTrend(value: number | null | undefined, points: MetricPoint[], timestamp: string, stale: boolean) {
  if (stale || value == null || !Number.isFinite(value)) return null;
  const now = Date.parse(timestamp);
  const before = points.filter(point => Number.isFinite(point.value) && point.timestamp <= now - 30000 && point.timestamp >= now - 45000).sort((a, b) => b.timestamp - a.timestamp)[0];
  if (!before) return null;
  if (before.value === 0 && value !== 0) return { direction: "up", label: "From 0" };
  const delta = before.value === 0 ? 0 : (value - before.value) / Math.abs(before.value) * 100;
  return { direction: delta > 0.05 ? "up" : delta < -0.05 ? "down" : "flat", label: `${Math.abs(delta).toLocaleString(undefined, { maximumFractionDigits: 1 })}%` };
}

export function observedCommentary(summary: MetricsSummary | null, data: MetricsTimeseries | null, stale: boolean) {
  if (stale) return { timestamp: summary?.generatedAt ?? null, message: "Telemetry is delayed. Waiting for fresh measurements." };
  if (!summary) return { timestamp: null, message: "Connecting to the system. No live observations yet." };
  const now = Date.parse(summary.generatedAt);
  const changes: Array<{ timestamp: string; message: string }> = [];
  function observe(points: MetricPoint[], message: (previous: number, current: number) => string | null) {
    const ordered = points.filter(point => Number.isFinite(point.value)).slice().sort((a, b) => a.timestamp - b.timestamp);
    for (let index = 1; index < ordered.length; index++) {
      const previous = ordered[index - 1]!;
      const current = ordered[index]!;
      // A scrape gap is not evidence of an immediate transition.
      if (current.timestamp > now || current.timestamp < now - 60000 || current.timestamp - previous.timestamp > 15000) continue;
      const text = message(previous.value, current.value);
      if (text) changes.push({ timestamp: new Date(current.timestamp).toISOString(), message: text });
    }
  }
  observe(data?.series.apiPodCount ?? [], (previous, current) => current > previous ? `Ready API count rose: ${Math.round(previous)} → ${Math.round(current)}. More servers are available.` : current < previous ? `Ready API count fell: ${Math.round(previous)} → ${Math.round(current)}.` : null);
  observe(data?.series.apiCpuPercent ?? [], (previous, current) => previous <= 70 && current > 70 ? "CPU crossed the 70% HPA target. Watching for a scaling response." : previous > 70 && current <= 70 ? "CPU moved back below the 70% HPA target." : null);
  changes.sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp));
  if (changes[0]) return changes[0];
  const cpu = summary.metrics.apiCpuPercent;
  const ready = summary.metrics.apiPodCount;
  return { timestamp: summary.generatedAt, message: cpu != null && cpu > 70 ? "CPU is above the 70% HPA target. Scaling is not instantaneous." : ready != null ? `${Math.round(ready)} API servers are Ready. Watching for the next system change.` : "Ready-pod metrics are unavailable. Waiting for a fresh signal." };
}

export function latestRunEvent(run: RunState | null) {
  return run?.events.slice().reverse().sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp))[0] ?? null;
}
