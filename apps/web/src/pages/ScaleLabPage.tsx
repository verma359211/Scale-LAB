import { useCallback, useEffect, useState } from "react";
import { LabActivityFeed } from "../components/LabActivityFeed";
import { K6ResultPanel } from "../components/K6ResultPanel";
import { LoadTestPanel } from "../components/LoadTestPanel";
import { MetricCard } from "../components/MetricCard";
import { DetailSection } from "../components/DetailSection";
import { LiveScalingPanel } from "../components/LiveScalingPanel";
import { ExperimentOutcome } from "../components/ExperimentOutcome";
import { useTelemetryHistory } from "../hooks/useTelemetryHistory";
import { SystemTopology } from "../components/SystemTopology";
import { TelemetryPanels } from "../components/TelemetryPanels";
import type { MetricsSummary, StartRunRequest, RunResult, RunState, WarmupState, LabConfiguration } from "../lab-types";
import { labApi } from "../lib/lab-api";

const integer = (value: number) => Math.round(value).toLocaleString();
const percent = (value: number) => `${value.toFixed(value >= 10 ? 1 : 2)}%`;
const milliseconds = (value: number) => `${value.toFixed(value >= 100 ? 0 : 1)}ms`;

export function ScaleLabPage() {
  const history = useTelemetryHistory();
  const [statusKnown, setStatusKnown] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [summary, setSummary] = useState<MetricsSummary | null>(null);
  const [run, setRun] = useState<RunState | null>(null);
  const [metricsLoading, setMetricsLoading] = useState(true);
  const [metricsError, setMetricsError] = useState<string | null>(null);
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

  const metrics = summary?.metrics;
  const noTelemetry = summary && summary.unavailable.length === Object.keys(summary.metrics).length;
  const telemetryMessage = metricsError ?? (noTelemetry ? "Prometheus returned no samples for the dashboard metrics" : null);

  return (
    <main className="lab-page">
      <header className="lab-intro">
        <div>
          <p className="eyebrow">Real infrastructure. Observable engineering.</p>
          <h1>Watch Kubernetes<br className="hidden sm:block" /> <span>adapt to traffic.</span></h1>
        </div>
        <div className="intro-context">
          <p>Send requests to a real ecommerce app. Watch its API servers scale as demand changes.</p>
          <a href="https://github.com/verma359211/Scale-LAB" target="_blank" rel="noreferrer">Explore the source <span aria-hidden="true">↗</span></a>
          <span>Node.js · Redis · PostgreSQL · k6</span>
        </div>
      </header>

      <div className="experiment-workspace">
        <LoadTestPanel
          run={run} configuration={configuration} warmup={warmup} warmupError={warmupError}
          statusKnown={statusKnown} actionPending={actionPending} actionError={controlError ?? statusError}
          onStart={startRun} onStop={stopRun} onReset={resetBenchmark} onRestore={restoreWarmup} resetNotice={resetNotice}
        />
        <div className="min-w-0">
          <LiveScalingPanel summary={summary} data={history.data} loading={metricsLoading} error={telemetryMessage}
            historyError={history.error} windowMinutes={history.windowMinutes} onWindowChange={history.setWindowMinutes} />
          <div className="live-quality" aria-label="Current response quality">
            <span><strong>{metrics?.p95LatencyMs == null ? "—" : milliseconds(metrics.p95LatencyMs)}</strong> p95 latency</span>
            <span><strong>{metrics?.httpErrorRate == null ? "—" : percent(metrics.httpErrorRate)}</strong> server errors</span>
            <span>Rolling 30s · p95: 95% of API responses are faster</span>
          </div>
        </div>
      </div>

      <ExperimentOutcome run={run} result={runResult} data={history.data} error={resultError} />

      <div className="explore-heading"><h2>Follow the evidence.</h2><p>Go deeper when you’re curious.</p></div>
      <DetailSection id="detailed-metrics" title="Detailed Metrics" description="Per-pod traffic, CPU, latency, errors, database & cache">
        <section aria-label="Current metrics" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard label="Current RPS" value={metrics?.requestRps} format={integer} loading={metricsLoading} detail="30s rolling · API requests" />
          <MetricCard label="Ingress RPS" value={metrics?.ingressRps} format={integer} loading={metricsLoading} detail="30s rolling · public /api" />
          <MetricCard label="p95 latency" value={metrics?.p95LatencyMs} format={milliseconds} loading={metricsLoading} detail="30s rolling" emptyText="No recent traffic" />
          <MetricCard label="p99 latency" value={metrics?.p99LatencyMs} format={milliseconds} loading={metricsLoading} detail="30s rolling" emptyText="No recent traffic" />
          <MetricCard label="HTTP errors" value={metrics?.httpErrorRate} format={percent} loading={metricsLoading} detail="30s rolling · 5xx rate" emptyText="No recent traffic" />
          <MetricCard label="API Pods" value={metrics?.apiPodCount} format={integer} loading={metricsLoading} detail={`Desired: ${metrics?.desiredPodCount == null ? "—" : integer(metrics.desiredPodCount)}`} />
          <MetricCard label="API CPU" value={metrics?.apiCpuPercent} format={percent} loading={metricsLoading}
            detail={`${metrics?.apiCpuMillicores == null ? "—" : Math.round(metrics.apiCpuMillicores) + "m"} avg / pod · 250m request`}
            help="Average API CPU relative to the Kubernetes CPU request. 100% is the request, not the CPU limit." />
          <MetricCard label="Redis hit ratio" value={metrics?.redisHitRatio} format={percent} loading={metricsLoading} detail="30s rolling · product cache" emptyText="No recent cache traffic" />
        </section>
        <TelemetryPanels data={history.data} windowMinutes={history.windowMinutes} />
      </DetailSection>
      <DetailSection id="run-details" title="Run Details" description="k6 results, cleanup status, event timeline & raw output">
        <K6ResultPanel run={run} result={runResult} error={resultError} />
        <LabActivityFeed run={run} />
      </DetailSection>
      <DetailSection id="architecture" title="How It Works" description="The real request path, autoscaling & the companion Store">
        <div className="grid gap-5 text-sm leading-6 text-slate-600 md:grid-cols-3">
          <div><h3 className="font-semibold text-slate-950">Why scale?</h3><p>Extra API servers share growing demand. Kubernetes watches CPU and requests capacity; new pods must become Ready before receiving traffic. Adding servers is not instant.</p></div>
          <div><h3 className="font-semibold text-slate-950">A real application</h3><p>The <a className="text-teal-800 underline" href="/store">Demo Store</a> uses the same product and order APIs. Redis caches reads, while two PostgreSQL shards persist products and orders. Mixed tests use separate benchmark inventory.</p></div>
          <div><h3 className="font-semibold text-slate-950">Evidence, not animation</h3><p>k6 runs on a separate VM. Prometheus measures the cluster; this dashboard reads its metrics. Grafana provides deeper monitoring. Shared traffic and scrape timing can affect what you observe.</p></div>
        </div>
        <SystemTopology summary={summary} />
      </DetailSection>
      <footer className="lab-footer"><span>Built to make system behavior visible.</span><a href="/store">Try the Store →</a><a href="https://github.com/verma359211/Scale-LAB" target="_blank" rel="noreferrer">Read the code ↗</a></footer>
    </main>
  );
}
