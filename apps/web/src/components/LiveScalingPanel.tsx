import type { MetricsSummary, MetricsTimeseries } from "../lab-types";
import { HPA_TARGET_PERCENT } from "../lib/system-state";
import { TimeSeriesChart } from "./TimeSeriesChart";

type Props = {
  summary: MetricsSummary | null;
  data: MetricsTimeseries | null;
  loading: boolean;
  error: string | null;
  historyError: string | null;
  windowMinutes: 5 | 10;
  onWindowChange: (minutes: 5 | 10) => void;
};
const count = (value: number | null | undefined) => value == null ? "—" : Math.round(value).toLocaleString();

export function LiveScalingPanel({ summary, data, loading, error, historyError, windowMinutes, onWindowChange }: Props) {
  const metrics = summary?.metrics;
  const ready = metrics?.apiPodCount;
  const desired = metrics?.desiredPodCount;
  const known = ready != null && desired != null;
  const waiting = known ? Math.max(0, Math.round(desired - ready)) : 0;
  const range = data ? { start: Date.parse(data.start), end: Date.parse(data.end) } : undefined;
  const updated = summary ? new Date(summary.generatedAt).toLocaleTimeString([], { hour12: false }) : null;
  const status = loading ? "Connecting" : error ? (summary ? "Snapshot · retrying" : "Telemetry unavailable") : "Live telemetry";

  return <section className="live-scaling" aria-labelledby="live-scaling-title">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h2 id="live-scaling-title" className="eyebrow">02 / Watch the system respond</h2>
      <span className={`live-badge ${loading || error ? "is-stale" : ""}`}><span aria-hidden="true" />{status}</span>
    </div>
    {error && <p role="alert" className="lab-notice mt-3">{error}. {summary ? "Values below are the last received snapshot." : "No telemetry snapshot is available yet."}</p>}
    <div className="signal-strip">
      <div><span>Incoming traffic</span><strong>{count(metrics?.ingressRps)} <small>req/s</small></strong><p>Requests reaching ingress</p></div>
      <div><span>API CPU demand</span><strong>{metrics?.apiCpuPercent == null ? "—" : metrics.apiCpuPercent.toFixed(1)}<small>%</small></strong><p>{HPA_TARGET_PERCENT}% autoscaling target</p></div>
      <div><span>API servers</span><strong>{count(ready)} <small>Ready / {count(desired)} desired</small></strong><p>A pod is one API server</p></div>
    </div>
    <div className="replica-track">
      <div className="flex flex-wrap gap-2" aria-label={known ? `${count(ready)} Ready API pods; ${waiting} additional replicas requested` : "API replica counts unavailable"}>
        {ready == null ? <span className="text-sm text-slate-600">Waiting for replica metrics</span> : Array.from({ length: Math.min(20, Math.max(0, Math.round(ready))) }, (_, index) => <span key={index} className="pod-unit" aria-hidden="true"><span /> API</span>)}
        {ready != null && ready > 20 && <span>+{Math.round(ready) - 20} Ready</span>}
        {known && Array.from({ length: Math.min(20, waiting) }, (_, index) => <span key={`pending-${index}`} className="pod-unit pod-requested" aria-hidden="true">+ Requested</span>)}
      </div>
      <p>{!known ? "Waiting for both readiness and desired-capacity metrics." : waiting > 0 ? `${waiting} more ${waiting === 1 ? "replica is" : "replicas are"} requested; readiness has not caught up yet.` : `${count(ready)} API pods are Ready. Kubernetes adjusts desired capacity as CPU demand changes.`}</p>
    </div>
    <div className="flex flex-wrap items-center justify-between gap-2 pb-2 pt-3">
      <p className="text-xs text-slate-600">Traffic → CPU → desired capacity → Ready servers</p>
      <div className="range-switch" role="group" aria-label="Telemetry history window">
        {([5, 10] as const).map((minutes) => <button key={minutes} type="button" aria-pressed={windowMinutes === minutes} onClick={() => onWindowChange(minutes)}>Last {minutes} min</button>)}
      </div>
    </div>
    {historyError && <p role="alert" className="lab-notice mb-3">History unavailable. Retained samples keep their original timestamps.</p>}
    <div className="scaling-charts">
      <TimeSeriesChart compact title="Incoming traffic" description="Requests/sec · rolling 30s" series={[{ label: "Ingress", color: "#2563eb", points: data?.series.ingressRps ?? [] }]} formatValue={(value) => value.toLocaleString(undefined, { maximumFractionDigits: 1 })} timeRange={range} />
      <TimeSeriesChart compact stepped title="API capacity" description="Replica counts · same time window" series={[{ label: "Ready", color: "#0f766e", points: data?.series.apiPodCount ?? [] }, { label: "Desired", color: "#b45309", points: data?.series.desiredPodCount ?? [] }]} formatValue={(value) => value.toLocaleString(undefined, { maximumFractionDigits: 1 })} timeRange={range} />
    </div>
    <p className="mt-3 text-xs text-slate-600">{updated ? `Snapshot ${updated} · ` : ""}CPU is relative to each pod’s requested CPU. Scaling takes time; it is not guaranteed by a preset.</p>
  </section>;
}
