import { useState } from "react";
import type { RunResult, RunState } from "../lab-types";

type Props = {
  run: RunState | null;
  result: RunResult | null;
  error: string | null;
};

const active = (status: RunState["status"] | undefined) => (
  status === "preparing" || status === "starting" || status === "running" || status === "stopping" || status === "resetting" || status === "restoring"
);

export function K6ResultPanel({ run, result, error }: Props) {
  const [copied, setCopied] = useState(false);
  const summary = result?.summary;
  const output = [
    result?.stdout?.trim(),
    result?.stderr?.trim() ? `STDERR\n${result.stderr.trim()}` : "",
  ].filter(Boolean).join("\n\n");
  const cleanupShards = run?.cleanup?.shards ?? [];
  const ordersDeleted = cleanupShards.reduce((total, shard) => total + (shard.ordersDeleted ?? 0), 0);
  const productsRestored = cleanupShards.reduce((total, shard) => total + (shard.productsRestored ?? 0), 0);

  async function copyOutput() {
    if (!output) return;
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(output);
    } else {
      const textarea = document.createElement("textarea");
      textarea.value = output;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.append(textarea);
      textarea.select();
      document.execCommand("copy");
      textarea.remove();
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1_500);
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm" aria-labelledby="load-result-title">
      <div>
        <h2 id="load-result-title" className="text-base font-semibold text-slate-950">Load Test Result</h2>
        <p className="mt-1 text-sm text-slate-500">Final metrics appear after k6 exits. Detailed output is available during the run.</p>
      </div>

      {!run && <p className="mt-5 rounded-lg bg-slate-50 px-4 py-5 text-sm text-slate-500">Run a test to generate a result.</p>}
      {run && active(run.status) && <p className="mt-5 rounded-lg bg-blue-50 px-4 py-5 text-sm text-blue-700">Result available when the test completes.</p>}
      {error && <p role="alert" className="mt-5 rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>}
      {run?.failureReason && <p role="alert" className="mt-4 text-sm text-rose-700">{run.failureReason}</p>}

      {result?.available && (
        <>
          <div className="mt-5 grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4 md:grid-cols-[minmax(0,1fr)_minmax(260px,0.7fr)]">
            <div>
              <p className="text-sm font-semibold text-slate-900">{testName(run?.type)} result</p>
              <p className="mt-1 text-sm text-slate-600">
                Target {run?.configuration.targetRps.toLocaleString()} RPS · {run?.configuration.duration}
                {run?.type === "mixed" && ` · ${run.configuration.readPercent ?? 70}% read / ${run.configuration.writePercent ?? 30}% write`}
              </p>
              <p className="mt-2 text-sm text-slate-700">
                {summary?.achievedRps?.toLocaleString(undefined, { maximumFractionDigits: 2 }) ?? "--"} RPS · {summary?.failureRate == null ? "--" : `${summary.failureRate}%`} failures · {summary?.completedRequests?.toLocaleString() ?? "--"} requests
              </p>
            </div>
            {run?.cleanup?.required && (
              <div className={`rounded-md border px-3 py-2 ${run.cleanup.status === "failed" ? "border-rose-200 bg-rose-50" : "border-emerald-200 bg-emerald-50"}`}>
                <p className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-600">Benchmark cleanup</p>
                <p className="mt-1 text-sm font-semibold capitalize text-slate-900">{run.cleanup.status}</p>
                {run.cleanup.status === "completed" && <p className="mt-1 text-xs leading-5 text-slate-600">{ordersDeleted.toLocaleString()} test orders removed · {productsRestored.toLocaleString()} benchmark products restored</p>}
                {run.cleanup.status === "failed" && <p className="mt-1 text-xs leading-5 text-rose-700">{run.cleanup.failureReason ?? "Cleanup could not be completed safely."}</p>}
              </div>
            )}
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            <ResultValue label="Achieved RPS" value={summary?.achievedRps?.toLocaleString(undefined, { maximumFractionDigits: 1 })} />
            <ResultValue label="Requests" value={summary?.completedRequests?.toLocaleString()} />
            <ResultValue label="Failure rate" value={summary?.failureRate == null ? undefined : `${summary.failureRate}%`} />
            <ResultValue label="p95" value={summary?.p95} />
            <ResultValue label="p99" value={summary?.p99} />
            <ResultValue label="Dropped" value={summary?.droppedIterations?.toLocaleString()} />
          </div>

          {run?.type === "mixed" && (summary?.readRequests != null || summary?.writeRequests != null || summary?.successfulOrders != null) && (
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <ResultValue label="Read requests" value={summary?.readRequests?.toLocaleString()} />
              <ResultValue label="Write requests" value={summary?.writeRequests?.toLocaleString()} />
              <ResultValue label="Successful orders" value={summary?.successfulOrders?.toLocaleString()} />
            </div>
          )}

        </>
      )}
          <details className="mt-5 overflow-hidden rounded-lg border border-slate-300">
            <summary className="cursor-pointer bg-slate-100 px-4 py-3 text-sm font-semibold text-slate-800">Detailed k6 Output</summary>
            <div className="flex justify-end border-y border-slate-700 bg-slate-900 px-3 py-2">
              <button type="button" onClick={() => void copyOutput()} disabled={!output} className="rounded border border-slate-600 px-2.5 py-1 text-xs font-medium text-slate-200 hover:bg-slate-800 disabled:opacity-40">
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
            <pre className="max-h-[32rem] overflow-auto whitespace-pre-wrap bg-slate-950 p-4 font-mono text-xs leading-5 text-slate-100">{output || (run && active(run.status) ? "Waiting for k6 output. Quiet runs may only produce a final summary." : "No k6 output available.")}</pre>
          </details>
    </section>
  );
}

function ResultValue({ label, value }: { label: string; value: string | undefined }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className="mt-1 font-mono text-lg font-semibold text-slate-950">{value ?? "--"}</p>
    </div>
  );
}

function testName(type: RunState["type"] | undefined) {
  if (type === "static") return "Static Read Test";
  if (type === "mixed") return "Mixed Load Test";
  if (type === "ramp") return "Autoscaling Ramp Test";
  if (type === "spike") return "Spike Test";
  return "Load Test";
}
