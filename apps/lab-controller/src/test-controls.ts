import { randomUUID } from "node:crypto";
import type { RunRequest, RunState } from "./run-schema.js";
import type { RunProvider } from "./app.js";
import type { PodWarmup } from "./warmup.js";

// One lab-controller replica serializes mutations, including the asynchronous
// gap between checking current state and asking the private generator to start.
export class TestControls {
  private busy = false;
  private lastPreparationAt = 0;
  private lastResetAt = 0;
  private preparation: RunState | null = null;
  private preparationTask: Promise<void> | null = null;
  private cancelled = false;
  private preparedRun: { id: string; startedAt: string; events: RunState["events"] } | null = null;
  constructor(private readonly runs: RunProvider, private readonly warmup?: Pick<PodWarmup, "start" | "current" | "restore">, private readonly pollMs = 1_000) {}

  private async exclusively<T>(action: () => Promise<T>) {
    if (this.busy) throw new Error("Another control operation is already running; please retry shortly");
    this.busy = true;
    try { return await action(); } finally { this.busy = false; }
  }

  private async ensureIdle() {
    if (this.preparationTask) throw new Error("A test preparation is already running");
    if (this.runs.lifecycleBusy?.()) throw new Error("A test lifecycle is already running; wait for cleanup and pod restoration");
    const run = await this.runs.current();
    if (run && ["preparing", "starting", "running", "stopping", "resetting", "restoring"].includes(run.status)) throw new Error("A load test or cleanup is already running");
  }

  start(input: RunRequest, warmStart = false) {
    return this.exclusively(async () => {
      await this.ensureIdle();
      if (warmStart) {
        if (!this.warmup) throw new Error("Pod warm-up is disabled in this environment");
        if (Date.now() - this.lastPreparationAt < 60_000) throw new Error("Please wait before preparing pods again");
        this.lastPreparationAt = Date.now();
        this.cancelled = false;
        this.preparation = { id: `preparing-${randomUUID()}`, status: "preparing", type: input.type,
          configuration: input, startedAt: new Date().toISOString(), endedAt: null, failureReason: null,
          events: [{ timestamp: new Date().toISOString(), message: "Preparing API pods" }] };
        // Return promptly; the server owns preparation even if the browser closes.
        this.preparationTask = this.prepareAndStart(input).finally(() => { this.preparationTask = null; });
        return structuredClone(this.preparation);
      }
      const state = await this.warmup?.current();
      if (state?.status === "warming") throw new Error("Pod preparation is already running; wait for readiness or restore autoscaling");
      this.preparation = null;
      return this.runs.start(input);
    });
  }
  async current() {
    if (this.preparation) return structuredClone(this.preparation);
    const run = await this.runs.current();
    return run && this.preparedRun?.id === run.id ? { ...run, startedAt: this.preparedRun.startedAt, events: [...this.preparedRun.events, ...run.events] } : run;
  }
  result() { return this.preparation ? Promise.resolve({ runId: this.preparation.id, available: false }) : this.runs.result(); }
  stop() { return this.exclusively(async () => {
    if (!this.preparationTask) return this.runs.stop();
    this.cancelled = true;
    if (this.preparation) this.preparation.status = "stopping";
    await this.preparationTask;
    return (await this.current())!;
  }); }

  private async prepareAndStart(input: RunRequest) {
    const preparation = this.preparation!;
    try {
      let state = await this.warmup!.start();
      while (!this.cancelled && state.status === "warming") {
        await new Promise((resolve) => setTimeout(resolve, this.pollMs));
        state = await this.warmup!.current();
      }
      if (this.cancelled) throw new Error("Pod preparation cancelled");
      if (state.status !== "ready") throw new Error(state.message || "API pod preparation did not reach readiness");
      preparation.status = "starting";
      preparation.events.push({ timestamp: new Date().toISOString(), message: "API pods ready - starting load test" });
      const run = await this.runs.start(input);
      this.preparedRun = { id: run.id, startedAt: preparation.startedAt, events: preparation.events };
      // A cancellation may arrive while the private generator accepts the start.
      // Stop that accepted run instead of leaving it detached from the dashboard.
      this.preparation = null;
      if (this.cancelled) {
        try { await this.runs.stop(); }
        catch { this.preparedRun.events.push({ timestamp: new Date().toISOString(), message: "Stop request failed", detail: "The generator accepted the test; retry Stop. Autoscaling is restored when the test exits or its lease expires." }); }
      }
    } catch (error) {
      preparation.status = "restoring";
      preparation.events.push({ timestamp: new Date().toISOString(), message: "Restoring normal autoscaling" });
      let reason = error instanceof Error ? error.message : "Pod preparation failed";
      try { await this.warmup!.restore(); }
      catch { reason += "; restoration failed; persisted lease recovery will retry"; }
      preparation.status = "failed";
      preparation.failureReason = reason;
      preparation.endedAt = new Date().toISOString();
      preparation.events.push({ timestamp: preparation.endedAt, message: this.cancelled ? "Preparation cancelled" : "Preparation failed", detail: reason });
    }
  }

  // Deterministic lifecycle tests need not depend on browser polling.
  async waitForPreparation() { await this.preparationTask; }
  reset() { return this.exclusively(async () => {
    await this.ensureIdle();
    if (Date.now() - this.lastResetAt < 30_000) throw new Error("Please wait 30 seconds between benchmark resets");
    this.lastResetAt = Date.now();
    return this.runs.resetBenchmark();
  }); }
  prepare() {
    return this.exclusively(async () => {
      await this.ensureIdle();
      if (!this.warmup) throw new Error("Pod warm-up is disabled in this environment");
      const state = await this.warmup.current();
      if (["warming", "ready"].includes(state.status)) return state;
      if (Date.now() - this.lastPreparationAt < 60_000) throw new Error("Please wait before preparing pods again");
      this.lastPreparationAt = Date.now();
      return this.warmup.start();
    });
  }
  restore() { return this.exclusively(async () => { await this.ensureIdle(); if (!this.warmup) throw new Error("Pod warm-up is disabled in this environment"); return this.warmup.restore(); }); }
  async warmupState() {
    return this.exclusively(async () => this.warmup ? this.warmup.current() : {
      status: "disabled" as const, readyReplicas: null, desiredReplicas: null,
      targetReplicas: null, baselineReplicas: null, expiresAt: null, message: "Pod warm-up requires the Kubernetes deployment configuration.",
    });
  }
}
