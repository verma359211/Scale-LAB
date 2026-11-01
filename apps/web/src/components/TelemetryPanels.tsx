import { useRef } from "react";
import type { MetricKey, MetricsSummary, MetricsTimeseries } from "../lab-types";
import { podColor } from "../lib/chart-data";
import { TimeSeriesChart } from "./TimeSeriesChart";

const number = (value: number) => value.toLocaleString(undefined, { maximumFractionDigits: 1 });
const ms = (value: number) => `${number(value)}ms`;
const percent = (value: number) => `${number(value)}%`;
const podPalette = ["#388b70", "#b54830", "#a28237", "#66788a", "#8e6481", "#76803b"];
type Props = { data: MetricsTimeseries | null; summary: MetricsSummary | null; loading: boolean; historyLoading?: boolean; windowMinutes: 5 | 10 };

export function TelemetryPanels({ data, summary, loading, historyLoading = false, windowMinutes }: Props) {
  const identities = useRef(new Map<string, { label: string; color: string }>());
  // Friendly identities remain stable across polls, range changes and chart order.
  const names = [...new Set([...(data?.perPod.cpuPercent ?? []), ...(data?.perPod.requestRps ?? [])].map(p => p.pod))].sort();
  for (const pod of names) {
    if (!identities.current.has(pod)) {
      const index = identities.current.size;
      identities.current.set(pod, { label: `Pod ${index + 1}`, color: podPalette[index] ?? podColor(pod, index) });
    }
  }
  const range = data ? { start: Date.parse(data.start), end: Date.parse(data.end) } : undefined;
  const series = (key: MetricKey, label: string, color: string) => ({ label, color, points: data?.series[key] ?? [] });
  const pods = (key: "cpuPercent" | "requestRps") => (data?.perPod[key] ?? []).map(({ pod, points }) => ({ ...identities.current.get(pod)!, points }));
  const stat = (key: MetricKey, label: string, format = number) => {
    const value = summary?.metrics[key];
    return <dl className={`bento-stat stat-${key}`} key={key}><dt>{label}</dt><dd>{loading ? "…" : value == null ? "—" : format(value)}</dd></dl>;
  };

  return <div className="monitor-bento" aria-label={`${windowMinutes}-minute system metric history`}>
    <TimeSeriesChart loading={historyLoading} className="bento-cpu" compact title="CPU by pod" description="% of CPU request" series={pods("cpuPercent")} formatValue={percent} timeRange={range} referenceLines={[{ label: "HPA 70%", value: 70, color: "#a28237" }]} />
    {stat("apiPodCount", "Ready pods")}
    {stat("desiredPodCount", "Desired pods")}
    <TimeSeriesChart loading={historyLoading} className="bento-traffic" compact title="Traffic by pod" description="Requests / second" series={pods("requestRps")} formatValue={number} timeRange={range} />
    {stat("apiCpuPercent", "CPU / request", percent)}
    {stat("apiCpuMillicores", "CPU / pod", v => `${number(v)}m`)}
    <TimeSeriesChart loading={historyLoading} className="bento-latency" compact title="Response time" description="API latency · p95 / p99" series={[series("p95LatencyMs", "p95", "#b54830"), series("p99LatencyMs", "p99", "#a28237")]} formatValue={ms} timeRange={range} />
    {stat("p95LatencyMs", "p95 latency", ms)}
    {stat("p99LatencyMs", "p99 latency", ms)}
    <TimeSeriesChart loading={historyLoading} className="bento-incoming" compact title="Incoming requests" description="Public API requests / second" series={[series("ingressRps", "Incoming", "#b54830")]} formatValue={number} timeRange={range} />
    {stat("httpErrorRate", "Server errors", percent)}
    {stat("requestRps", "API req/s")}
    <TimeSeriesChart loading={historyLoading} className="bento-capacity" compact stepped title="Server capacity" description="Ready vs desired replicas" series={[series("apiPodCount", "Ready", "#388b70"), series("desiredPodCount", "Desired", "#a28237")]} formatValue={v => Math.round(v).toString()} timeRange={range} />
    <TimeSeriesChart loading={historyLoading} className="bento-total" compact title="Total API CPU" description="Millicores · 1,000m = one core" series={[series("apiCpuTotalMillicores", "CPU", "#647c72")]} formatValue={v => `${number(v)}m`} timeRange={range} />
    <TimeSeriesChart loading={historyLoading} className="bento-errors" compact title="Server errors" description="HTTP 5xx · % of API requests" series={[series("httpErrorRate", "5xx", "#b54830")]} formatValue={percent} timeRange={range} />
    <TimeSeriesChart loading={historyLoading} className="bento-queue" compact title="Database queue" description="Requests waiting for a connection" series={[series("poolWaiters", "Waiting", "#a28237")]} formatValue={number} timeRange={range} />
    {stat("poolWaiters", "Pool waiters")}
    {stat("postgresP95LatencyMs", "Query p95", ms)}
    <TimeSeriesChart loading={historyLoading} className="bento-query" compact title="Database query time" description="PostgreSQL execution · p95" series={[series("postgresP95LatencyMs", "Query p95", "#647c72")]} formatValue={ms} timeRange={range} />
    {stat("activeRequests", "In flight")}
    {stat("successfulOrdersRps", "Orders/sec")}
    <TimeSeriesChart loading={historyLoading} className="bento-cache" compact title="Redis cache hits" description="Product reads served from cache" series={[series("redisHitRatio", "Hits", "#388b70")]} formatValue={percent} timeRange={range} />
    {stat("redisHitRatio", "Cache hits", percent)}
    {stat("ingressRps", "Incoming req/s")}
    <TimeSeriesChart loading={historyLoading} className="bento-orders" compact title="Orders created" description="Successful orders per second" series={[series("successfulOrdersRps", "Orders", "#388b70")]} formatValue={number} timeRange={range} />
    <div className="bento-note"><span>One system.</span><em>Many signals.</em></div>
  </div>;
}
