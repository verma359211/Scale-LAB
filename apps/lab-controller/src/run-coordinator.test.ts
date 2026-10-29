import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { RunRequest, RunResult, RunState } from "./run-schema.js";
import { RunCoordinator, type LoadGeneratorProvider } from "./run-coordinator.js";

function state(input: RunRequest, status: RunState["status"]): RunState {
  const endedAt = status === "completed" || status === "failed" ? new Date(1).toISOString() : null;
  return {
    id: "run-1",
    status,
    type: input.type,
    configuration: input,
    startedAt: new Date(0).toISOString(),
    endedAt,
    failureReason: status === "failed" ? "k6 failed" : null,
    events: endedAt
      ? [
          { timestamp: endedAt, message: "k6 exited" },
          { timestamp: endedAt, message: status === "completed" ? "Test completed" : "Test failed" },
        ]
      : [],
  };
}

function loadGenerator(input: RunRequest, final: RunState): LoadGeneratorProvider {
  let current = state(input, "running");
  return {
    async start() { queueMicrotask(() => { current = final; }); return current; },
    async current() { return current; },
    async stop() { current = final; return current; },
    async result(): Promise<RunResult> { return { runId: "run-1", available: true }; },
  };
}

describe("run cleanup coordinator", () => {
  it("defers successful completion and endedAt until write cleanup succeeds", async () => {
    const input: RunRequest = { type: "mixed", targetRps: 100, duration: "1m", readPercent: 70, writePercent: 30 };
    let resets = 0;
    let releaseReset: (() => void) | undefined;
    let resetStarted: (() => void) | undefined;
    const resetHasStarted = new Promise<void>((resolve) => { resetStarted = resolve; });
    const allowResetToFinish = new Promise<void>((resolve) => { releaseReset = resolve; });
    const coordinator = new RunCoordinator(loadGenerator(input, state(input, "completed")), {
      async reset() {
        resets += 1;
        resetStarted?.();
        await allowResetToFinish;
        return { status: "completed", shards: [{ shard: 0, status: "completed" }] };
      },
    }, 1);

    await coordinator.start(input);
    await resetHasStarted;

    const resetting = await coordinator.current();
    assert.equal(resetting?.status, "resetting");
    assert.equal(resetting?.endedAt, null);
    assert.equal(resetting?.events.some((event) => event.message === "Test completed"), false);

    releaseReset?.();
    await coordinator.waitForMonitor();
    const current = await coordinator.current();
    assert.equal(resets, 1);
    assert.equal(current?.status, "completed");
    assert.equal(current?.cleanup?.status, "completed");
    assert.notEqual(current?.endedAt, new Date(1).toISOString());

    const lifecycle = current?.events.map((event) => event.message) ?? [];
    assert.deepEqual(lifecycle.slice(-4), [
      "k6 exited",
      "Resetting benchmark data",
      "Benchmark data reset",
      "Test completed",
    ]);
  });

  it("does not reset after a read-only run", async () => {
    const input: RunRequest = { type: "mixed", targetRps: 100, duration: "1m", readPercent: 100, writePercent: 0 };
    let resets = 0;
    const coordinator = new RunCoordinator(loadGenerator(input, state(input, "completed")), {
      async reset() { resets += 1; return { status: "completed", shards: [] }; },
    }, 1);

    const started = await coordinator.start(input);
    assert.equal(started.cleanup?.status, "not_required");
    assert.equal(resets, 0);

    await new Promise((resolve) => setImmediate(resolve));
    const current = await coordinator.current();
    assert.equal(current?.status, "completed");
    assert.equal(current?.endedAt, new Date(1).toISOString());
    assert.deepEqual(current?.events.map((event) => event.message), ["k6 exited", "Test completed"]);
  });

  it("reports cleanup failure without hiding it", async () => {
    const input: RunRequest = { type: "mixed", targetRps: 100, duration: "1m", readPercent: 70, writePercent: 30 };
    const coordinator = new RunCoordinator(loadGenerator(input, state(input, "completed")), {
      async reset() { throw new Error("reset unavailable"); },
    }, 1);

    await coordinator.start(input);
    await coordinator.waitForMonitor();
    const current = await coordinator.current();
    assert.equal(current?.status, "failed");
    assert.equal(current?.cleanup?.status, "failed");
    assert.match(current?.cleanup?.failureReason ?? "", /reset unavailable/);
    assert.notEqual(current?.endedAt, new Date(1).toISOString());
    assert.equal(current?.events.some((event) => event.message === "Test completed"), false);
    assert.deepEqual(current?.events.map((event) => event.message).slice(-3), [
      "k6 exited",
      "Resetting benchmark data",
      "Cleanup failed",
    ]);
  });

  it("restores pod preparation after read-only exit or cancelled mixed-run cleanup", async () => {
    for (const type of ["static", "mixed"] as const) {
      const input: RunRequest = { type, targetRps: 100, duration: "1m" };
      const order: string[] = [];
      const coordinator = new RunCoordinator(loadGenerator(input, state(input, "completed")), {
        async reset() { order.push("cleanup"); return { status: "completed", shards: [] }; },
      }, 1, async () => { order.push("restore"); });
      await coordinator.start(input);
      await assert.rejects(coordinator.start(input), /already running/);
      await coordinator.waitForMonitor();
      assert.deepEqual(order, type === "mixed" ? ["cleanup", "restore"] : ["restore"]);
    }
  });

  it("keeps completion and endedAt pending until restoration finishes", async () => {
    const input: RunRequest = { type: "mixed", targetRps: 50, duration: "30s" };
    let restoring!: () => void;
    let release!: () => void;
    const started = new Promise<void>((resolve) => { restoring = resolve; });
    const finish = new Promise<void>((resolve) => { release = resolve; });
    const coordinator = new RunCoordinator(loadGenerator(input, state(input, "completed")), {
      async reset() { return { status: "completed", shards: [] }; },
    }, 1, async () => { restoring(); await finish; });
    await coordinator.start(input);
    await started;
    const pending = await coordinator.current();
    assert.equal(pending?.status, "restoring");
    assert.equal(pending?.endedAt, null);
    assert.equal(pending?.events.some((event) => event.message === "Test completed"), false);
    await assert.rejects(coordinator.start(input), /already running/);
    release();
    await coordinator.waitForMonitor();
    const final = await coordinator.current();
    assert.equal(final?.status, "completed");
    assert.equal(final?.endedAt, final?.events.at(-1)?.timestamp);
    assert.deepEqual(final?.events.slice(-3).map((event) => event.message), ["Restoring normal autoscaling", "Normal autoscaling restored", "Test completed"]);
  });

  it("restores after failure, watchdog timeout and stop, and reports restoration errors truthfully", async () => {
    const input: RunRequest = { type: "static", targetRps: 50, duration: "30s" };
    for (const outcome of ["failed", "timeout", "stopped", "restore failed"]) {
      let restores = 0;
      const final = state(input, outcome === "failed" || outcome === "timeout" ? "failed" : "completed");
      if (outcome === "timeout") final.failureReason = "Watchdog timeout";
      if (outcome === "stopped") final.events[1]!.message = "Test stopped";
      const coordinator = new RunCoordinator(loadGenerator(input, final), {
        async reset() { throw new Error("Read-only must not reset"); },
      }, 1, async () => { restores++; if (outcome === "restore failed") throw new Error("Kubernetes unavailable"); });
      await coordinator.start(input);
      await coordinator.waitForMonitor();
      const current = await coordinator.current();
      assert.equal(restores, 1);
      assert.equal(current?.status, outcome === "stopped" ? "completed" : "failed");
      if (outcome === "restore failed") {
        assert.match(current?.failureReason ?? "", /restoration failed/);
        assert.equal(current?.events.some((event) => event.message === "Test completed"), false);
      }
    }
  });
});
