import type { ReactNode } from "react";
import type { MetricPoint, MetricsSummary, MetricsTimeseries, RunState } from "../lab-types";
import { TrafficCapacityChart } from "./TrafficCapacityChart";
import { LiveCommentary } from "./LiveCommentary";
import { clusterSignal, metricTrend } from "../lib/live-signals";

type Props = {
  children: ReactNode;
  run?: RunState | null;
  summary: MetricsSummary | null;
  data: MetricsTimeseries | null;
  error: string | null;
  historyError: string | null;
  historyLoading?: boolean;
  windowMinutes: 5 | 10;
  onWindowChange: (minutes: 5 | 10) => void;
};

export function ExperimentHero({ children, run = null, summary, data, error, historyError, historyLoading, windowMinutes, onWindowChange }: Props) {
  const metrics = summary?.metrics;
  const number = (value: number | null | undefined, digits = 0) => value == null ? "—" : value.toLocaleString(undefined, { maximumFractionDigits: digits });
  const stale = clusterSignal(summary, error) === "delayed";
  const trend = (value: number | null | undefined, points: MetricPoint[] = []) => <MetricTrend value={value} points={points} timestamp={summary?.generatedAt ?? ""} stale={stale || !!historyError} />;
  return <section className="direction-hero" id="experiment" aria-labelledby="hero-title">
    <div className="hero-editorial">
      <p className="hero-kicker">01 / An interactive systems experiment</p>
      <h1 id="hero-title">Traffic goes up.<br /> Servers<br /> <em>follow.</em></h1>
      <p className="hero-description">Put a real ecommerce backend under load.<br />Watch Kubernetes add servers as traffic grows — live, with no simulation.</p>
      {children}
    </div>
    <div className="hero-response">
      <div className="hero-response-heading"><h2>Live / system response</h2><span className={error ? "response-stale" : ""}>{error ? "Snapshot · reconnecting" : summary ? "Live snapshot · 3s" : "Connecting to telemetry"}</span></div>
      {error && <p className="lab-notice" role="alert">{error}. {summary ? "Showing the last received snapshot." : "Metrics are unavailable."}</p>}
      <dl className="hero-metrics">
        <div><dt>Requests / sec</dt><dd>{number(metrics?.ingressRps)} <small>RPS</small></dd>{trend(metrics?.ingressRps, data?.series.ingressRps)}</div>
        <div><dt>Ready servers</dt><dd>{number(metrics?.apiPodCount)}<small>/{number(metrics?.desiredPodCount)} desired</small></dd>{trend(metrics?.apiPodCount, data?.series.apiPodCount)}</div>
        <div><dt>CPU load</dt><dd>{number(metrics?.apiCpuPercent, 1)} <small>%</small></dd>{trend(metrics?.apiCpuPercent, data?.series.apiCpuPercent)}</div>
        <div><dt>Error rate</dt><dd>{number(metrics?.httpErrorRate, 2)} <small>%</small></dd>{trend(metrics?.httpErrorRate, data?.series.httpErrorRate)}</div>
      </dl>
      <div className="hero-history-controls"><span>{summary ? `Updated ${new Date(summary.generatedAt).toLocaleTimeString([], {hour12: false})}` : "Awaiting a snapshot"}</span><div role="group" aria-label="Hero history window">{([5, 10] as const).map(m => <button key={m} type="button" aria-pressed={windowMinutes === m} onClick={() => onWindowChange(m)}>{m} min</button>)}</div></div>
      {historyError && <p className="lab-notice" role="alert">History unavailable; retained samples keep their original timestamps.</p>}
      <TrafficCapacityChart data={data} loading={historyLoading} />
      <LiveCommentary run={run} summary={summary} data={historyError ? null : data} stale={stale} />
      <p className="hero-metric-context">CPU relative to requested CPU · HPA target 70% · errors are HTTP 5xx · arrows show direction, not system health</p>
    </div>
  </section>;
}

function MetricTrend({ value, points, timestamp, stale }: { value: number | null | undefined; points: MetricPoint[]; timestamp: string; stale: boolean }) {
  const change = metricTrend(value, points, timestamp, stale);
  return <p className={`metric-trend trend-${change?.direction ?? "unknown"}`} title="Relative change from a sample 30–45 seconds earlier. An increase is not necessarily an improvement.">
    <span aria-hidden="true">{change?.direction === "up" ? "↑" : change?.direction === "down" ? "↓" : "—"}</span>
    {change ? <><span className="sr-only">{change.direction === "up" ? "Increased " : change.direction === "down" ? "Decreased " : "Unchanged "}</span>{change.label}<small> / ~30s</small></> : <small>Awaiting comparison</small>}
  </p>;
}
