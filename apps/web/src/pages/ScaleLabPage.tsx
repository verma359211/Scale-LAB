import { useCallback, useEffect, useState } from "react";
import { LabActivityFeed } from "../components/LabActivityFeed";
import { K6ResultPanel } from "../components/K6ResultPanel";
import { LoadTestPanel } from "../components/LoadTestPanel";
import { MetricCard } from "../components/MetricCard";
import { SystemStatePanel } from "../components/SystemStatePanel";
import { SystemTopology } from "../components/SystemTopology";
import { TelemetryPanels } from "../components/TelemetryPanels";
import { WhatToWatch } from "../components/WhatToWatch";
import type { MetricsSummary, StartRunRequest, RunResult, RunState, WarmupState, LabConfiguration } from "../lab-types";
import { labApi } from "../lib/lab-api";

const integer = (value: number) => Math.round(value).toLocaleString();
const percent = (value: number) => `${value.toFixed(value >= 10 ? 1 : 2)}%`;
const milliseconds = (value: number) => `${value.toFixed(value >= 100 ? 0 : 1)}ms`;

export function ScaleLabPage() {
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
      } else {
        setControlError("Test status is unavailable; verify the controller before starting another test.");
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
    <main>
      <section className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-[1440px] px-5 py-10 sm:px-8 lg:py-14">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-600">Distributed Systems &amp; Performance Lab</p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">ScaleLab</h1>
              <p className="mt-3 max-w-3xl text-base leading-7 text-slate-600">Run controlled workloads against a Kubernetes-hosted application and watch load balancing, caching, autoscaling, database behavior, and latency respond in real time.</p>
              <p className="mt-3 font-mono text-xs text-slate-500">Node.js · Kubernetes · NGINX · Redis · PostgreSQL · Prometheus · k6</p>
            </div>
            <div className="flex items-center gap-2 self-start rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-600 lg:self-auto">
              <span className={`h-2 w-2 rounded-full ${telemetryMessage ? "bg-amber-500" : "bg-emerald-500"}`} />
              {telemetryMessage ? "Telemetry degraded" : "Live · 3s polling"}
            </div>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-[1440px] space-y-6 px-5 py-7 sm:px-8 lg:py-9">
        {telemetryMessage && (
          <div role="alert" className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            <span className="font-semibold">Metrics connection issue.</span> {telemetryMessage}. Existing chart data is retained while polling retries.
          </div>
        )}

        <LoadTestPanel
          run={run}
          configuration={configuration}
          warmup={warmup}
          warmupError={warmupError}
          actionPending={actionPending}
          actionError={controlError}
          onStart={startRun}
          onStop={stopRun}
          onReset={resetBenchmark}
          actualRps={summary?.metrics.requestRps}
          onRestore={restoreWarmup}
          resetNotice={resetNotice}
        />
        <SystemStatePanel run={run} summary={summary} result={runResult} />
        <section aria-label="Current metrics" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard label="Current RPS" value={metrics?.requestRps} format={integer} loading={metricsLoading} detail="30s rolling · API requests" />
          <MetricCard label="Ingress RPS" value={metrics?.ingressRps} format={integer} loading={metricsLoading} detail="30s rolling · public /api" />
          <MetricCard label="p95 latency" value={metrics?.p95LatencyMs} format={milliseconds} loading={metricsLoading} detail="30s rolling" emptyText="No recent traffic" />
          <MetricCard label="p99 latency" value={metrics?.p99LatencyMs} format={milliseconds} loading={metricsLoading} detail="30s rolling" emptyText="No recent traffic" />
          <MetricCard label="HTTP errors" value={metrics?.httpErrorRate} format={percent} loading={metricsLoading} detail="30s rolling · 5xx rate" emptyText="No recent traffic" />
          <MetricCard label="API Pods" value={metrics?.apiPodCount} format={integer} loading={metricsLoading} detail={`Desired: ${metrics?.desiredPodCount == null ? "--" : integer(metrics.desiredPodCount)}`} />
          <MetricCard
            label="API CPU"
            value={metrics?.apiCpuPercent}
            format={percent}
            loading={metricsLoading}
            detail={`${metrics?.apiCpuMillicores == null ? "--" : `${Math.round(metrics.apiCpuMillicores)}m`} avg / pod · 250m request`}
            help="Average API CPU usage relative to the Kubernetes CPU request (250m per pod). Pods may exceed 100% until reaching their configured CPU limit."
          />
          <MetricCard label="Redis hit ratio" value={metrics?.redisHitRatio} format={percent} loading={metricsLoading} detail="30s rolling · product cache" emptyText="No recent cache traffic" />
        </section>

        <WhatToWatch />
        <TelemetryPanels><K6ResultPanel run={run} result={runResult} error={resultError} /></TelemetryPanels>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(320px,0.8fr)]">
          <SystemTopology summary={summary} />
          <LabActivityFeed run={run} />
        </div>
      </div>
    </main>
  );
}
