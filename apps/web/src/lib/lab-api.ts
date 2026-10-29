import type { BenchmarkResetResult, MetricsSummary, MetricsTimeseries, StartRunRequest, RunResult, RunState, WarmupState, LabConfiguration } from "../lab-types";

const baseUrl = import.meta.env.VITE_LAB_API_URL ?? "/lab-api";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });
  const body = await response.json().catch(() => null) as ({ error?: string } & T) | null;
  if (!response.ok) throw new Error(body?.error ?? `Lab controller returned HTTP ${response.status}`);
  return body as T;
}

export const labApi = {
  summary: (signal?: AbortSignal) => request<MetricsSummary>("/metrics/summary", { signal }),
  timeseries: (windowMinutes: 5 | 10, signal?: AbortSignal) => request<MetricsTimeseries>(`/metrics/timeseries?window=${windowMinutes}`, { signal }),
  currentRun: (signal?: AbortSignal) => request<RunState | null>("/runs/current", { signal }),
  runResult: (signal?: AbortSignal) => request<RunResult>("/runs/current/result", { signal }),
  startRun: (input: StartRunRequest) => request<RunState>("/runs", { method: "POST", body: JSON.stringify(input) }),
  stopRun: () => request<RunState>("/runs/current/stop", { method: "POST" }),
  resetBenchmark: () => request<BenchmarkResetResult>("/benchmark/reset", { method: "POST" }),
  configuration: (signal?: AbortSignal) => request<LabConfiguration>("/config", { signal }),
  warmup: (signal?: AbortSignal) => request<WarmupState>("/warmup", { signal }),
  preparePods: () => request<WarmupState>("/warmup", { method: "POST", body: "{}" }),
  restorePods: () => request<WarmupState>("/warmup/restore", { method: "POST" }),
};
