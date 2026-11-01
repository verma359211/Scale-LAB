import { useCallback, useEffect, useRef, useState } from "react";
import { HeroRunResult } from "../components/HeroRunResult";
import { isRunActive } from "../lib/experiment-presentation";
import { LabActivityFeed } from "../components/LabActivityFeed";
import { AboutBuilder } from "../components/AboutBuilder";
import { LoadTestPanel } from "../components/LoadTestPanel";
import { ExperimentOutcome } from "../components/ExperimentOutcome";
import { ExperimentHero } from "../components/ExperimentHero";
import { useTelemetryHistory } from "../hooks/useTelemetryHistory";
import { ArchitectureSection } from "../components/ArchitectureSection";
import { TelemetryPanels } from "../components/TelemetryPanels";
import type { MetricsSummary, StartRunRequest, RunResult, RunState, WarmupState, LabConfiguration } from "../lab-types";
import { labApi } from "../lib/lab-api";
import { clusterSignal, type ClusterSignal } from "../lib/live-signals";


export function ScaleLabPage({ onClusterStatusChange }: { onClusterStatusChange?: (status: ClusterSignal) => void } = {}) {
  const history = useTelemetryHistory();
  const [statusKnown, setStatusKnown] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [summary, setSummary] = useState<MetricsSummary | null>(null);
  const [run, setRun] = useState<RunState | null>(null);
  const observedActiveRun = useRef<string | null>(null);
  const [resultViewId, setResultViewId] = useState<string | null>(null);
  const showHeroResult = !!run && resultViewId === run.id && !isRunActive(run);

  useEffect(() => {
    if (run && isRunActive(run)) {
      observedActiveRun.current = run.id;
      setResultViewId(null);
    } else if (run && observedActiveRun.current === run.id) {
      setResultViewId(run.id);
      observedActiveRun.current = null;
    }
  }, [run?.id, run?.status]);
  const [metricsLoading, setMetricsLoading] = useState(true);
  const [metricsError, setMetricsError] = useState<string | null>(null);
  useEffect(() => {
    onClusterStatusChange?.(clusterSignal(summary, metricsError));
  }, [summary, metricsError, onClusterStatusChange]);
  const [controlError, setControlError] = useState<string | null>(null);
  const [actionPending, setActionPending] = useState(false);
  const [runResult, setRunResult] = useState<RunResult | null>(null);
  const [resultError, setResultError] = useState<string | null>(null);
  const [resetNotice, setResetNotice] = useState<string | null>(null);
  const [configuration, setConfiguration] = useState<LabConfiguration | null>(null);
  const [warmup, setWarmup] = useState<WarmupState | null>(null);
  const [warmupError, setWarmupError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    labApi.configuration(controller.signal).then(setConfiguration).catch((error: unknown) => {
      if (!controller.signal.aborted) setControlError(error instanceof Error ? error.message : "Could not load scenarios; refresh to retry");
    });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    let active = true;
    let timer: number | undefined;
    let pollController: AbortController | null = null;

    async function poll() {
      pollController = new AbortController();
      const [summaryResult, runResult, warmupResult] = await Promise.allSettled([
        labApi.summary(pollController.signal),
        labApi.currentRun(pollController.signal),
        labApi.warmup(pollController.signal),
      ]);
      if (!active) return;

      if (summaryResult.status === "fulfilled") {
        setSummary(summaryResult.value);
        setMetricsError(null);
      } else if (!(summaryResult.reason instanceof DOMException && summaryResult.reason.name === "AbortError")) {
        setMetricsError(summaryResult.reason instanceof Error ? summaryResult.reason.message : "Live metrics are unavailable");
      }
      if (runResult.status === "fulfilled") {
        setRun(runResult.value);
        setStatusKnown(true);
        setStatusError(null);
      } else {
        setStatusKnown(false);
        setStatusError("Test status is unavailable. Controls are paused while the controller reconnects.");
      }
      if (warmupResult.status === "fulfilled") { setWarmup(warmupResult.value); setWarmupError(null); }
      else setWarmupError("Kubernetes warm-up status is unavailable; readiness is not confirmed.");
      setMetricsLoading(false);
      timer = window.setTimeout(() => void poll(), 3_000);
    }

    void poll();
    return () => {
      active = false;
      pollController?.abort();
      if (timer) window.clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    if (!run) {
      setRunResult(null);
      setResultError(null);
      return;
    }

    const controller = new AbortController();
    setRunResult((previous) => previous?.runId === run.id ? previous : null);
    function fetchResult() { void labApi.runResult(controller.signal)
      .then((result) => {
        if (!controller.signal.aborted && result.runId === run!.id) { setRunResult(result); setResultError(null); }
      })
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          setResultError(error instanceof Error ? error.message : "Could not load the k6 result");
        }
      }); }
    fetchResult();
    const timer = ["preparing", "starting", "running", "stopping", "resetting", "restoring"].includes(run.status)
      ? window.setInterval(fetchResult, 3_000) : undefined;
    return () => { controller.abort(); if (timer) window.clearInterval(timer); };
  }, [run?.id, run?.status]);

  const startRun = useCallback(async (input: StartRunRequest) => {
    setActionPending(true);
    setControlError(null);
    setResetNotice(null);
    try {
      setRun(await labApi.startRun(input));
    } catch (error) {
      setControlError(error instanceof Error ? error.message : "Could not start the test");
    } finally {
      setActionPending(false);
    }
  }, []);

  const restoreWarmup = useCallback(async () => {
    setActionPending(true);
    setControlError(null);
    try { setWarmup(await labApi.restorePods()); }
    catch (error) { setControlError(error instanceof Error ? error.message : "Could not change pod preparation"); }
    finally { setActionPending(false); }
  }, []);

  const stopRun = useCallback(async () => {
    setActionPending(true);
    setControlError(null);
    try {
      setRun(await labApi.stopRun());
    } catch (error) {
      setControlError(error instanceof Error ? error.message : "Could not stop the test");
    } finally {
      setActionPending(false);
    }
  }, []);

  const resetBenchmark = useCallback(async () => {
    if (!window.confirm("Delete benchmark orders and restore stock for products 10001–10100? Store data is not affected.")) return;
    setActionPending(true);
    setControlError(null);
    setResetNotice(null);
    try {
      const result = await labApi.resetBenchmark();
      setResetNotice(`Benchmark data reset across ${result.shards.length} database shards.`);
    } catch (error) {
      setControlError(error instanceof Error ? error.message : "Could not reset benchmark data");
    } finally {
      setActionPending(false);
    }
  }, []);

  const noTelemetry = summary && summary.unavailable.length === Object.keys(summary.metrics).length;
  const telemetryMessage = metricsError ?? (noTelemetry ? "Prometheus returned no samples for the dashboard metrics" : null);

  return (
    <main className="lab-page direction-page">
      <ExperimentHero run={run} summary={summary} data={history.data} error={telemetryMessage} historyError={history.error} historyLoading={history.loading}
        windowMinutes={history.windowMinutes} onWindowChange={history.setWindowMinutes}>
        {showHeroResult && run ? <HeroRunResult run={run} result={runResult} error={resultError} onNewExperiment={() => setResultViewId(null)} /> : <>
        <LoadTestPanel
          editorial
          metrics={summary?.metrics}
          run={run} configuration={configuration} warmup={warmup} warmupError={warmupError}
          statusKnown={statusKnown} actionPending={actionPending} actionError={controlError ?? statusError}
          onStart={startRun} onStop={stopRun} onReset={resetBenchmark} onRestore={restoreWarmup} resetNotice={resetNotice}
        />
        </>}
      </ExperimentHero>

      <ExperimentOutcome run={run} result={runResult} data={history.data} error={resultError} />

      <section id="detailed-metrics" className="monitor-dashboard" aria-labelledby="monitor-title">
        <header className="monitor-header">
          <div><p className="hero-kicker">02 / Inside the system</p><h2 id="monitor-title">The control room<span>.</span></h2></div>
          <div className="monitor-toolbar"><span className={`monitor-status${telemetryMessage ? " is-stale" : ""}`}>{metricsLoading ? "Connecting" : telemetryMessage ? "Last snapshot · retrying" : "Live telemetry"}</span><div role="group" aria-label="Dashboard history window">{([5, 10] as const).map(m => <button type="button" key={m} aria-pressed={history.windowMinutes === m} onClick={() => history.setWindowMinutes(m)}>Last {m} min</button>)}</div></div>
        </header>
        <div className="monitor-context"><span>API / compute / database / cache</span><span>{summary ? `Snapshot ${new Date(summary.generatedAt).toLocaleTimeString([], {hour12: false})}` : "Awaiting metrics"} · rates over 30s · history every 6s</span></div>
        {telemetryMessage && <p role="alert" className="lab-notice">{telemetryMessage}. Values are the last received snapshot.</p>}
        {history.error && <p role="alert" className="lab-notice">History unavailable. Retained samples keep their original timestamps.</p>}
        <TelemetryPanels data={history.data} summary={summary} loading={metricsLoading} historyLoading={history.loading} windowMinutes={history.windowMinutes} />
        <footer className="monitor-footer"><span>Prometheus / real measurements</span><span>CPU 100% = requested CPU, not the limit. Gaps indicate missing samples.</span></footer>
      </section>
      <ArchitectureSection summary={summary} />
      <div id="run-details" className="lab-finisher">
        <AboutBuilder />
        <LabActivityFeed run={run} result={runResult} error={resultError} />
      </div>
      <footer className="lab-footer"><span>Built to make system behavior visible.</span><a href="/store">Try the Store →</a><a href="https://github.com/verma359211/Scale-LAB" target="_blank" rel="noreferrer">Read the code ↗</a></footer>
    </main>
  );
}
