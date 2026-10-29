import assert from "node:assert/strict";
import { describe, it } from "node:test";
import request from "supertest";
import { createApp } from "./app.js";
import type { K6RunManager } from "./runner.js";
import type { RunRequest, PublicRunState } from "./run-config.js";

const CONTROL_TOKEN = "test-loadgen-control-token";

function state(configuration: RunRequest): PublicRunState {
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

function manager(overrides: Partial<Pick<K6RunManager, "current" | "result" | "start" | "stop">> = {}) {
  const input: RunRequest = { type: "static", targetRps: 500, duration: "1m" };
  return {
    current() { return null; },
    result() { return { runId: null, available: false }; },
    start(value: RunRequest) { return state(value); },
    stop() { return state(input); },
    ...overrides,
  } as Pick<K6RunManager, "current" | "result" | "start" | "stop">;
}

describe("load-generator control authorization", () => {
  it("accepts rates above 5,000 only with internal authorization", async () => {
    const received: RunRequest[] = [];
    const app = createApp(manager({ start(input) { received.push(input); return state(input); } }), CONTROL_TOKEN);

    const response = await request(app)
      .post("/runs")
      .set("x-scalelab-control-token", CONTROL_TOKEN)
      .send({ type: "static", targetRps: 10_000, duration: "1m" });

    assert.equal(response.status, 202);
    assert.equal(received[0]?.targetRps, 10_000);
  });

  it("rejects invalid rates", async () => {
    const response = await request(createApp(manager(), CONTROL_TOKEN))
      .post("/runs")
      .set("x-scalelab-control-token", CONTROL_TOKEN)
      .send({ type: "static", targetRps: 0, duration: "1m" });

    assert.equal(response.status, 400);
  });

  it("requires authorization before starting or stopping a run", async () => {
    let starts = 0;
    let stops = 0;
    const app = createApp(manager({
      start(input) { starts += 1; return state(input); },
      stop() { stops += 1; return state({ type: "static", targetRps: 500, duration: "1m" }); },
    }), CONTROL_TOKEN);

    assert.equal((await request(app).post("/runs").send({ type: "static", targetRps: 500, duration: "1m" })).status, 401);
    assert.equal((await request(app).post("/runs").set("x-scalelab-control-token", "wrong-token").send({ type: "static", targetRps: 500, duration: "1m" })).status, 401);
    assert.equal((await request(app).post("/runs/current/stop")).status, 401);
    assert.equal(starts, 0);
    assert.equal(stops, 0);
  });
});
