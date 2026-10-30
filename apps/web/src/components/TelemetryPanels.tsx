import { useRef } from "react";
import type { MetricKey, MetricsTimeseries } from "../lab-types";
import { podColor } from "../lib/chart-data";
import { TimeSeriesChart } from "./TimeSeriesChart";

const number = (value: number) => value.toFixed(value >= 100 ? 0 : 1);
const ms = (value: number) => `${number(value)}ms`;
const percent = (value: number) => `${number(value)}%`;

export function TelemetryPanels({ data, windowMinutes }: { data: MetricsTimeseries | null; windowMinutes: 5 | 10 }) {
  const podColors = useRef(new Map<string, string>());
  const range = data ? { start: Date.parse(data.start), end: Date.parse(data.end) } : undefined;
  const series = (key: MetricKey, label: string, color: string) => ({ label, color, points: data?.series[key] ?? [] });
  const pods = (key: "cpuPercent" | "requestRps") => (data?.perPod[key] ?? []).map(({ pod, points }) => {
    if (!podColors.current.has(pod)) podColors.current.set(pod, podColor(pod, podColors.current.size));
    return { label: pod, color: podColors.current.get(pod)!, points };
  });

  return <>
    <section aria-labelledby="telemetry-title" className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><h2 id="telemetry-title" className="text-lg font-semibold">Live Telemetry · Autoscaling Overview</h2><p className="mt-1 text-sm text-slate-500">Traffic → CPU → desired replicas → ready pods → redistributed traffic. Rates and quantiles use a rolling 30s window.</p></div>
      </div>
      {!data && <p className="text-sm text-slate-500">Waiting for {windowMinutes}-minute history…</p>}
      <div className="grid gap-4 lg:grid-cols-2">
        <TimeSeriesChart title="Incoming RPS" description="Public API traffic at ingress" series={[series("ingressRps", "Incoming", "#2563eb")]} formatValue={number} timeRange={range} />
        <TimeSeriesChart title="Ready vs Desired API Replicas" description="HPA requests capacity; readiness confirms it can serve" series={[series("apiPodCount", "Ready", "#059669"), series("desiredPodCount", "Desired", "#9333ea")]} formatValue={number} timeRange={range} />
        <TimeSeriesChart title="API CPU by Pod (% of CPU Request)" description="100% means the pod is using its requested CPU, not its limit" series={pods("cpuPercent")} formatValue={percent} timeRange={range} referenceLines={[{ label: "HPA target 70%", value: 70, color: "#b45309" }]} />
        <TimeSeriesChart title="Requests/sec by API Pod" description="See when new pods begin handling traffic" series={pods("requestRps")} formatValue={number} timeRange={range} />
        <TimeSeriesChart title="HTTP Latency — p95 and p99" description="API request duration" series={[series("p95LatencyMs", "p95", "#7c3aed"), series("p99LatencyMs", "p99", "#db2777")]} formatValue={ms} timeRange={range} />
        <TimeSeriesChart title="API CPU · All Pods" description="Total CPU in millicores; 1,000m equals one core" series={[series("apiCpuTotalMillicores", "CPU (m)", "#ea580c")]} formatValue={(value) => `${number(value)}m`} timeRange={range} />
      </div>
    </section>
    <section aria-labelledby="backend-health-title" className="space-y-4">
      <h2 id="backend-health-title" className="text-lg font-semibold">Backend Health</h2>
      <p className="text-sm text-slate-500">Same {windowMinutes}-minute history as the autoscaling charts.</p>
      <div className="grid gap-4 lg:grid-cols-2">
        <TimeSeriesChart title="HTTP Errors / 5xx Rate" description="Share of API requests returning server errors" series={[series("httpErrorRate", "5xx", "#dc2626")]} formatValue={percent} timeRange={range} />
        <TimeSeriesChart title="PostgreSQL Pool Waiting Requests" description="Requests queued for a database connection, across pods and shards" series={[series("poolWaiters", "Waiting", "#d97706")]} formatValue={number} timeRange={range} />
        <TimeSeriesChart title="Successful Orders/sec" description="Confirmed POST /api/orders responses with HTTP 201" series={[series("successfulOrdersRps", "Orders", "#059669")]} formatValue={number} timeRange={range} />
        <TimeSeriesChart title="Database Query Latency" description="PostgreSQL query execution p95" series={[series("postgresP95LatencyMs", "Query p95", "#475569")]} formatValue={ms} timeRange={range} />
        <TimeSeriesChart title="Redis Cache Hit Ratio" description="Share of product-cache reads served from Redis" series={[series("redisHitRatio", "Cache hits", "#db2777")]} formatValue={percent} timeRange={range} />
      </div>
    </section>
  </>;
}
