import type { MetricsTimeseries, RunResult, RunState } from "../lab-types";
import { isRunActive, replicaObservation, runLabel } from "../lib/experiment-presentation";

export function ExperimentOutcome({ run, result, data, error }: { run: RunState | null; result: RunResult | null; data: MetricsTimeseries | null; error: string | null }) {
  if (!run || isRunActive(run)) return null;
  const matching = result?.runId === run.id ? result : null;
  const summary = matching?.summary;
  const observation = replicaObservation(run, data?.series.apiPodCount ?? []);
  const label = runLabel(run, matching);
  const tone = run.cleanup?.status === "failed" || /fail/i.test(label) ? "failed" : /stopped/i.test(label) ? "stopped" : "completed";
  const names = { static: "Static reads", ramp: "Autoscaling ramp", spike: "Traffic spike", mixed: "Mixed reads & writes" };
  return <section className={`experiment-outcome outcome-${tone}`} aria-labelledby="outcome-title">
    <p className="sr-only" role="status">{label}</p>
    <details className="outcome-disclosure">
      <summary>
        <span className="outcome-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="12" r="9" />{tone === "completed" ? <path d="m8 12 3 3 5-6" /> : tone === "stopped" ? <rect x="9" y="9" width="6" height="6" rx=".5" /> : <path d="M12 7v6m0 3v1" />}</svg></span>
        <div className="outcome-identity"><h2 id="outcome-title">Previous experiment</h2><p>{names[run.type]} <span aria-hidden="true">/</span> <time dateTime={run.endedAt ?? undefined}>{run.endedAt ? new Date(run.endedAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "Completion time unavailable"}</time></p></div>
        <span className="outcome-status">{label.replace(/^Experiment /, "")}</span>
        <span className="outcome-toggle">Results <span className="outcome-plus" aria-hidden="true">+</span></span>
      </summary>
      <div className="outcome-report">
        {!summary ? <p className="outcome-empty">No measured k6 summary available yet. Reported output remains in Test activity.</p> : <dl className="outcome-values">
          <div><dt>Achieved throughput</dt><dd>{summary.achievedRps?.toLocaleString(undefined, { maximumFractionDigits: 1 }) ?? "—"} <small>req/s</small></dd></div>
          <div><dt>Total requests</dt><dd>{summary.completedRequests?.toLocaleString() ?? "—"}</dd></div>
          <div><dt>p95 latency</dt><dd>{summary.p95 ?? "—"}</dd></div>
          <div><dt>p99 latency</dt><dd>{summary.p99 ?? "—"}</dd></div>
          <div data-has-errors={(summary.failureRate ?? 0) > 0}><dt>Failed requests</dt><dd>{summary.failureRate == null ? "—" : `${summary.failureRate}%`}</dd></div>
          <div><dt>Dropped iterations</dt><dd>{summary.droppedIterations?.toLocaleString() ?? "—"}</dd></div>
        </dl>}
        {run.type === "mixed" && summary && <p className="outcome-footnote">Reads {summary.readRequests?.toLocaleString() ?? "—"} · Writes {summary.writeRequests?.toLocaleString() ?? "—"} · Orders created {summary.successfulOrders?.toLocaleString() ?? "—"}</p>}
        <div className="outcome-context"><p>Target {run.configuration.targetRps.toLocaleString()} req/s{["ramp", "spike"].includes(run.type) ? " peak" : ""} · {run.configuration.duration}. Achieved rate is the run average.</p><p>{observation ? `Ready pods ${observation.min}–${observation.max} · ${observation.increased ? "increase observed" : "no increase observed"} (partial history).` : "Workload replica history unavailable; scaling cannot be confirmed."}</p>{run.cleanup?.required && <p>Benchmark cleanup: {run.cleanup.status}.</p>}</div>
      </div>
    </details>
    {run.failureReason && <p role="alert" className="outcome-alert">{run.failureReason}</p>}
    {run.cleanup?.status === "failed" && <p role="alert" className="outcome-alert">Cleanup failed: {run.cleanup.failureReason ?? "Benchmark cleanup did not succeed."}</p>}
    {error && <p role="alert" className="outcome-alert">{error}</p>}
  </section>;
}
