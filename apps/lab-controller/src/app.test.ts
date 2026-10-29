import assert from "node:assert/strict";
import { describe, it } from "node:test";
import request from "supertest";
import { createApp, type MetricsProvider, type RunProvider } from "./app.js";
import type { RunRequest, RunState } from "./run-schema.js";

const emptyMetrics: MetricsProvider = {
  async summary() {
    return { generatedAt: new Date(0).toISOString(), metrics: {} as never, unavailable: [] };
  },
  async timeseries() {
    return { generatedAt: new Date(0).toISOString(), start: new Date(0).toISOString(), end: new Date(0).toISOString(), stepSeconds: 3, series: {} as never, perPod: { cpuPercent: [], requestRps: [] }, unavailable: [] };
  },
};

function runState(configuration: RunRequest): RunState {
  return {
    id: "run-1",
    status: "running",
    type: configuration.type,
    configuration,
    startedAt: new Date(0).toISOString(),
    endedAt: null,
    failureReason: null,
    events: [],
  };
}

function runProvider(overrides: Partial<RunProvider> = {}): RunProvider {
  return {
    async start(input) { return runState(input); },
    async current() { return null; },
    async stop() { throw new Error("No active test"); },
    async result() { return { runId: null, available: false }; },
    async resetBenchmark() { return { status: "completed", shards: [] }; },
    ...overrides,
  };
}

