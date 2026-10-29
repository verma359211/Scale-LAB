import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { describe, it } from "node:test";
import type { ChildProcess } from "node:child_process";
import { runRequestSchema } from "./run-config.js";
import { appendOutput, K6RunManager, MAX_OUTPUT_BYTES, parseK6Summary, stripAnsi } from "./runner.js";

function fakeChild() {
  return Object.assign(new EventEmitter(), {
    stdout: new PassThrough(),
    stderr: new PassThrough(),
  }) as unknown as ChildProcess;
}

describe("k6 result capture", () => {
  it("is unavailable while running and returns cleaned terminal output after exit", () => {
    const child = fakeChild();
    const manager = new K6RunManager(
      { targetUrl: "http://target", k6Image: "grafana/k6:1.8.1", loadTestsDirectory: "/tests" },
      0,
      () => child,
    );
    const input = runRequestSchema.parse({ type: "static", targetRps: 500, duration: "1m" });

    manager.start(input);
    child.emit("spawn");
    assert.equal(manager.result().available, false);

    child.stdout!.emit("data", Buffer.from("\u001b[32mchecks passed\u001b[0m\nhttp_reqs....: 30000 500.00/s\n"));
    assert.match(manager.result().stdout ?? "", /checks passed/);
    assert.equal(manager.result().available, false);
    child.stderr!.emit("data", Buffer.from("http_req_failed....: 0.00%\n"));
    child.emit("close", 0);

    const result = manager.result();
    assert.equal(result.available, true);
    assert.equal(result.exitCode, 0);
    assert.equal(result.stopped, false);
    assert.equal(result.stdout?.includes("\u001b"), false);
    assert.match(result.stdout ?? "", /checks passed/);
    assert.equal(result.summary?.completedRequests, 30_000);
    assert.equal(result.summary?.achievedRps, 500);
  });

  it("keeps one active test, exposes budgets and allows another only after cooldown", () => {
    const child = fakeChild();
    const manager = new K6RunManager({ targetUrl: "http://target", k6Image: "grafana/k6:1.8.1", loadTestsDirectory: "/tests" }, 30, () => child);
    const input = runRequestSchema.parse({ type: "static", targetRps: 10_000, duration: "1m" });
    const state = manager.start(input);
    assert.equal(state.resources?.maxVUs, 4_000);
    assert.equal(manager.limits().vuBudget, 4_000);
    assert.throws(() => manager.start(input), /already running/);
    child.emit("close", 0);
    assert.throws(() => manager.start(input), /Please wait/);
  });

  it("bounds retained output to the newest 128 KB", () => {
    const output = appendOutput("old", "x".repeat(MAX_OUTPUT_BYTES + 10));
    assert.ok(Buffer.byteLength(output) <= MAX_OUTPUT_BYTES);
    assert.equal(output.includes("old"), false);
  });

  it("strips terminal escape sequences", () => {
    assert.equal(stripAnsi("\u001b[31mfailed\u001b[0m"), "failed");
  });

  it("extracts supported mixed-workload counters without guessing", () => {
    const summary = parseK6Summary(`
      scalelab_mixed_read_requests........: 4200 70.00/s
      scalelab_mixed_write_requests.......: 1800 30.00/s
      scalelab_mixed_orders_successful.....: 1798 29.96/s
    `);

    assert.equal(summary?.readRequests, 4_200);
    assert.equal(summary?.writeRequests, 1_800);
    assert.equal(summary?.successfulOrders, 1_798);
  });
});
