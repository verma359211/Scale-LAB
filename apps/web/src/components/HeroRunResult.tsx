import type { RunResult, RunState } from "../lab-types";
import { isRunActive, runLabel } from "../lib/experiment-presentation";
import { K6ResultPanel } from "./K6ResultPanel";

export function HeroRunResult({ run, result, error, onNewExperiment }: { run: RunState; result: RunResult | null; error: string | null; onNewExperiment: () => void }) {
  if (isRunActive(run)) return null;
  const matching = result?.runId === run.id ? result : null;
  const label = runLabel(run, matching);
  const tone = /fail/i.test(label) || run.cleanup?.status === "failed" ? "failed" : /stopped/i.test(label) ? "stopped" : "completed";
  return <section className={`hero-run-result result-${tone}`} aria-labelledby="hero-result-title">
    <header><span className="result-seal" aria-hidden="true">{tone === "completed" ? "✓" : tone === "stopped" ? "■" : "!"}</span><div><p className="hero-kicker">The outcome</p><h2 id="hero-result-title" role="status">{label}</h2></div></header>
    <div className="hero-result-body"><K6ResultPanel hero run={run} result={matching} error={error} />{run.cleanup?.status === "failed" && <p className="outcome-alert" role="alert">Cleanup failed: {run.cleanup.failureReason ?? "Benchmark cleanup did not succeed."}</p>}</div>
    <footer><button className="start-experiment" type="button" onClick={onNewExperiment}>New experiment <span aria-hidden="true">↗</span></button><p>Results stay in the previous-experiment strip. Raw output is in Test activity.</p></footer>
  </section>;
}
