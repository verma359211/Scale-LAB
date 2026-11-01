import { useEffect, useState } from "react";
import { isRunActive, readableDuration, runLabel } from "../lib/experiment-presentation";
import type { LabConfiguration, MetricsSummary, StartRunRequest, RunState, TestType, WarmupState } from "../lab-types";

type Props = {
  editorial?: boolean;
  metrics?: MetricsSummary["metrics"];
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

export function LoadTestPanel({ editorial = false, metrics, run, configuration, warmup, warmupError, statusKnown, actionPending, actionError, onStart, onStop, onReset, onRestore, resetNotice }: Props) {
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
  const displayType = custom ? type : preset?.configuration.type ?? type;
  const displayTarget = custom ? targetRps : preset?.configuration.targetRps ?? targetRps;
  const displayDuration = custom ? duration : preset?.configuration.duration ?? duration;
  const displayReads = custom ? readPercent : preset?.configuration.readPercent ?? readPercent;
  const preVus = pre ?? configuration?.generator?.preAllocatedVUs;
  const maxVus = maximum ?? configuration?.generator?.maxVUs;
  const validTarget = Number.isSafeInteger(targetRps) && targetRps >= 50;
  const validVus = !!preVus && !!maxVus && Number.isSafeInteger(preVus) && Number.isSafeInteger(maxVus)
    && preVus > 0 && maxVus >= preVus && maxVus <= (configuration?.generator?.vuBudget ?? 0);
  const elapsed = run ? Math.max(0, Math.floor(((run.endedAt ? Date.parse(run.endedAt) : now) - Date.parse(run.startedAt)) / 1_000)) : 0;

  useEffect(() => {
    if (!isActive) return;
    setAdvanced(false);
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [isActive]);

  async function start() {
    if (custom) await onStart({ type, targetRps, duration, preAllocatedVUs: preVus, maxVUs: maxVus, warmStart,
      ...(type === "mixed" ? { readPercent, writePercent: 100 - readPercent } : {}) });
    else await onStart({ preset: selected, warmStart });
  }

  function customize() {
    if (!custom && preset) {
      setType(preset.configuration.type);
      setTargetRps(preset.configuration.targetRps);
      setDuration(preset.configuration.duration);
      setReadPercent(preset.configuration.readPercent ?? 70);
    }
    setCustom(true);
  }
  const metric = (value: number | null | undefined, suffix = "") => value == null ? "—" : `${value.toLocaleString(undefined, { maximumFractionDigits: 1 })}${suffix}`;

  return <section data-active={isActive} className={`experiment-launcher${editorial ? " editorial-launcher" : ""}`} aria-labelledby="load-test-title">
    <h2 id="load-test-title" className={editorial ? `editorial-section-label${advanced ? " advanced-panel-title" : ""}` : "eyebrow"}>{editorial && advanced ? "Make it your experiment." : isActive ? "Experiment in progress" : "Choose your experiment"}</h2>
    {!configuration && <p className="lab-notice mt-3">Connecting to scenario configuration…</p>}
    {configuration && !configuration.controlsEnabled && <p className="lab-notice mt-3">Tests are paused by the operator. Live telemetry remains available.</p>}
    {!statusKnown && <p role="status" className="mt-3 text-sm text-slate-600">Checking for an active experiment…</p>}
    {!isActive && !!configuration?.presets.length && <div className="scenario-switch" role="group" aria-label="Experiment scenario">
      {configuration?.presets.map((item, index) => <button key={item.id} type="button" disabled={disabled} aria-label={item.name} aria-pressed={!custom && selected === item.id} onClick={() => { setSelected(item.id); setCustom(false); }}>
        {editorial ? <><span className="scenario-number">{String(index + 1).padStart(2, "0")}</span><span>{({ autoscaling: "Watch autoscaling", spike: "Sudden traffic spike", throughput: "Sustained throughput" } as Record<string, string>)[item.id] ?? item.name}</span><small>{readableDuration(item.configuration.duration)}</small><span aria-hidden="true">{!custom && selected === item.id ? "●" : "○"}</span></> : scenarioLabels[item.id] ?? item.name}
      </button>)}
    </div>}
    {!isActive && !editorial && <div className="scenario-description">
      <h3>{custom ? names[type] : preset?.name ?? "Watch Kubernetes Autoscaling"}</h3>
      <p>{custom ? "Use your custom settings to investigate the system’s behavior." : preset?.description ?? "Increase traffic and watch the system adapt."}</p>
      <div className="scenario-facts"><span>{custom ? readableDuration(duration) : preset ? readableDuration(preset.configuration.duration) : "Duration unavailable"}</span><span>{custom ? targetRps.toLocaleString() : preset?.configuration.targetRps.toLocaleString() ?? "—"} target req/s{["ramp", "spike"].includes(custom ? type : preset?.configuration.type ?? "ramp") ? " peak" : ""}</span></div>
    </div>}
    {isActive && run && <div className="run-progress">
      <p role="status" className="font-semibold">{runLabel(run)}</p>
      <p className="mt-1 text-xs text-slate-600">{names[run.type]}</p>
      <p className="mt-2 text-sm text-slate-600">{run.status === "preparing" ? `Ready pods: ${warmup?.readyReplicas ?? "—"} / ${warmup?.targetReplicas ?? "—"}. Traffic has not started.` : run.status === "resetting" ? "Restoring benchmark inventory before completion." : run.status === "restoring" ? "Restoring normal autoscaling." : run.status === "stopping" ? "Stopping traffic. Required cleanup follows." : run.status === "starting" ? "Starting k6 on the load-generator VM." : "A shared experiment is in progress."}</p>
      <dl className="mt-4 flex flex-wrap gap-5"><div><dt className="text-xs text-slate-600">Elapsed workflow</dt><dd className="font-mono text-2xl">{Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, "0")}</dd></div><div><dt className="text-xs text-slate-600">Requested {["ramp", "spike"].includes(run.type) ? "peak" : "rate"}</dt><dd className="font-mono text-2xl">{run.configuration.targetRps.toLocaleString()} <small className="text-xs">req/s</small></dd></div></dl>
      <p className="mt-2 text-xs text-slate-600">Workload: {readableDuration(run.configuration.duration)} · elapsed includes preparation and cleanup.</p>
      {editorial && <div className="run-live-details"><p className="hero-kicker">Live response</p><dl className="run-live-signals">
        <div><dt>Ready / desired</dt><dd>{metric(metrics?.apiPodCount)} / {metric(metrics?.desiredPodCount)}</dd></div>
        <div><dt>Incoming requests</dt><dd>{metric(metrics?.ingressRps, " /s")}</dd></div>
        <div><dt>p95 response time</dt><dd>{metric(metrics?.p95LatencyMs, "ms")}</dd></div>
        <div><dt>Server errors</dt><dd>{metric(metrics?.httpErrorRate, "%")}</dd></div>
      </dl><p className="run-live-caption">Live system values · rates over 30s · includes shared traffic</p>
      {run.events.length > 0 && <p className="run-latest-event">Latest event: {run.events[run.events.length - 1]!.message}</p>}</div>}
    </div>}
    <div className="launcher-action">
      {isActive ? <button type="button" disabled={!statusKnown || actionPending || ["stopping", "resetting", "restoring"].includes(run!.status)} onClick={() => void onStop()} className="stop-experiment">{actionPending ? "Working…" : run?.status === "preparing" ? "Cancel preparation" : "Stop experiment"}</button> :
      <button type="button" disabled={disabled || (!warmStart && warmup?.status === "warming") || (custom ? !validTarget || !validVus : !preset)} onClick={() => void start()} className="start-experiment">{actionPending ? "Sending request…" : custom ? "Start custom experiment" : selected === "autoscaling" ? "Start Autoscaling Demo" : selected === "spike" ? "Start Traffic Spike" : "Start High Throughput"} <span aria-hidden="true">↗</span></button>}
      {!isActive && <p className="mt-2 text-xs text-slate-600">Real requests · shared cloud infrastructure · one test at a time</p>}
    </div>
    {actionError && <p role="alert" className="mt-3 rounded-lg bg-rose-50 p-3 text-sm text-rose-800">{actionError}</p>}
    {isActive && run?.failureReason && <p role="alert" className="mt-3 text-sm text-rose-800">{run.failureReason}</p>}
    {!editorial && (!custom || isActive) && observedPreset && <div className="watch-note">
      <p><strong>What to watch</strong><br />{observedPreset.observe}</p>
      {!isActive && selected === "autoscaling" && ((warmup?.readyReplicas ?? 0) > (warmup?.baselineReplicas ?? 2) || prepared) && <p className="mt-2 text-amber-800">Pods are already above baseline. Let normal autoscaling settle for a clearer scale-up demonstration.</p>}
    </div>}
    {!isActive && <details open={advanced} onToggle={(event) => setAdvanced(event.currentTarget.open)} className="advanced-options">
      <summary className="cursor-pointer px-4 py-3 text-sm font-semibold">{editorial && advanced ? "← Basic settings" : "Advanced Options"}{editorial && !advanced && <span className="advanced-invitation">Tune your experiment ↗</span>}</summary>
      <div className="advanced-body">
        <fieldset disabled={disabled} className="advanced-fields disabled:opacity-50">
        <div className="advanced-form-group">
        <h3 className="advanced-group-title"><span>01</span> Shape the traffic</h3>
        <div className="advanced-main-fields grid gap-4">
          <label className="text-sm">Workload<select aria-label="Workload" value={displayType} disabled={disabled} onChange={(event) => { customize(); setType(event.target.value as TestType); }} className="control-field mt-2">{Object.entries(names).map(([value, name]) => <option key={value} value={value}>{name}</option>)}</select></label>
          <label className="text-sm">Target RPS<input type="number" min={50} step={50} value={displayTarget} disabled={disabled} onChange={(event) => { customize(); setTargetRps(Number(event.target.value)); }} className="control-field mt-2" /></label>
          <label className="text-sm">Duration<select aria-label="Duration" value={displayDuration} disabled={disabled} onChange={(event) => { customize(); setDuration(event.target.value); }} className="control-field mt-2">{[...new Set([displayDuration, "1m", "2m", "4m", "10m"])].map((value) => <option key={value} value={value}>{readableDuration(value)}</option>)}</select></label>
        </div>
        {displayType === "mixed" && <label className="block text-sm">Reads {displayReads}% / writes {100 - displayReads}%<input aria-label="Read percentage" type="range" min={0} max={100} step={5} value={displayReads} disabled={disabled} onChange={(event) => { customize(); setReadPercent(Number(event.target.value)); }} className="mt-2 block w-full" /><span className="text-xs text-slate-500">Writes use only benchmark products 10001–10100.</span></label>}
        </div>
        <div className="advanced-form-group">
        <h3 className="advanced-group-title"><span>02</span> Set the capacity</h3>
        <div className="advanced-vu-fields grid gap-4 sm:grid-cols-2">
          <label className="text-sm">Preallocated VUs<input type="number" min={1} value={preVus ?? ""} disabled={disabled} onChange={(event) => { customize(); setPre(Number(event.target.value)); }} className="control-field mt-2" /></label>
          <label className="text-sm">Maximum VUs<input type="number" min={1} max={configuration?.generator?.vuBudget} value={maxVus ?? ""} disabled={disabled} onChange={(event) => { customize(); setMaximum(Number(event.target.value)); }} className="control-field mt-2" /></label>
        </div>
        </div>
        {custom && !validTarget && <p className="text-sm text-rose-700">Enter a whole target RPS of at least 50.</p>}
        {custom && !validVus && <p className="text-sm text-rose-700">Use positive VUs: preallocated ≤ maximum ≤ configured VM budget.</p>}
        </fieldset>
        <div className="advanced-form-group advanced-warm-group">
          <h3 className="advanced-group-title"><span>03</span> Choose the starting point</h3>
          <label className="warm-pod-switch"><span>Start with warm API pods</span><input type="checkbox" role="switch" checked={warmStart} disabled={disabled || warmup?.status === "disabled"} onChange={(event) => setWarmStart(event.target.checked)} /></label>
          <div className="warm-feedback" aria-live="polite"><p>{warmupError ?? (warmStart ? "Prepare extra API pods before sending traffic." : "Start with current capacity and let autoscaling respond.")}</p>{displayType === "ramp" && warmStart && <p className="text-amber-800">Warm pods may hide the scale-up effect.</p>}</div>
          {prepared && <button type="button" onClick={() => void onRestore()} disabled={!statusKnown || isActive || actionPending} className={`${button} advanced-restore`}>Restore Normal Autoscaling</button>}
        </div>
        <div className="advanced-utilities">
        <details className="advanced-notes"><summary>Scenario & resource limits</summary>
          <p>{warmupError ?? warmup?.message}</p>
          {editorial && <div className="text-xs leading-5 text-slate-600"><p>{custom ? names[type] : preset?.description}</p><p>{custom ? `${targetRps.toLocaleString()} req/s · ${readableDuration(duration)}` : preset ? `${preset.configuration.targetRps.toLocaleString()} target req/s · ${readableDuration(preset.configuration.duration)}` : "Configuration unavailable"}</p>{observedPreset && <p>Watch for: {observedPreset.observe}</p>}{!custom && selected === "autoscaling" && ((warmup?.readyReplicas ?? 0) > (warmup?.baselineReplicas ?? 2) || prepared) && <p className="text-amber-800">Pods are above baseline. Let autoscaling settle for a clearer scale-up demonstration.</p>}</div>}
          <p className="text-xs leading-5 text-slate-500">Target RPS is offered traffic, not guaranteed capacity. VUs are workers needed while requests are in flight. Requests exceeding the VM budget are rejected, never silently reduced.</p>
          {configuration?.generator && <p className="text-xs text-slate-500">Generator: {configuration.generator.preAllocatedVUs} preallocated / {configuration.generator.maxVUs} max VUs by default · {configuration.generator.vuBudget} VU budget · {configuration.generator.cpus} CPU cores · {configuration.generator.memory} memory.</p>}
          {run?.resources && <p className="text-xs text-slate-500">Current run: {run.resources.preAllocatedVUs} preallocated / {run.resources.maxVUs} maximum VUs.</p>}
          {!custom && preset && <p className="text-xs leading-5 text-slate-600">{preset.profile} {preset.warmup}</p>}
        </details>
        <button type="button" disabled={disabled} onClick={() => void onReset()} className="advanced-reset disabled:opacity-40">Reset benchmark data ↻</button>
        </div>
        <div className="advanced-reset-feedback" role="status">{resetNotice}</div>
      </div>
    </details>}

  </section>;
}
