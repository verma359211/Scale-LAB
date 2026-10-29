import type { BenchmarkResetResult } from "./benchmark-reset.js";
import type { RunRequest, RunResult, RunState, CleanupState, RunEvent } from "./run-schema.js";

export type LoadGeneratorProvider = {
  start(input: RunRequest): Promise<RunState>;
  current(): Promise<RunState | null>;
  result(): Promise<RunResult>;
  stop(): Promise<RunState>;
  limits?(): Promise<unknown>;
};

export type BenchmarkResetProvider = {
  reset(): Promise<BenchmarkResetResult>;
};

type Session = {
  runId: string;
  latest: RunState;
  cleanup: CleanupState;
  events: RunEvent[];
  workflowEndedAt: string | null;
  restoration: "pending" | "completed" | "failed" | null;
  restorationFailure: string | null;
};

const terminal = (status: RunState["status"]) => status === "completed" || status === "failed";
const needsCleanup = (input: RunRequest) => input.type === "mixed" && (input.writePercent ?? 30) > 0;
const deferredSuccessEvent = (event: RunEvent) => event.message === "Test completed" || event.message === "Test stopped";

export class RunCoordinator {
  private session: Session | null = null;
  private monitorPromise: Promise<void> | null = null;
  private monitoring = false;

  constructor(
    private readonly loadGenerator: LoadGeneratorProvider,
    private readonly benchmarkReset: BenchmarkResetProvider,
    private readonly pollIntervalMs = 1_000,
    private readonly onTerminal?: () => Promise<void>,
  ) {}

  async start(input: RunRequest) {
    if (this.monitoring) throw new Error("A test lifecycle is already running; wait for cleanup and preparation restore");
    if (this.session && ["pending", "running"].includes(this.session.cleanup.status)) {
      throw new Error("Benchmark cleanup is still in progress");
    }
    const run = await this.loadGenerator.start(input);
    const required = needsCleanup(input);
    this.session = {
      runId: run.id,
      latest: run,
      cleanup: {
        required,
        status: required ? "pending" : "not_required",
        failureReason: null,
      },
      events: [],
      workflowEndedAt: null,
      restoration: this.onTerminal ? "pending" : null,
      restorationFailure: null,
    };
    if (required || this.onTerminal) {
      this.monitoring = true;
      this.monitorPromise = this.monitor(run.id).finally(() => { this.monitoring = false; });
    }
    return this.merge(run);
  }

  async current() {
    const run = await this.loadGenerator.current();
    if (!run) return null;
    if (this.session?.runId === run.id) this.session.latest = run;
    return this.merge(run);
  }

  async stop() {
    const run = await this.loadGenerator.stop();
    if (this.session?.runId === run.id) this.session.latest = run;
    return this.merge(run);
  }

  result() {
    return this.loadGenerator.result();
  }

  limits() { return this.loadGenerator.limits?.() ?? Promise.resolve(null); }
  lifecycleBusy() { return this.monitoring; }

  async resetBenchmark() {
    if (this.session && ["pending", "running"].includes(this.session.cleanup.status)) {
      throw new Error("Benchmark cleanup is already in progress");
    }
    const current = await this.loadGenerator.current();
    if (current && !terminal(current.status)) throw new Error("Cannot reset benchmark data while a test is running");
    return this.benchmarkReset.reset();
  }

  // Kept public for deterministic tests; production cleanup starts from
  // start() and never depends on a browser request or polling endpoint.
  async waitForMonitor() {
    await this.monitorPromise;
  }

  private merge(run: RunState): RunState {
    const session = this.session;
    if (!session || session.runId !== run.id) return run;

    let status = run.status;
    let failureReason = run.failureReason;
    let endedAt = run.endedAt;
    if (session.cleanup.status === "running" || (session.cleanup.status === "pending" && terminal(run.status))) {
      status = "resetting";
      endedAt = null;
    } else if (session.cleanup.status === "failed") {
      status = "failed";
      endedAt = session.workflowEndedAt;
      failureReason = run.failureReason ?? `Benchmark cleanup failed: ${session.cleanup.failureReason}`;
    } else if (session.cleanup.status === "completed") {
      endedAt = session.workflowEndedAt;
    }

    if (terminal(run.status) && session.restoration === "pending" && !["pending", "running"].includes(session.cleanup.status)) {
      status = "restoring";
      endedAt = null;
    } else if (session.restoration === "failed") {
      status = "failed";
      failureReason = failureReason ?? session.restorationFailure;
      endedAt = session.workflowEndedAt;
    } else if (session.restoration === "completed") {
      endedAt = session.workflowEndedAt;
    }

    const upstreamEvents = session.cleanup.required || this.onTerminal
      ? run.events.filter((event) => !deferredSuccessEvent(event))
      : run.events;

    return {
      ...run,
      status,
      endedAt,
      failureReason,
      cleanup: structuredClone(session.cleanup),
      events: [...upstreamEvents, ...session.events].sort((left, right) => left.timestamp.localeCompare(right.timestamp)),
    };
  }

  private async monitor(runId: string) {
    while (this.session?.runId === runId) {
      await new Promise((resolve) => setTimeout(resolve, this.pollIntervalMs));
      let run: RunState | null;
      try {
        run = await this.loadGenerator.current();
      } catch {
        continue;
      }
      if (!run || run.id !== runId) continue;
      this.session.latest = run;
      if (!terminal(run.status)) continue;

      if (!this.session.cleanup.required) {
        await this.restoreWarmup();
        return;
      }
      this.session.cleanup.status = "running";
      this.session.events.push({ timestamp: new Date().toISOString(), message: "Resetting benchmark data" });
      try {
        const result = await this.benchmarkReset.reset();
        this.session.cleanup.status = "completed";
        this.session.cleanup.shards = result.shards;
        this.session.events.push({ timestamp: new Date().toISOString(), message: "Benchmark data reset" });
        const completedAt = new Date().toISOString();
        this.session.workflowEndedAt = completedAt;
        if (run.status === "completed" && !this.onTerminal) {
          const stopped = run.events.some((event) => event.message === "Test stopped");
          this.session.events.push({ timestamp: completedAt, message: stopped ? "Test stopped" : "Test completed" });
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown benchmark reset failure";
        this.session.cleanup.status = "failed";
        this.session.cleanup.failureReason = message;
        const failedAt = new Date().toISOString();
        this.session.workflowEndedAt = failedAt;
        this.session.events.push({ timestamp: failedAt, message: "Cleanup failed", detail: message });
      }
      await this.restoreWarmup();
      return;
    }
  }

  private async restoreWarmup() {
    if (!this.onTerminal || !this.session) return;
    const session = this.session;
    session.events.push({ timestamp: new Date().toISOString(), message: "Restoring normal autoscaling" });
    try {
      await this.onTerminal();
      session.restoration = "completed";
      session.workflowEndedAt = new Date().toISOString();
      session.events.push({ timestamp: session.workflowEndedAt, message: "Normal autoscaling restored" });
      if (session.latest.status === "completed" && session.cleanup.status !== "failed") {
        const stopped = session.latest.events.some((event) => event.message === "Test stopped");
        session.events.push({ timestamp: session.workflowEndedAt, message: stopped ? "Test stopped" : "Test completed" });
      }
    } catch {
      session.restoration = "failed";
      session.restorationFailure = "Autoscaling restoration failed; persisted lease recovery will retry.";
      session.workflowEndedAt = new Date().toISOString();
      session.events.push({ timestamp: session.workflowEndedAt, message: "Warm-up restore pending", detail: session.restorationFailure });
    }
  }
}
