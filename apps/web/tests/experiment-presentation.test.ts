import assert from "node:assert/strict";
import { it } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { isRunActive, readableDuration, replicaObservation, runLabel } from "../src/lib/experiment-presentation.ts";
import { LoadTestPanel } from "../src/components/LoadTestPanel.tsx";
import { LiveScalingPanel } from "../src/components/LiveScalingPanel.tsx";
import { ExperimentOutcome } from "../src/components/ExperimentOutcome.tsx";
import { HeroRunResult } from "../src/components/HeroRunResult.tsx";
import type { RunState } from "../src/lab-types.ts";

const run = (status: RunState["status"]): RunState => ({
  id: "example", status, type: "ramp", configuration: { type: "ramp", targetRps: 4000, duration: "150s" },
  startedAt: new Date(1000).toISOString(), endedAt: status === "completed" ? new Date(6000).toISOString() : null,
  failureReason: null, events: [],
});
const noop = async () => {};

it("holds the hero result until cleanup and restoration finish", () => {
  for (const status of ["running", "stopping", "resetting", "restoring"] as const) {
    assert.equal(renderToStaticMarkup(createElement(HeroRunResult, { run: run(status), result: null, error: null, onNewExperiment: () => {} })), "");
  }
});

it("shows stopped hero results with measured values and collapsed raw output", () => {
  const html = renderToStaticMarkup(createElement(HeroRunResult, { run: run("completed"), result: { runId: "example", available: true, stopped: true, summary: { achievedRps: 200, completedRequests: 12000 }, stdout: "Measured output" }, error: null, onNewExperiment: () => {} }));
  assert.match(html, /Experiment stopped/);
  assert.match(html, /12,000/);
  assert.match(html, /Measured output/);
  assert.match(html, /New experiment/);
  assert.doesNotMatch(html, /<details[^>]*\bopen/);
});

it("ignores stale hero results and preserves cleanup failures", () => {
  const state = run("failed");
  state.cleanup = { required: true, status: "failed", failureReason: "Reset unavailable" };
  const html = renderToStaticMarkup(createElement(HeroRunResult, { run: state, result: { runId: "older", available: true, summary: { achievedRps: 99999 } }, error: null, onNewExperiment: () => {} }));
  assert.match(html, /result-failed/);
  assert.match(html, /Cleanup failed: Reset unavailable/);
  assert.match(html, /Waiting for the final k6 summary/);
  assert.doesNotMatch(html, /99,999/);
});
const controls = {
  run: null, configuration: { controlsEnabled: true, generator: null, presets: [{ id: "autoscaling", name: "Watch Kubernetes Autoscaling", description: "Increase traffic", observe: "Ready pods", profile: "Ramp", warmup: "Normal baseline", configuration: { type: "ramp" as const, targetRps: 4000, duration: "150s" } }] },
  statusKnown: true, warmup: null, warmupError: null, actionPending: false, actionError: null, resetNotice: null,
  onStart: noop, onStop: noop, onReset: noop, onRestore: noop,
};

it("keeps controls disabled until the current run has been checked", () => {
  const html = renderToStaticMarkup(createElement(LoadTestPanel, { ...controls, statusKnown: false }));
  assert.match(html, /Checking for an active experiment/);
  assert.match(html, /<button[^>]*disabled=""[^>]*class="start-experiment"/);
});

it("shows stop in place of start when arriving during somebody else's run", () => {
  const html = renderToStaticMarkup(createElement(LoadTestPanel, { ...controls, run: run("running") }));
  assert.match(html, /shared experiment is in progress/);
  assert.match(html, /Stop experiment/);
  assert.doesNotMatch(html, /class="start-experiment"/);
});

it("makes advanced fields directly editable without a custom-mode checkbox", () => {
  const html = renderToStaticMarkup(createElement(LoadTestPanel, { ...controls, editorial: true }));
  assert.doesNotMatch(html, /Customize workload/);
  assert.doesNotMatch(html, /<fieldset disabled/);
  assert.match(html, /role="switch"/);
  assert.match(html, /class="warm-feedback" aria-live="polite"/);
  assert.match(html, /Tune your experiment/);
  assert.match(html, /value="ramp" selected/);
  assert.match(html, /value="150s" selected/);
});

it("hides advanced controls during a run and keeps live details distinct from requested load", () => {
  const html = renderToStaticMarkup(createElement(LoadTestPanel, { ...controls, editorial: true, run: run("running") }));
  assert.doesNotMatch(html, /Advanced Options|advanced-options/);
  assert.match(html, /Live response/);
  assert.match(html, /includes shared traffic/);
  assert.match(html, /Incoming requests/);
  assert.match(html, /<dd>—<\/dd>/);
  assert.match(html, /Stop experiment/);
});