describe("lab controller", () => {
  it("accepts a bounded predefined run", async () => {
    const received: RunRequest[] = [];
    const runs = runProvider({ async start(input) { received.push(input); return runState(input); } });

    const response = await request(createApp(emptyMetrics, runs)).post("/lab-api/runs").send({
      type: "mixed",
      targetRps: 10_000,
      duration: "2m",
      readPercent: 70,
      writePercent: 30,
    });

    assert.equal(response.status, 202);
    assert.equal(received[0]?.targetRps, 10_000);
  });

  it("rejects command, target URL, and unsupported script input", async () => {
    const runs = runProvider();
    const response = await request(createApp(emptyMetrics, runs)).post("/lab-api/runs").send({
      type: "custom-script",
      targetRps: 800,
      duration: "2m",
      targetUrl: "https://example.com",
      command: "anything",
    });

    assert.equal(response.status, 400);
  });

  it("rejects unsafe rates, durations, and mixed percentages", async () => {
    const runs = runProvider();
    const response = await request(createApp(emptyMetrics, runs)).post("/lab-api/runs").send({
      type: "mixed",
      targetRps: 5_001,
      duration: "30m",
      readPercent: 80,
      writePercent: 80,
    });

    assert.equal(response.status, 400);
  });

  it("proxies the real k6 result separately from current run state", async () => {
    const runs = runProvider({
      async result() {
        return { runId: "run-1", available: true, exitCode: 0, stopped: false, stdout: "k6 summary", stderr: "" };
      },
    });
    const response = await request(createApp(emptyMetrics, runs)).get("/lab-api/runs/current/result");
    assert.equal(response.status, 200);
    assert.equal(response.body.stdout, "k6 summary");
  });

  it("manual reset invokes only the fixed reset operation", async () => {
    let resets = 0;
    const runs = runProvider({
      async resetBenchmark() { resets += 1; return { status: "completed", shards: [] }; },
    });
    const response = await request(createApp(emptyMetrics, runs))
      .post("/lab-api/benchmark/reset")
      .send({ sql: "DROP TABLE products", productIds: [1] });
    assert.equal(response.status, 200);
    assert.equal(resets, 1);
  });

  it("allows the single-operator dashboard to invoke bounded test-control operations", async () => {
    let starts = 0;
    let stops = 0;
    let resets = 0;
    const input: RunRequest = { type: "static", targetRps: 500, duration: "1m" };
    const runs = runProvider({
      async start(value) { starts += 1; return runState(value); },
      async stop() { stops += 1; return runState(input); },
      async resetBenchmark() { resets += 1; return { status: "completed", shards: [] }; },
    });
    const app = createApp(emptyMetrics, runs);

    assert.equal((await request(app).post("/lab-api/runs").send(input)).status, 202);
    assert.equal((await request(app).post("/lab-api/runs/current/stop")).status, 202);
    assert.equal((await request(app).post("/lab-api/benchmark/reset")).status, 200);
    assert.equal(starts, 1);
    assert.equal(stops, 1);
    assert.equal(resets, 1);
  });

  it("resolves server presets and rejects preset overrides", async () => {
    const received: RunRequest[] = [];
    const app = createApp(emptyMetrics, runProvider({ async start(input) { received.push(input); return runState(input); } }));
    const config = await request(app).get("/lab-api/config");
    assert.deepEqual(config.body.presets.map((preset: { configuration: RunRequest }) => preset.configuration.duration), ["150s", "75s", "90s"]);
    for (const preset of config.body.presets) {
      const response = await request(app).post("/lab-api/runs").send({ preset: preset.id });
      assert.equal(response.status, 202);
      assert.deepEqual(received.at(-1), preset.configuration);
    }
    assert.equal((await request(app).post("/lab-api/runs").send({ preset: "autoscaling", targetRps: 9_999 })).status, 400);
  });

  it("accepts warm-start for presets and custom workloads without forwarding the flag as k6 configuration", async () => {
    const { PodWarmup } = await import("./warmup.js");
    for (const workload of [{ preset: "autoscaling" }, { type: "static", targetRps: 10_000, duration: "30s" }]) {
      let preparations = 0;
      const warmup = new PodWarmup({
        async hpa() { throw new Error("Not used by overridden preparation"); },
        async deployment() { throw new Error("Not used"); },
        async patchHpa() {},
      });
      warmup.start = async () => { preparations += 1; throw new Error("controlled readiness failure"); };
      warmup.restore = async () => ({ status: "idle", readyReplicas: 2, desiredReplicas: 2, targetReplicas: null, baselineReplicas: 2, expiresAt: null, message: "Restored" });
      const app = createApp(emptyMetrics, runProvider({ async start() { throw new Error("Must not dispatch"); } }), { warmup });
      const response = await request(app).post("/lab-api/runs").send({ ...workload, warmStart: true });
      assert.equal(response.status, 202);
      assert.equal(preparations, 1);
      assert.equal("warmStart" in response.body.configuration, false);
      assert.equal((await request(app).post("/lab-api/runs").send({ ...workload, warmStart: "yes" })).status, 400);
    }
  });

  it("blocks foreign browser mutations and supports disabling public controls", async () => {
    const app = createApp(emptyMetrics, runProvider());
    for (const path of ["/lab-api/runs", "/lab-api/runs/current/stop", "/lab-api/benchmark/reset", "/lab-api/warmup", "/lab-api/warmup/restore"]) {
      assert.equal((await request(app).post(path).set("Origin", "https://foreign.example").send({})).status, 403);
      const disabled = createApp(emptyMetrics, runProvider(), { controlsEnabled: false });
      const disabledResponse = await request(disabled).post(path).send({});
      if (path === "/lab-api/runs/current/stop" || path === "/lab-api/warmup/restore") assert.notEqual(disabledResponse.status, 403);
      else assert.equal(disabledResponse.status, 403);
    }
  });

  it("validates history windows at the HTTP boundary", async () => {
    const windows: number[] = [];
    const app = createApp({ ...emptyMetrics, async timeseries(window) { windows.push(window!); return emptyMetrics.timeseries(); } }, runProvider());
    for (const value of [5, 10]) assert.equal((await request(app).get(`/lab-api/metrics/timeseries?window=${value}`)).status, 200);
    assert.deepEqual(windows, [5, 10]);
    assert.equal((await request(app).get("/lab-api/metrics/timeseries?window=999")).status, 400);
  });
});
