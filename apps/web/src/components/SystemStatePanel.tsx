import type { MetricsSummary, RunResult, RunState } from "../lab-types";
import { deriveSystemState, HPA_TARGET_PERCENT } from "../lib/system-state";

const toneClasses = {
  neutral: "border-slate-200 bg-slate-50 text-slate-700",
  active: "border-blue-200 bg-blue-50 text-blue-800",
  warning: "border-amber-200 bg-amber-50 text-amber-800",
  success: "border-emerald-200 bg-emerald-50 text-emerald-800",
  danger: "border-rose-200 bg-rose-50 text-rose-800",
};

const isActive = (status: RunState["status"] | undefined) => (
  status === "preparing" || status === "starting" || status === "running" || status === "stopping" || status === "resetting" || status === "restoring"
);

export function SystemStatePanel({ run, summary, result }: {
  run: RunState | null;
  summary: MetricsSummary | null;
  result: RunResult | null;
}) {
  const state = deriveSystemState(run, summary);
  const currentRps = summary?.metrics.requestRps;
  const actualLabel = isActive(run?.status) ? "Current" : "Achieved";
  const actualRps = isActive(run?.status) ? currentRps : result?.summary?.achievedRps;
  const ready = summary?.metrics.apiPodCount;
  const desired = summary?.metrics.desiredPodCount;

  return (
    <section className="grid gap-3 sm:grid-cols-3 lg:grid-cols-[minmax(0,1.5fr)_repeat(3,minmax(0,0.65fr))]" aria-labelledby="system-state-title">
      <div className={`rounded-xl border p-4 sm:col-span-3 lg:col-span-1 ${toneClasses[state.tone]}`}>
        <p className="text-xs font-semibold uppercase tracking-[0.12em] opacity-70">System state</p>
        <h2 id="system-state-title" className="mt-1 text-base font-semibold">{state.label}</h2>
        <p className="mt-1 text-sm opacity-90">{state.message}</p>
      </div>
      <StateValue label="Target" value={run ? `${run.configuration.targetRps.toLocaleString()} RPS` : "--"} />
      <StateValue label={actualLabel} value={actualRps == null ? "--" : `${actualRps.toLocaleString(undefined, { maximumFractionDigits: 1 })} RPS`} />
      <StateValue
        label="HPA"
        value={ready == null || desired == null ? "--" : `${Math.round(ready)} ready / ${Math.round(desired)} desired`}
        detail={`${HPA_TARGET_PERCENT}% CPU target`}
      />
    </section>
  );
}

function StateValue({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">{label}</p>
      <p className="mt-2 font-mono text-lg font-semibold text-slate-950">{value}</p>
      {detail && <p className="mt-1 text-xs text-slate-500">{detail}</p>}
    </div>
  );
}
