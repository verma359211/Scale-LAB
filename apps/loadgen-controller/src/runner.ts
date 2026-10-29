import { randomUUID } from "node:crypto";
import { spawn, type ChildProcess, type SpawnOptions } from "node:child_process";
import {
  buildK6Invocation,
  defaultResourceLimits,
  resourcesForRun,
  parseDuration,
  type PublicRunState,
  type RunRequest,
  type RunResult,
  type RunResultSummary,
  type RunnerOptions,
} from "./run-config.js";

export const MAX_OUTPUT_BYTES = 128 * 1024;

type SpawnProcess = (command: string, args: string[], options: SpawnOptions) => ChildProcess;

type InternalRun = PublicRunState & {
  containerName: string;
  process: ChildProcess;
  stopRequested: boolean;
  stdout: string;
  stderr: string;
  result: RunResult;
  watchdog?: ReturnType<typeof setTimeout>;
  hardDeadline?: ReturnType<typeof setTimeout>;
};

// k6 uses ANSI sequences for terminal formatting. Browsers should receive
// plain text, and the rolling tail prevents a long run from growing memory
// without a bound while retaining the final summary.
export function stripAnsi(value: string) {
  return value.replace(/[\u001B\u009B][[\]()#;?]*(?:(?:(?:[a-zA-Z\d]*(?:;[-a-zA-Z\d/#&.:=?%@~_]+)*)?\u0007)|(?:(?:\d{1,4}(?:[;:]\d{0,4})*)?[\dA-PR-TZcf-nq-uy=><~]))/g, "");
}

export function appendOutput(current: string, chunk: Buffer | string, maximumBytes = MAX_OUTPUT_BYTES) {
  const clean = stripAnsi(current + chunk.toString());
  const bytes = Buffer.from(clean);
  if (bytes.byteLength <= maximumBytes) return clean;
  return bytes.subarray(bytes.byteLength - maximumBytes).toString("utf8").replace(/^\uFFFD/, "");
}

export function parseK6Summary(output: string): RunResultSummary | undefined {
  const summary: RunResultSummary = {};
  const requests = /^\s*http_reqs\.*:\s+(\d+)\s+([\d.]+)\/s/m.exec(output);
  const failures = /^\s*http_req_failed\.*:\s+([\d.]+)%/m.exec(output);
  const latency = /^\s*http_req_duration\.*:.*?\bp\(95\)=([^\s]+).*?\bp\(99\)=([^\s]+)/m.exec(output);
  const dropped = /^\s*dropped_iterations\.*:\s+(\d+)/m.exec(output);
  const duration = /^running\s+\(([^)]+)\)/m.exec(output);
  const readRequests = /^\s*scalelab_mixed_read_requests\.*:\s+(\d+)/m.exec(output);
  const writeRequests = /^\s*scalelab_mixed_write_requests\.*:\s+(\d+)/m.exec(output);
  const successfulOrders = /^\s*scalelab_mixed_orders_successful\.*:\s+(\d+)/m.exec(output);

  if (requests) {
    summary.completedRequests = Number(requests[1]);
    summary.achievedRps = Number(requests[2]);
  }
  if (failures) summary.failureRate = Number(failures[1]);
  if (latency) {
    summary.p95 = latency[1];
    summary.p99 = latency[2];
  }
  if (dropped) summary.droppedIterations = Number(dropped[1]);
  if (duration) summary.testDuration = duration[1];
  if (readRequests) summary.readRequests = Number(readRequests[1]);
  if (writeRequests) summary.writeRequests = Number(writeRequests[1]);
  if (successfulOrders) summary.successfulOrders = Number(successfulOrders[1]);

  return Object.keys(summary).length > 0 ? summary : undefined;
}

function publicState(run: InternalRun): PublicRunState {
  const {
    containerName: _containerName,
    process: _process,
    stopRequested: _stopRequested,
    stdout: _stdout,
    stderr: _stderr,
    result: _result,
    watchdog: _watchdog,
    hardDeadline: _hardDeadline,
    ...state
  } = run;
  return structuredClone(state);
}

export class K6RunManager {
  private currentRun: InternalRun | null = null;
  private lastEndedAt = 0;

  constructor(
    private readonly options: RunnerOptions,
    private readonly cooldownSeconds: number,
    private readonly spawnProcess: SpawnProcess = spawn,
  ) {}

  current() {
    return this.currentRun ? publicState(this.currentRun) : null;
  }

  limits() { return { ...this.options.resourceLimits ?? defaultResourceLimits }; }

  result(): RunResult {
    const run = this.currentRun;
    if (!run) return { runId: null, available: false };
    return structuredClone({ ...run.result, stdout: run.stdout, stderr: run.stderr });
  }

  start(input: RunRequest) {
    if (this.currentRun && ["starting", "running", "stopping"].includes(this.currentRun.status)) {
      throw new Error("A load test is already running");
    }

    const cooldownRemaining = this.cooldownSeconds - Math.floor((Date.now() - this.lastEndedAt) / 1_000);
    if (this.lastEndedAt && cooldownRemaining > 0) {
      throw new Error(`Please wait ${cooldownRemaining} seconds before starting another test`);
    }

    const id = randomUUID().slice(0, 8);
    const invocation = buildK6Invocation(input, id, this.options);
    const startedAt = new Date().toISOString();
    const child = this.spawnProcess(invocation.command, invocation.args, {
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });

    const run: InternalRun = {
      id,
      status: "starting",
      type: input.type,
      configuration: input,
      startedAt,
      endedAt: null,
      failureReason: null,
      events: [
        { timestamp: startedAt, message: "Run created", detail: `${input.type} workload` },
        { timestamp: startedAt, message: "Starting k6" },
        { timestamp: startedAt, message: `Target set to ${input.targetRps.toLocaleString()} RPS` },
      ],
      containerName: invocation.containerName,
      process: child,
      stopRequested: false,
      stdout: "",
      stderr: "",
      result: { runId: id, available: false },
      resources: resourcesForRun(input, this.options.resourceLimits),
    };
    this.currentRun = run;
    // Container-level limits bound resources; this also bounds a stuck workload
    // even if k6 does not exit after its scheduled duration and graceful stop.
    run.watchdog = setTimeout(() => {
      if (["starting", "running"].includes(run.status)) this.stop();
    }, (parseDuration(input.duration) + 60) * 1_000);
    run.watchdog.unref();
    run.hardDeadline = setTimeout(() => {
      if (run.endedAt) return;
      const force = this.spawnProcess("docker", ["rm", "--force", run.containerName], { shell: false, stdio: "ignore", windowsHide: true });
      force.once("error", () => {
        run.events.push({ timestamp: new Date().toISOString(), message: "Generator watchdog failed", detail: "Operator must check Docker connectivity." });
      });
    }, (parseDuration(input.duration) + 90) * 1_000);
    run.hardDeadline.unref();

    child.stdout?.on("data", (chunk: Buffer) => {
      run.stdout = appendOutput(run.stdout, chunk);
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      run.stderr = appendOutput(run.stderr, chunk);
    });

    child.once("spawn", () => {
      run.status = "running";
      run.events.push({ timestamp: new Date().toISOString(), message: "Test running" });
    });

    child.once("error", (error) => {
      clearTimeout(run.watchdog);
      clearTimeout(run.hardDeadline);
      run.status = "failed";
      run.failureReason = error.message;
      run.endedAt = new Date().toISOString();
      run.events.push({ timestamp: run.endedAt, message: "Test failed", detail: error.message });
      run.result = {
        runId: run.id,
        available: true,
        exitCode: null,
        stopped: run.stopRequested,
        stdout: run.stdout,
        stderr: run.stderr,
        completedAt: run.endedAt,
        summary: parseK6Summary(`${run.stdout}\n${run.stderr}`),
      };
      this.lastEndedAt = Date.now();
    });

    child.once("close", (code) => {
      clearTimeout(run.watchdog);
      clearTimeout(run.hardDeadline);
      if (run.endedAt) return;
      run.endedAt = new Date().toISOString();
      this.lastEndedAt = Date.now();
      run.result = {
        runId: run.id,
        available: true,
        exitCode: code,
        stopped: run.stopRequested,
        stdout: run.stdout,
        stderr: run.stderr,
        completedAt: run.endedAt,
        summary: parseK6Summary(`${run.stdout}\n${run.stderr}`),
      };
      run.events.push({
        timestamp: run.endedAt,
        message: "k6 exited",
        detail: `Exit code ${code ?? "unknown"}${run.stopRequested ? " after stop request" : ""}`,
      });
      if (run.stopRequested) {
        run.status = "completed";
        run.events.push({ timestamp: run.endedAt, message: "Test stopped" });
      } else if (code === 0) {
        run.status = "completed";
        run.events.push({ timestamp: run.endedAt, message: "Test completed" });
      } else {
        run.status = "failed";
        run.failureReason = run.stderr.trim().slice(-2_000) || `k6 container exited with code ${code ?? "unknown"}`;
        run.events.push({ timestamp: run.endedAt, message: "Test failed", detail: run.failureReason });
      }
    });

    return publicState(run);
  }

  stop() {
    const run = this.currentRun;
    if (!run || !["starting", "running"].includes(run.status)) throw new Error("No active load test");

    run.status = "stopping";
    run.stopRequested = true;
    run.events.push({ timestamp: new Date().toISOString(), message: "Stop requested" });
    const stopProcess = this.spawnProcess("docker", ["stop", "--time", "10", run.containerName], {
      shell: false,
      stdio: "ignore",
      windowsHide: true,
    });
    stopProcess.once("error", (error) => {
      // A failed `docker stop` call does not mean the k6 process exited. Keep
      // monitoring it and allow another stop attempt; cleanup must only start
      // after the real child process emits `close`.
      run.status = "running";
      run.stopRequested = false;
      run.failureReason = `Could not stop k6: ${error.message}`;
      run.events.push({ timestamp: new Date().toISOString(), message: "Stop failed", detail: error.message });
    });
    stopProcess.once("close", (code) => {
      if (code !== 0 && !run.endedAt && run.status === "stopping") {
        run.status = "running";
        run.stopRequested = false;
        run.failureReason = "Docker could not confirm the stop. Retry or inspect the generator.";
        run.events.push({ timestamp: new Date().toISOString(), message: "Stop failed", detail: run.failureReason });
      }
    });
    return publicState(run);
  }
}
