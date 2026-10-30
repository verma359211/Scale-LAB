import type { MetricPoint, RunResult, RunState } from "../lab-types";

export const isRunActive = (run: RunState | null) => !!run &&
  ["preparing", "starting", "running", "stopping", "resetting", "restoring"].includes(run.status);

export function runLabel(run: RunState | null, result?: RunResult | null) {
  if (!run) return "Ready for an experiment";
  if (run.status === "failed") return "Experiment failed";
  if (isRunActive(run)) return {
    preparing: "Preparing API pods", starting: "Starting traffic", running: "Experiment running",
    stopping: "Stopping traffic", resetting: "Cleaning benchmark data", restoring: "Restoring autoscaling",
  }[run.status as "preparing" | "starting" | "running" | "stopping" | "resetting" | "restoring"];
  if ((result?.runId === run.id && result.stopped) || run.events.some((event) => event.message === "Test stopped")) return "Experiment stopped";
  if (result?.runId === run.id && ((result.exitCode != null && result.exitCode !== 0) || (result.summary?.failureRate ?? 0) >= 1)) return "Completed with failures";
  return "Experiment completed";
}

export function readableDuration(duration: string) {
  const match = /^(\d+)(s|m)$/.exec(duration);
  if (!match) return duration;
  const seconds = Number(match[1]) * (match[2] === "m" ? 60 : 1);
  return seconds < 60 ? `${seconds} sec` : `${Math.floor(seconds / 60)} min${seconds % 60 ? ` ${seconds % 60} sec` : ""}`;
}

export function replicaObservation(run: RunState, points: MetricPoint[]) {
  // Exclude optional prewarming and post-workload cleanup. Never attribute current
  // replica counts to an old test, or claim that an observed increase proves causality.
  const started = run.events.find((event) => event.message === "Test running")?.timestamp;
  const exited = run.events.find((event) => event.message === "k6 exited")?.timestamp;
  if (!started && run.events.some((event) => event.message === "Preparing API pods")) return null;
  const start = Date.parse(started ?? run.startedAt);
  const end = Date.parse(exited ?? run.endedAt ?? new Date().toISOString());
  const samples = points.filter((point) => point.timestamp >= start && point.timestamp <= end && Number.isFinite(point.value)).sort((a, b) => a.timestamp - b.timestamp);
  if (samples.length < 2) return null;
  return {
    min: Math.min(...samples.map((point) => point.value)),
    max: Math.max(...samples.map((point) => point.value)),
    increased: samples.some((point, index) => index > 0 && point.value > samples[index - 1]!.value),
    start: samples[0]!.timestamp,
    end: samples[samples.length - 1]!.timestamp,
  };
}