it("keeps preparation, stopping, cleanup and restoration distinct from completion", () => {
  for (const status of ["preparing", "starting", "running", "stopping", "resetting", "restoring"] as const) {
    assert.equal(isRunActive(run(status)), true);
    assert.doesNotMatch(runLabel(run(status)), /completed/);
    assert.equal(renderToStaticMarkup(createElement(ExperimentOutcome, { run: run(status), result: null, data: null, error: null })), "");
  }
  assert.equal(runLabel(run("resetting")), "Cleaning benchmark data");
  assert.equal(runLabel(run("restoring")), "Restoring autoscaling");
});

it("does not celebrate stops, failures or failed thresholds", () => {
  assert.equal(runLabel(run("failed")), "Experiment failed");
  assert.equal(runLabel(run("completed"), { runId: "example", available: true, stopped: true }), "Experiment stopped");
  const stopped = run("completed");
  stopped.events.push({ timestamp: stopped.endedAt!, message: "Test stopped" });
  assert.equal(runLabel(stopped), "Experiment stopped");
  assert.equal(runLabel(run("completed"), { runId: "example", available: true, exitCode: 99 }), "Completed with failures");
  assert.equal(runLabel(run("completed"), { runId: "older", available: true, stopped: true }), "Experiment completed");
});

it("only observes replica changes inside the workload, excluding warmup and cleanup", () => {
  const state = run("completed");
  state.events = [{ timestamp: new Date(2000).toISOString(), message: "Test running" }, { timestamp: new Date(5000).toISOString(), message: "k6 exited" }];
  const observed = replicaObservation(state, [{ timestamp: 1000, value: 6 }, { timestamp: 2000, value: 2 }, { timestamp: 4000, value: 4 }, { timestamp: 6000, value: 6 }]);
  assert.deepEqual(observed, { min: 2, max: 4, increased: true, start: 2000, end: 4000 });
  assert.equal(replicaObservation(state, [{ timestamp: 10000, value: 6 }]), null);
  assert.equal(replicaObservation(state, [{ timestamp: 2000, value: 2 }, { timestamp: 4000, value: 2 }])?.increased, false);
  state.events = [{ timestamp: state.startedAt, message: "Preparing API pods" }];
  assert.equal(replicaObservation(state, [{ timestamp: 2000, value: 2 }, { timestamp: 4000, value: 5 }]), null);
});

it("shows missing telemetry honestly and keeps accessible chart labels", () => {
  const html = renderToStaticMarkup(createElement(LiveScalingPanel, { summary: null, data: null, loading: true, error: null, historyError: null, windowMinutes: 5, onWindowChange: () => {} }));
  assert.match(html, /Connecting/);
  assert.match(html, /Waiting for replica metrics/);
  assert.match(html, /No metric samples yet/);
  assert.doesNotMatch(html, /2 API pods are Ready/);
  assert.match(html, /Telemetry history window/);
});

it("separates past results from live values and ignores another run's summary", () => {
  const html = renderToStaticMarkup(createElement(ExperimentOutcome, { run: run("completed"), result: { runId: "other", available: true, summary: { achievedRps: 99999 } }, data: null, error: null }));
  assert.match(html, /Previous experiment/);
  assert.match(html, /No measured k6 summary available/);
  assert.match(html, /scaling cannot be confirmed/);
  assert.doesNotMatch(html, /99,999/);
});

it("keeps stopped and cleanup-failed result strips distinct from successful completion", () => {
  const stopped = renderToStaticMarkup(createElement(ExperimentOutcome, { run: run("completed"), result: { runId: "example", available: true, stopped: true }, data: null, error: null }));
  assert.match(stopped, /outcome-stopped/);
  const state = run("failed");
  state.cleanup = { required: true, status: "failed", failureReason: "Reset unavailable" };
  const failed = renderToStaticMarkup(createElement(ExperimentOutcome, { run: state, result: null, data: null, error: null }));
  assert.match(failed, /outcome-failed/);
  assert.match(failed, /role="alert"[^>]*>Cleanup failed: Reset unavailable/);
});

it("keeps previous results in a closed concise disclosure with all six measured values", () => {
  const html = renderToStaticMarkup(createElement(ExperimentOutcome, { run: run("completed"), result: { runId: "example", available: true, summary: { achievedRps: 200, completedRequests: 12000, failureRate: 0, p95: "12ms", p99: "24ms", droppedIterations: 3 } }, data: null, error: null }));
  assert.match(html, /<details class="outcome-disclosure">/);
  assert.doesNotMatch(html, /<details[^>]*\bopen/);
  assert.match(html, /Results/);
  assert.match(html, /12,000/);
  assert.match(html, /Dropped iterations/);
  assert.match(html, /12ms/);
  assert.match(html, /24ms/);
  assert.doesNotMatch(html, /View previous result/);
});

it("uses real preset durations in readable form", () => {
  assert.equal(readableDuration("150s"), "2 min 30 sec");
  assert.equal(readableDuration("75s"), "1 min 15 sec");
  assert.equal(readableDuration("90s"), "1 min 30 sec");
  assert.equal(readableDuration("4m"), "4 min");
});
