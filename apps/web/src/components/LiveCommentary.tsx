import type { MetricsSummary, MetricsTimeseries, RunState } from "../lab-types";
import { latestRunEvent, observedCommentary } from "../lib/live-signals";
import { isRunActive } from "../lib/experiment-presentation";

export function LiveCommentary({ run, summary, data, stale }: { run: RunState | null; summary: MetricsSummary | null; data: MetricsTimeseries | null; stale: boolean }) {
  const event = latestRunEvent(run);
  const observation = observedCommentary(summary, data, stale);
  return <section className={`live-commentary${stale ? " is-delayed" : ""}`} aria-label="Live system commentary">
    <div className="commentary-label"><span aria-hidden="true">↳</span> As it happens <small>{stale ? "Delayed" : "Observed"}</small></div>
    <div className="commentary-lines">
      <p><span className="commentary-kind">System</span><span aria-live="polite">{observation.message}</span></p>
      {event && <p><span className="commentary-kind">{isRunActive(run) ? "Test" : "Last test"} <time dateTime={event.timestamp} title={new Date(event.timestamp).toLocaleString()}>{new Date(event.timestamp).toLocaleTimeString([], { hour12: false })}</time></span><span>{event.message}</span></p>}
    </div>
  </section>;
}
