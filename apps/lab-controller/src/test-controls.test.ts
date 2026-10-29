import assert from "node:assert/strict";
import { it } from "node:test";
import { TestControls } from "./test-controls.js";
import type { RunProvider } from "./app.js";
import type { WarmupState } from "./warmup.js";
import type { RunRequest, RunState } from "./run-schema.js";

const input: RunRequest = { type: "static", targetRps: 50, duration: "30s" };
const warming: WarmupState = { status: "warming", readyReplicas: 2, desiredReplicas: 5,
  targetReplicas: 5, baselineReplicas: 2, expiresAt: null, message: "Waiting" };
function provider(order: string[]): RunProvider {
  return {
    async current() { return null; },
    async start(configuration) { order.push("k6"); return { id: "run", status: "running", type: configuration.type, configuration,
      startedAt: new Date().toISOString(), endedAt: null, failureReason: null, events: [] } satisfies RunState; },
    async stop() { order.push("stop"); return {} as RunState; },
    async result() { return { runId: null, available: false }; },
    async resetBenchmark() { order.push("reset"); return { status: "completed", shards: [] }; },
  };
}

it("normal start never invokes warm-up or HPA restoration", async () => {
  const order: string[] = [];
  const controls = new TestControls(provider(order), {
    async start() { order.push("prepare"); return warming; },
    async current() { return { ...warming, status: "idle" }; },
    async restore() { order.push("restore"); return warming; },
  }, 1);
  await controls.start(input);
  assert.deepEqual(order, ["k6"]);
});

it("gates k6 on actual readiness and preserves preparation events after handoff", async () => {
  const order: string[] = [];
  let ready = false;
  const runs = provider(order);
  let upstream: RunState | null = null;
  const start = runs.start;
  runs.start = async (request) => { upstream = await start(request); return upstream; };
  runs.current = async () => upstream;
  const controls = new TestControls(runs, {
    async start() { order.push("prepare"); return warming; },
    async current() { order.push("inspect"); return { ...warming, status: ready ? "ready" : "warming" }; },
    async restore() { order.push("restore"); return warming; },
  }, 1);
  assert.equal((await controls.start(input, true)).status, "preparing");
  assert.equal((await controls.current())?.endedAt, null);
  await assert.rejects(controls.start(input, true), /already running/);
  await assert.rejects(controls.reset(), /already running/);
  assert.equal(order.includes("k6"), false);
  ready = true;
  await controls.waitForPreparation();
  assert.equal(order.at(-1), "k6");
  assert.equal((await controls.current())?.events[1]?.message, "API pods ready - starting load test");
});

it("failed or timed-out preparation and rejected generator starts restore safely", async () => {
  for (const failure of ["readiness timeout", "cluster unavailable", "generator rejected"]) {
    const order: string[] = [];
    const runs = provider(order);
    if (failure === "generator rejected") runs.start = async () => { throw new Error(failure); };
    const controls = new TestControls(runs, {
      async start() {
        order.push("prepare");
        if (failure === "cluster unavailable") throw new Error(failure);
        return { ...warming, status: failure === "generator rejected" ? "ready" : "failed", message: failure };
      },
      async current() { return warming; },
      async restore() { order.push("restore"); return warming; },
    }, 1);
    await controls.start(input, true);
    await controls.waitForPreparation();
    assert.deepEqual(order, ["prepare", "restore"]);
    assert.equal((await controls.current())?.status, "failed");
    assert.match((await controls.current())?.failureReason ?? "", new RegExp(failure));
    assert.ok((await controls.current())?.endedAt);
  }
});

it("cancels during preparation without dispatching k6 and waits for restoration", async () => {
  const order: string[] = [];
  const controls = new TestControls(provider(order), {
    async start() { order.push("prepare"); return warming; },
    async current() { return warming; },
    async restore() { order.push("restore"); return warming; },
  }, 1);
  await controls.start(input, true);
  const stopped = await controls.stop();
  assert.equal(stopped.status, "failed");
  assert.match(stopped.failureReason ?? "", /cancelled/);
  assert.deepEqual(order, ["prepare", "restore"]);
});

it("handles cancellation at the generator handoff without losing an accepted test", async () => {
  const order: string[] = [];
  let accepted!: () => void;
  let release!: () => void;
  const dispatching = new Promise<void>((resolve) => { accepted = resolve; });
  const finish = new Promise<void>((resolve) => { release = resolve; });
  const runs = provider(order);
  const originalStart = runs.start;
  runs.start = async (request) => { accepted(); await finish; return originalStart(request); };
  const controls = new TestControls(runs, {
    async start() { return { ...warming, status: "ready" }; },
    async current() { return warming; },
    async restore() { order.push("restore"); return warming; },
  }, 1);
  await controls.start(input, true);
  await dispatching;
  const stop = controls.stop();
  release();
  await stop;
  assert.deepEqual(order, ["k6", "stop"]);
});

it("serializes asynchronous mutations so overlapping starts and warm-ups cannot slip through", async () => {
  let release!: () => void;
  const pending = new Promise<void>((resolve) => { release = resolve; });
  let starts = 0;
  const controls = new TestControls({
    async current() { await pending; return null; },
    async start() { starts += 1; return {} as never; },
  } as unknown as RunProvider);
  const first = controls.start({ type: "static", targetRps: 100, duration: "1m" });
  await assert.rejects(controls.start({ type: "static", targetRps: 100, duration: "1m" }), /already running/);
  await assert.rejects(controls.prepare(), /already running/);
  release();
  await first;
  assert.equal(starts, 1);
});

it("rejects preparation and restore during active runs or cleanup", async () => {
  const controls = new TestControls({ async current() { return { status: "resetting" }; } } as unknown as RunProvider);
  await assert.rejects(controls.prepare(), /already running/);
  await assert.rejects(controls.restore(), /already running/);
});

it("cannot create a new warm-up lease while the previous run is still restoring", async () => {
  const controls = new TestControls({
    lifecycleBusy() { return true; },
    async current() { return { status: "completed" }; },
  } as unknown as RunProvider);
  await assert.rejects(controls.prepare(), /already running/);
});
