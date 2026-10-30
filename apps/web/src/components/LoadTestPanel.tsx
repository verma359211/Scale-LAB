import { useEffect, useState } from "react";
import { isRunActive, readableDuration, runLabel } from "../lib/experiment-presentation";
import type { LabConfiguration, StartRunRequest, RunState, TestType, WarmupState } from "../lab-types";

type Props = {
  run: RunState | null;
  configuration: LabConfiguration | null;
  warmup: WarmupState | null;
  warmupError: string | null;
  statusKnown: boolean;
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
const scenarioLabels: Record<string, string> = { autoscaling: "Autoscaling", spike: "Traffic spike", throughput: "High throughput" };

export function LoadTestPanel({ run, configuration, warmup, warmupError, statusKnown, actionPending, actionError, onStart, onStop, onReset, onRestore, resetNotice }: Props) {
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
  const isActive = isRunActive(run);
  const disabled = isActive || actionPending || !configuration?.controlsEnabled || !statusKnown;
  const preset = configuration?.presets.find((item) => item.id === selected);
  const observedPreset = isActive ? configuration?.presets.find((item) => item.configuration.type === run?.type) : preset;
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

  return <section className="experiment-launcher" aria-labelledby="load-test-title">
    <h2 id="load-test-title" className="eyebrow">01 / {isActive ? "Experiment in progress" : "Choose your experiment"}</h2>
    {!configuration && <p className="lab-notice mt-3">Connecting to scenario configuration…</p>}
    {configuration && !configuration.controlsEnabled && <p className="lab-notice mt-3">Tests are paused by the operator. Live telemetry remains available.</p>}
    {!statusKnown && <p role="status" className="mt-3 text-sm text-slate-600">Checking for an active experiment…</p>}
    {!isActive && !!configuration?.presets.length && <div className="scenario-switch" role="group" aria-label="Experiment scenario">
      {configuration?.presets.map((item) => <button key={item.id} type="button" disabled={disabled} aria-label={item.name} aria-pressed={!custom && selected === item.id} onClick={() => { setSelected(item.id); setCustom(false); }}>
        {scenarioLabels[item.id] ?? item.name}
      </button>)}
    </div>}
    {!isActive && <div className="scenario-description">
      <h3>{custom ? names[type] : preset?.name ?? "Watch Kubernetes Autoscaling"}</h3>
      <p>{custom ? "Use your custom settings to investigate the system’s behavior." : preset?.description ?? "Increase traffic and watch the system adapt."}</p>
      <div className="scenario-facts"><span>{custom ? readableDuration(duration) : preset ? readableDuration(preset.configuration.duration) : "Duration unavailable"}</span><span>{custom ? targetRps.toLocaleString() : preset?.configuration.targetRps.toLocaleString() ?? "—"} target req/s{["ramp", "spike"].includes(custom ? type : preset?.configuration.type ?? "ramp") ? " peak" : ""}</span></div>
    </div>}
    {isActive && run && <div className="run-progress">
      <p role="status" className="font-semibold">{runLabel(run)}</p>
      <p className="mt-1 text-xs text-slate-600">{names[run.type]}</p>
      <p className="mt-2 text-sm text-slate-600">{run.status === "preparing" ? `Waiting for Ready pods: ${warmup?.readyReplicas ?? "—"} / ${warmup?.targetReplicas ?? "—"}. Traffic has not started.` : run.status === "resetting" ? "Removing test orders and restoring benchmark inventory before completion." : run.status === "restoring" ? "The workload has ended. Restoring the normal autoscaling policy." : run.status === "stopping" ? "Waiting for traffic to stop. Required cleanup will follow." : run.status === "starting" ? "The controller is starting k6 on the load-generator VM." : "A shared experiment is in progress. Watch the live system alongside it."}</p>
      <dl className="mt-4 flex flex-wrap gap-5"><div><dt className="text-xs text-slate-600">Elapsed workflow</dt><dd className="font-mono text-2xl">{Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, "0")}</dd></div><div><dt className="text-xs text-slate-600">Requested {["ramp", "spike"].includes(run.type) ? "peak" : "rate"}</dt><dd className="font-mono text-2xl">{run.configuration.targetRps.toLocaleString()} <small className="text-xs">req/s</small></dd></div></dl>
      <p className="mt-2 text-xs text-slate-600">Workload: {readableDuration(run.configuration.duration)} · elapsed includes preparation and cleanup.</p>
    </div>}
    <div className="launcher-action">
      {isActive ? <button type="button" disabled={!statusKnown || actionPending || ["stopping", "resetting", "restoring"].includes(run!.status)} onClick={() => void onStop()} className="stop-experiment">{actionPending ? "Working…" : run?.status === "preparing" ? "Cancel preparation" : "Stop experiment"}</button> :
      <button type="button" disabled={disabled || (!warmStart && warmup?.status === "warming") || (custom ? !validTarget || !validVus : !preset)} onClick={() => void start()} className="start-experiment">{actionPending ? "Sending request…" : custom ? "Start custom experiment" : selected === "autoscaling" ? "Start Autoscaling Demo" : selected === "spike" ? "Start Traffic Spike" : "Start High Throughput"} <span aria-hidden="true">↗</span></button>}
      {!isActive && <p className="mt-2 text-xs text-slate-600">Real requests · shared cloud infrastructure · one test at a time</p>}
    </div>
    {actionError && <p role="alert" className="mt-3 rounded-lg bg-rose-50 p-3 text-sm text-rose-800">{actionError}</p>}
    {isActive && run?.failureReason && <p role="alert" className="mt-3 text-sm text-rose-800">{run.failureReason}</p>}
    {(!custom || isActive) && observedPreset && <div className="watch-note">
      <p><strong>What to watch</strong><br />{observedPreset.observe}</p>
      {!isActive && selected === "autoscaling" && ((warmup?.readyReplicas ?? 0) > (warmup?.baselineReplicas ?? 2) || prepared) && <p className="mt-2 text-amber-800">Pods are already above baseline. Let normal autoscaling settle for a clearer scale-up demonstration.</p>}
    </div>}
    <details open={advanced} onToggle={(event) => setAdvanced(event.currentTarget.open)} className="advanced-options">
      <summary className="cursor-pointer px-4 py-3 text-sm font-semibold">Advanced Options</summary>
      <div className="space-y-4 border-t border-slate-200 p-4">
        <label className="block text-sm font-semibold"><input type="checkbox" checked={warmStart} disabled={disabled || warmup?.status === "disabled"} onChange={(event) => setWarmStart(event.target.checked)} className="mr-2" />Start with warm API pods</label>
        <p className="text-xs text-slate-500">Prepare additional API pods before starting the test for more consistent high-load performance.</p>
        {!custom && selected === "autoscaling" && warmStart && <p className="text-xs text-amber-700">Starting with warm pods may hide the autoscaling demonstration.</p>}
        <p className="text-xs text-slate-500">{warmupError ?? warmup?.message}</p>
        {prepared && <button type="button" onClick={() => void onRestore()} disabled={!statusKnown || isActive || actionPending} className={button}>Restore Normal Autoscaling</button>}
        <label className="block text-sm font-semibold"><input type="checkbox" checked={custom} disabled={disabled} onChange={(event) => setCustom(event.target.checked)} className="mr-2" />Customize workload</label>
        <fieldset disabled={disabled || !custom} className="space-y-4 disabled:opacity-50">
        <div className="grid gap-4">
          <label className="text-sm">Workload<select aria-label="Workload" value={type} disabled={disabled} onChange={(event) => setType(event.target.value as TestType)} className="control-field mt-2">{Object.entries(names).map(([value, name]) => <option key={value} value={value}>{name}</option>)}</select></label>
          <label className="text-sm">Target RPS<input type="number" min={50} step={50} value={targetRps} disabled={disabled} onChange={(event) => setTargetRps(Number(event.target.value))} className="control-field mt-2" /></label>
          <label className="text-sm">Duration<select aria-label="Duration" value={duration} disabled={disabled} onChange={(event) => setDuration(event.target.value)} className="control-field mt-2">{["1m", "2m", "4m", "10m"].map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
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
        <button type="button" disabled={disabled} onClick={() => void onReset()} className="min-h-11 text-sm text-slate-600 underline disabled:opacity-40">Reset benchmark data</button>
        {resetNotice && <p role="status" className="text-sm text-teal-800">{resetNotice}</p>}
        {!custom && preset && <p className="text-xs leading-5 text-slate-600">{preset.profile} {preset.warmup}</p>}
      </div>
    </details>

  </section>;
}
