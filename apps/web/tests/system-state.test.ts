import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { MetricsSummary, RunState } from "../src/lab-types.ts";
import { deriveSystemState } from "../src/lib/system-state.ts";

function run(status: RunState["status"]): RunState {
  return {
    id: "run-1",
    status,
    type: "ramp",
    configuration: { type: "ramp", targetRps: 1_200, duration: "4m" },
    startedAt: new Date(0).toISOString(),
    endedAt: status === "completed" ? new Date(1).toISOString() : null,
    failureReason: null,
    events: [],
  };
}

function metrics(values: Partial<MetricsSummary["metrics"]>): MetricsSummary {
  return {
    generatedAt: new Date(0).toISOString(),
    metrics: {
      requestRps: null,
      p95LatencyMs: null,
      p99LatencyMs: null,
      httpErrorRate: null,
      apiPodCount: null,
      desiredPodCount: null,
      apiCpuPercent: null,
      apiCpuMillicores: null,
      redisHitRatio: null,
      postgresP95LatencyMs: null,
      activeRequests: null,
      ingressRps: null,
      ...values,
    },
    unavailable: [],
  };
}

describe("system state", () => {
  it("does not claim scaling without replica evidence", () => {
    assert.equal(deriveSystemState(run("running"), metrics({ apiCpuPercent: 20 })).label, "Generating load");
  });

  it("reports scaling only when desired pods exceed ready pods", () => {
    assert.equal(deriveSystemState(run("running"), metrics({ apiPodCount: 2, desiredPodCount: 4 })).label, "Scaling out");
  });

  it("reports cleanup before completion", () => {
    const resetting = run("resetting");
    resetting.cleanup = { required: true, status: "running", failureReason: null };
    assert.equal(deriveSystemState(resetting, metrics({})).label, "Resetting benchmark data");
  });

  it("reports cooldown only when replicas remain above the minimum", () => {
    assert.equal(deriveSystemState(run("completed"), metrics({ apiPodCount: 4, desiredPodCount: 2 })).label, "Cooling down");
    assert.equal(deriveSystemState(run("completed"), metrics({ apiPodCount: 2, desiredPodCount: 2 })).label, "Completed");
  });
});
