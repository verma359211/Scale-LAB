import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildK6Invocation, runRequestSchema, resourcesForRun, defaultResourceLimits } from "./run-config.js";
import { configuredTarget, PRODUCTION_TARGET_URL } from "./target.js";

describe("load-generator safety", () => {
  it("maps a supported type to a fixed script and target", () => {
    const input = runRequestSchema.parse({ type: "mixed", targetRps: 800, duration: "2m", readPercent: 70, writePercent: 30 });
    const invocation = buildK6Invocation(input, "abc123", {
      targetUrl: PRODUCTION_TARGET_URL,
      k6Image: "grafana/k6:1.8.1",
      loadTestsDirectory: "/safe/load-tests",
    });

    assert.equal(invocation.command, "docker");
    assert.equal(invocation.args.at(-1), "/load-tests/mixed-load.js");
    assert.ok(invocation.args.includes(`BASE_URL=${PRODUCTION_TARGET_URL}`));
    assert.ok(invocation.args.includes("READ_PERCENT=70"));
    assert.ok(invocation.args.includes("/safe/load-tests:/load-tests:ro"));
    assert.equal(invocation.args.includes("--volumes-from"), false);
    assert.equal(invocation.args.includes("--privileged"), false);
  });

  it("rejects arbitrary commands, URLs, scripts, and environment values", () => {
    const result = runRequestSchema.safeParse({
      type: "static",
      targetRps: 500,
      duration: "1m",
      command: "rm -rf /",
      targetUrl: "https://example.com",
      script: "other.js",
      env: { ANYTHING: "value" },
    });
    assert.equal(result.success, false);
  });

  it("rejects unsafe limits", () => {
    assert.equal(runRequestSchema.safeParse({ type: "static", targetRps: 5_000, duration: "1m" }).success, true);
    assert.equal(runRequestSchema.safeParse({ type: "static", targetRps: 10_000, duration: "1m" }).success, true);
    assert.equal(runRequestSchema.safeParse({ type: "static", targetRps: 100, duration: "11m" }).success, false);
    assert.equal(runRequestSchema.safeParse({ type: "mixed", targetRps: 500, duration: "1m", readPercent: 60, writePercent: 60 }).success, false);
  });

  it("passes RPS above 5,000 unchanged, exposes VUs and rejects rather than clamps resource overruns", () => {
    const input = runRequestSchema.parse({ type: "static", targetRps: 10_000, duration: "1m", preAllocatedVUs: 700, maxVUs: 3_500 });
    const invocation = buildK6Invocation(input, "large", { targetUrl: PRODUCTION_TARGET_URL, k6Image: "grafana/k6:1.8.1", loadTestsDirectory: "/tests" });
    assert.ok(invocation.args.includes("TARGET_RPS=10000"));
    assert.ok(invocation.args.includes("PRE_VUS=700"));
    assert.ok(invocation.args.includes("MAX_VUS=3500"));
    assert.ok(invocation.args.includes("--memory"));
    assert.ok(invocation.args.includes("--cpus"));
    assert.throws(() => resourcesForRun({ ...input, maxVUs: 4_001 }), /K6_VU_BUDGET/);
    assert.equal(resourcesForRun({ ...input, maxVUs: 6_000 }, { ...defaultResourceLimits, vuBudget: 6_000 }).maxVUs, 6_000);
  });

  it("maps ramp plateaus and spike stages to the exact requested duration", () => {
    const options = { targetUrl: PRODUCTION_TARGET_URL, k6Image: "grafana/k6:1.8.1", loadTestsDirectory: "/tests" };
    const ramp = buildK6Invocation({ type: "ramp", targetRps: 4_000, duration: "10m" }, "ramp", options);
    assert.ok(ramp.args.includes("STAGE_DURATION=119200ms"));
    assert.ok(ramp.args.includes("RPS_1=1000"));
    assert.ok(ramp.args.includes("RPS_5=4000"));
    const spike = buildK6Invocation({ type: "spike", targetRps: 4_000, duration: "4m" }, "spike", options);
    assert.ok(spike.args.includes("BASE_RPS=400"));
    assert.ok(spike.args.includes("WARMUP_DURATION=59s"));
    assert.ok(spike.args.includes("SPIKE_DURATION=119s"));
    assert.ok(spike.args.includes("RECOVERY_DURATION=60s"));
  });

  it("permits only the configured production HTTPS target", () => {
    assert.equal(configuredTarget(undefined), PRODUCTION_TARGET_URL);
    assert.equal(configuredTarget(`${PRODUCTION_TARGET_URL}/`), PRODUCTION_TARGET_URL);
    assert.throws(() => configuredTarget("http://212.2.250.175"));
    assert.throws(() => configuredTarget("https://example.com"));
  });

  it("executes shortened visitor preset stages for exactly their advertised duration", () => {
    const options = { targetUrl: PRODUCTION_TARGET_URL, k6Image: "grafana/k6:1.8.1", loadTestsDirectory: "/tests" };
    const ramp = buildK6Invocation({ type: "ramp", targetRps: 4_000, duration: "150s" }, "ramp", options);
    const plateau = Number(ramp.args.find((value) => value.startsWith("STAGE_DURATION="))!.split("=")[1]!.replace("ms", ""));
    assert.equal(plateau * 5 + 4_000, 150_000);
    const spike = buildK6Invocation({ type: "spike", targetRps: 4_000, duration: "75s" }, "spike", options);
    const phases = ["WARMUP_DURATION", "SPIKE_DURATION", "RECOVERY_DURATION"].map((key) => Number(spike.args.find((value) => value.startsWith(`${key}=`))!.split("=")[1]!.replace("s", "")));
    assert.equal(phases.reduce((sum, value) => sum + value, 0) + 2, 75);
    const mixed = buildK6Invocation({ type: "mixed", targetRps: 4_000, duration: "90s", readPercent: 70, writePercent: 30 }, "mixed", options);
    assert.ok(mixed.args.includes("DURATION=90s"));
    assert.ok(mixed.args.includes("WRITE_PERCENT=30"));
  });
});
