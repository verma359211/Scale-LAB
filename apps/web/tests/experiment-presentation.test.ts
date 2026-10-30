import assert from "node:assert/strict";
import { it } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { isRunActive, readableDuration, replicaObservation, runLabel } from "../src/lib/experiment-presentation.ts";
import { LoadTestPanel } from "../src/components/LoadTestPanel.tsx";
import { LiveScalingPanel } from "../src/components/LiveScalingPanel.tsx";
import { ExperimentOutcome } from "../src/components/ExperimentOutcome.tsx";
import type { RunState } from "../src/lab-types.ts";

const run = (status: RunState["status"]): RunState => ({
  id: "example", status, type: "ramp", configuration: { type: "ramp", targetRps: 4000, duration: "150s" },
  startedAt: new Date(1000).toISOString(), endedAt: status === "completed" ? new Date(6000).toISOString() : null,
  failureReason: null, events: [],
});
const noop = async () => {};
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

it("uses real preset durations in readable form", () => {
  assert.equal(readableDuration("150s"), "2 min 30 sec");
  assert.equal(readableDuration("75s"), "1 min 15 sec");
  assert.equal(readableDuration("90s"), "1 min 30 sec");
  assert.equal(readableDuration("4m"), "4 min");
});
