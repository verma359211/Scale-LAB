import type { RunResult, RunState } from "../lab-types";
import { K6Output } from "./K6Output";

export function LabActivityFeed({ run, result = null, error = null }: { run: RunState | null; result?: RunResult | null; error?: string | null }) {
  const events = run?.events.slice().reverse() ?? [];
  const matching = result?.runId === run?.id ? result : null;
  return <section className="activity-panel" aria-labelledby="lab-activity-title">
    <header><div><p className="hero-kicker">The experiment log</p><h2 id="lab-activity-title">Test activity<span>.</span></h2></div><span className="activity-count">{events.length} events</span></header>
    <p className="activity-caption">Recorded by the controller · latest first</p>
    {events.length === 0 ? <div className="activity-empty"><span aria-hidden="true">↳</span><p>No test events yet.<small>The timeline fills as an experiment runs.</small></p></div> : <ol className="activity-timeline" tabIndex={0} aria-label="Recorded test events">
      {events.map((event, index) => <li key={`${event.timestamp}-${index}`}>
        <time dateTime={event.timestamp} title={new Date(event.timestamp).toLocaleString()}>{new Date(event.timestamp).toLocaleTimeString([], { hour12: false })}</time>
        <div><p>{event.message}</p>{event.detail && <details className="activity-event-detail"><summary>Details</summary><p>{event.detail}</p></details>}</div>
      </li>)}
    </ol>}
    {error && <p className="activity-error" role="alert">{error}</p>}
    <K6Output run={run} result={matching} />
  </section>;
}
