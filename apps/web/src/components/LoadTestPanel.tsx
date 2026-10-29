import { useEffect, useState } from "react";
import type { LabConfiguration, StartRunRequest, RunState, TestType, WarmupState } from "../lab-types";

type Props = {
  run: RunState | null;
  configuration: LabConfiguration | null;
  warmup: WarmupState | null;
  warmupError: string | null;
  actualRps?: number | null;
  actionPending: boolean;
  actionError: string | null;
  onStart: (input: StartRunRequest) => Promise<void>;
  onStop: () => Promise<void>;
  onReset: () => Promise<void>;
  onRestore: () => Promise<void>;
  resetNotice: string | null;
};
const names: Record<TestType, string> = { static: "Static reads", mixed: "Mixed reads / writes", ramp: "Autoscaling ramp", spike: "Traffic spike" };
const button = "rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold disabled:opacity-40";
const active = (status?: RunState["status"]) => ["preparing", "starting", "running", "stopping", "resetting", "restoring"].includes(status ?? "");

export function LoadTestPanel({ run, configuration, warmup, warmupError, actualRps, actionPending, actionError, onStart, onStop, onReset, onRestore, resetNotice }: Props) {
  const [selected, setSelected] = useState("autoscaling");
  const [advanced, setAdvanced] = useState(false);
  const [custom, setCustom] = useState(false);
  const [warmStart, setWarmStart] = useState(false);
  const [type, setType] = useState<TestType>("static");
  const [targetRps, setTargetRps] = useState(4_000);
  const [duration, setDuration] = useState("4m");
  const [readPercent, setReadPercent] = useState(70);
  const [pre, setPre] = useState<number | undefined>();
  const [maximum, setMaximum] = useState<number | undefined>();
  const [now, setNow] = useState(Date.now());
  const isActive = active(run?.status);
  const disabled = isActive || actionPending || !configuration?.controlsEnabled;
  const preset = configuration?.presets.find((item) => item.id === selected);
  const prepared = warmup?.status === "ready" || warmup?.status === "warming";
  const preVus = pre ?? configuration?.generator?.preAllocatedVUs;
  const maxVus = maximum ?? configuration?.generator?.maxVUs;
  const validTarget = Number.isSafeInteger(targetRps) && targetRps >= 50;
  const validVus = !!preVus && !!maxVus && Number.isSafeInteger(preVus) && Number.isSafeInteger(maxVus)
    && preVus > 0 && maxVus >= preVus && maxVus <= (configuration?.generator?.vuBudget ?? 0);
  const elapsed = run ? Math.max(0, Math.floor(((run.endedAt ? Date.parse(run.endedAt) : now) - Date.parse(run.startedAt)) / 1_000)) : 0;

  useEffect(() => {
    if (!isActive) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [isActive]);

  async function start() {
    if (custom) await onStart({ type, targetRps, duration, preAllocatedVUs: preVus, maxVUs: maxVus, warmStart,
      ...(type === "mixed" ? { readPercent, writePercent: 100 - readPercent } : {}) });
    else await onStart({ preset: selected, warmStart });
  }

  return <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm" aria-labelledby="load-test-title">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h2 id="load-test-title" className="text-lg font-semibold">Run a Load Test</h2><p className="mt-1 text-sm text-slate-500">Choose a scenario, start it, and watch the system respond below.</p></div>
      <span role="status" className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">{run?.status === "preparing" ? `Preparing API pods - ${warmup?.readyReplicas ?? "--"}/${warmup?.targetReplicas ?? 5} ready` : run?.status === "restoring" ? "Restoring normal autoscaling" : run?.status === "resetting" ? "Resetting benchmark data" : run?.status === "starting" ? "Starting load test" : run?.status === "running" ? "Load test running" : run?.status === "completed" ? "Test completed" : run?.status ?? "Idle"}</span>
    </div>
    {!configuration && <p className="mt-4 text-sm text-amber-700">Connecting to scenario configuration…</p>}
    {configuration && !configuration.controlsEnabled && <p className="mt-4 text-sm text-amber-700">Tests are paused by the operator. Live telemetry remains available.</p>}
    <div className="mt-5 grid gap-3 lg:grid-cols-3">
      {configuration?.presets.map((item) => <button key={item.id} type="button" disabled={disabled} aria-pressed={!custom && selected === item.id} onClick={() => { setSelected(item.id); setCustom(false); }}
        className={"rounded-xl border p-4 text-left transition disabled:opacity-60 " + (!custom && selected === item.id ? "border-blue-500 bg-blue-50 ring-1 ring-blue-500" : "border-slate-200 hover:border-slate-400")}>
        <span className="block text-sm font-semibold">{item.name}</span>
        <span className="mt-2 block text-sm leading-6 text-slate-600">{item.description}</span>
        <span className="mt-3 block text-xs font-medium text-blue-700">{item.configuration.duration} · {names[item.configuration.type]}</span>
        <span className="mt-2 block text-xs leading-5 text-slate-500">{item.profile}</span>
      </button>)}
    </div>
    {!custom && preset && <div className="mt-4 rounded-lg bg-slate-50 p-4 text-sm text-slate-600">
      <p><strong>Watch for:</strong> {preset.observe}</p><p className="mt-2">{preset.warmup}</p>
      {selected === "autoscaling" && ((warmup?.readyReplicas ?? 0) > (warmup?.baselineReplicas ?? 2) || prepared) && <p className="mt-2 text-amber-700">The cluster is already above its baseline. Restore normal autoscaling and let HPA settle for a clearer scale-up demonstration.</p>}
    </div>}
    <details open={advanced} onToggle={(event) => setAdvanced(event.currentTarget.open)} className="mt-5 rounded-lg border border-slate-200">
      <summary className="cursor-pointer px-4 py-3 text-sm font-semibold">Advanced Options</summary>
      <div className="space-y-4 border-t border-slate-200 p-4">
        <label className="block text-sm font-semibold"><input type="checkbox" checked={warmStart} disabled={disabled || warmup?.status === "disabled"} onChange={(event) => setWarmStart(event.target.checked)} className="mr-2" />Start with warm API pods</label>
        <p className="text-xs text-slate-500">Prepare additional API pods before starting the test for more consistent high-load performance.</p>
        {!custom && selected === "autoscaling" && warmStart && <p className="text-xs text-amber-700">Starting with warm pods may hide the autoscaling demonstration.</p>}
        <p className="text-xs text-slate-500">{warmupError ?? warmup?.message}</p>
        {prepared && <button type="button" onClick={() => void onRestore()} disabled={isActive || actionPending} className={button}>Restore Normal Autoscaling</button>}
        <label className="block text-sm font-semibold"><input type="checkbox" checked={custom} disabled={disabled} onChange={(event) => setCustom(event.target.checked)} className="mr-2" />Customize workload</label>
        <fieldset disabled={disabled || !custom} className="space-y-4 disabled:opacity-50">
        <div className="grid gap-4 sm:grid-cols-3">
          <label className="text-sm">Workload<select value={type} disabled={disabled} onChange={(event) => setType(event.target.value as TestType)} className="control-field mt-2">{Object.entries(names).map(([value, name]) => <option key={value} value={value}>{name}</option>)}</select></label>
          <label className="text-sm">Target RPS<input type="number" min={50} step={50} value={targetRps} disabled={disabled} onChange={(event) => setTargetRps(Number(event.target.value))} className="control-field mt-2" /></label>
          <label className="text-sm">Duration<select value={duration} disabled={disabled} onChange={(event) => setDuration(event.target.value)} className="control-field mt-2">{["1m", "2m", "4m", "10m"].map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
        </div>
        {type === "mixed" && <label className="block text-sm">Reads {readPercent}% / writes {100 - readPercent}%<input aria-label="Read percentage" type="range" min={0} max={100} step={5} value={readPercent} disabled={disabled} onChange={(event) => setReadPercent(Number(event.target.value))} className="mt-2 block w-full" /><span className="text-xs text-slate-500">Writes use only benchmark products 10001–10100.</span></label>}
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-sm">Preallocated VUs<input type="number" min={1} value={preVus ?? ""} disabled={disabled} onChange={(event) => setPre(Number(event.target.value))} className="control-field mt-2" /></label>
          <label className="text-sm">Maximum VUs<input type="number" min={1} max={configuration?.generator?.vuBudget} value={maxVus ?? ""} disabled={disabled} onChange={(event) => setMaximum(Number(event.target.value))} className="control-field mt-2" /></label>
        </div>
        <p className="text-xs leading-5 text-slate-500">Target RPS is offered traffic, not guaranteed capacity. VUs are workers needed while requests are in flight. Requests exceeding the VM budget are rejected, never silently reduced.</p>
        {!validTarget && <p className="text-sm text-rose-700">Enter a whole target RPS of at least 50.</p>}
        {!validVus && <p className="text-sm text-rose-700">Use positive VUs: preallocated ≤ maximum ≤ configured VM budget.</p>}
        {configuration?.generator && <p className="text-xs text-slate-500">Generator: {configuration.generator.preAllocatedVUs} preallocated / {configuration.generator.maxVUs} max VUs by default · {configuration.generator.vuBudget} VU budget · {configuration.generator.cpus} CPU cores · {configuration.generator.memory} memory.</p>}
        {run?.resources && <p className="text-xs text-slate-500">Current run: {run.resources.preAllocatedVUs} preallocated / {run.resources.maxVUs} maximum VUs.</p>}
        </fieldset>
      </div>
    </details>
    {run && <p className="mt-4 text-sm text-slate-600">{names[run.type]} · Target {run.configuration.targetRps.toLocaleString()} RPS {run.type === "ramp" || run.type === "spike" ? "peak" : ""} · Actual {actualRps == null ? "--" : Math.round(actualRps).toLocaleString()} RPS (30s rolling) · Pods {warmup?.readyReplicas ?? "--"} ready / {warmup?.desiredReplicas ?? "--"} desired · Workload {run.configuration.duration} · Elapsed {Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, "0")}</p>}
    {run?.failureReason && <p role="alert" className="mt-3 text-sm text-rose-700">{run.failureReason}</p>}
    {actionError && <p role="alert" className="mt-4 rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{actionError}</p>}
    {resetNotice && <p className="mt-4 text-sm text-emerald-700">{resetNotice}</p>}
    <div className="mt-5 flex flex-wrap gap-3">
      <button type="button" disabled={disabled || (!warmStart && warmup?.status === "warming") || (custom ? !validTarget || !validVus : !preset)} onClick={() => void start()} className="rounded-lg bg-slate-950 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-40">{actionPending ? "Working…" : "Start Test"}</button>
      <button type="button" disabled={!isActive || actionPending || run?.status === "stopping" || run?.status === "resetting" || run?.status === "restoring"} onClick={() => void onStop()} className={button}>{run?.status === "preparing" ? "Cancel preparation" : "Stop Test"}</button>
      <button type="button" disabled={disabled} onClick={() => void onReset()} className="ml-auto px-3 py-2.5 text-xs text-slate-500 underline disabled:opacity-40">Reset benchmark data</button>
    </div>
  </section>;
}
