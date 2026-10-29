import type { MetricsSummary, RunState } from "../lab-types";

export const HPA_TARGET_PERCENT = 70;
export const HPA_MIN_REPLICAS = 2;

export type SystemState = {
  label: string;
  message: string;
  tone: "neutral" | "active" | "warning" | "success" | "danger";
};

export function deriveSystemState(run: RunState | null, summary: MetricsSummary | null): SystemState {
  const metrics = summary?.metrics;
  const ready = metrics?.apiPodCount;
  const desired = metrics?.desiredPodCount;
  const cpu = metrics?.apiCpuPercent;

  if (!run) {
    return { label: "Idle", message: "Waiting for a load test.", tone: "neutral" };
  }

  if (run.status === "failed") {
    return { label: "Failed", message: "The current experiment failed. Review the result and activity feed.", tone: "danger" };
  }

  if (run.status === "resetting" || run.cleanup?.status === "running") {
    return { label: "Resetting benchmark data", message: "Benchmark orders and stock are being restored.", tone: "warning" };
  }

  if (run.status === "preparing") {
    return { label: "Preparing API pods", message: "Waiting for actual pod readiness before starting k6.", tone: "warning" };
  }
  if (run.status === "restoring") {
    return { label: "Restoring normal autoscaling", message: "The workload ended; restoring the original HPA minimum before completing the workflow.", tone: "active" };
  }

  if (["preparing", "starting", "running", "stopping", "restoring"].includes(run.status)) {
    if (ready != null && desired != null && desired > ready) {
      return { label: "Scaling out", message: `Kubernetes wants ${Math.round(desired)} API pods; ${Math.round(ready)} are ready.`, tone: "warning" };
    }
    if (cpu != null && cpu >= HPA_TARGET_PERCENT) {
      return { label: "CPU pressure", message: `API CPU is above the ${HPA_TARGET_PERCENT}% HPA target.`, tone: "warning" };
    }
    if (ready != null && desired != null && ready > HPA_MIN_REPLICAS && ready >= desired) {
      return { label: "New capacity ready", message: `${Math.round(ready)} API pods are ready and serving traffic.`, tone: "success" };
    }
    return {
      label: run.status === "stopping" ? "Stopping load" : "Generating load",
      message: `k6 is targeting ${run.configuration.targetRps.toLocaleString()} requests per second.`,
      tone: "active",
    };
  }

  if ((ready != null && ready > HPA_MIN_REPLICAS) || (desired != null && desired > HPA_MIN_REPLICAS)) {
    return { label: "Cooling down", message: "The test ended; HPA is returning the API toward its minimum replica count.", tone: "neutral" };
  }

  return { label: "Completed", message: "The experiment completed successfully.", tone: "success" };
}
