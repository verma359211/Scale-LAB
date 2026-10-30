import type { MetricsTimeseries, RunResult, RunState } from "../lab-types";
import { isRunActive, replicaObservation, runLabel } from "../lib/experiment-presentation";

export function ExperimentOutcome({ run, result, data, error }: { run: RunState | null; result: RunResult | null; data: MetricsTimeseries | null; error: string | null }) {
  if (!run || isRunActive(run)) return null;
  const matching = result?.runId === run.id ? result : null;
  const summary = matching?.summary;
  const observation = replicaObservation(run, data?.series.apiPodCount ?? []);
  const label = runLabel(run, matching);
  return <section className="experiment-outcome" aria-labelledby="outcome-title">
    <p className="sr-only" role="status">{label}</p>
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <h2 id="outcome-title" className="font-semibold">Previous experiment <span className="font-normal text-slate-600">/ {label}</span></h2>
      <time className="text-xs text-slate-600">{run.endedAt ? new Date(run.endedAt).toLocaleString() : "Completion time unavailable"}</time>
    </div>
    {run.failureReason && <p role="alert" className="mt-2 text-sm text-rose-800">{run.failureReason}</p>}
    {run.cleanup?.status === "failed" && <p role="alert" className="mt-2 text-sm text-rose-800">Cleanup failed: {run.cleanup.failureReason}</p>}
    {error && <p role="alert" className="mt-2 text-sm text-amber-800">{error}</p>}
    {!summary ? <p className="mt-3 text-sm text-slate-600">No measured k6 summary available yet. Run details retain any reported output.</p> : <dl className="outcome-values">
      <div><dt>Total requests</dt><dd>{summary.completedRequests?.toLocaleString() ?? "—"}</dd></div>
      <div><dt>Achieved throughput</dt><dd>{summary.achievedRps?.toLocaleString(undefined, { maximumFractionDigits: 1 }) ?? "—"} <small>req/s</small></dd></div>
      <div><dt>Failed requests</dt><dd>{summary.failureRate == null ? "—" : `${summary.failureRate}%`}</dd></div>
      <div><dt>p95 / p99 latency</dt><dd>{summary.p95 ?? "—"} <small>/ {summary.p99 ?? "—"}</small></dd></div>
    </dl>}
    <p className="mt-3 text-xs leading-5 text-slate-600">Requested {run.configuration.targetRps.toLocaleString()} req/s{["ramp", "spike"].includes(run.type) ? " peak" : ""}; achieved throughput is the whole-run average. {observation ? `${observation.increased ? "A Ready replica increase was observed" : "No Ready replica increase was observed"} in the available run samples (${observation.min}–${observation.max} Ready). This window may cover only part of the workload.` : "Replica history for this workload is unavailable in the selected window; scaling cannot be confirmed."}</p>
  </section>;
}
