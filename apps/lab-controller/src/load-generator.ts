import type { RunRequest, RunResult, RunState } from "./run-schema.js";

export class LoadGeneratorClient {
  constructor(
    private readonly baseUrl: string,
    private readonly timeoutMs: number,
    private readonly controlToken: string,
  ) {}

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      signal: AbortSignal.timeout(this.timeoutMs),
      headers: { "Content-Type": "application/json", "x-scalelab-control-token": this.controlToken, ...init?.headers },
    });
    const body = await response.json().catch(() => null) as { error?: string } | null;
    if (!response.ok) throw new Error(body?.error ?? `Load generator returned HTTP ${response.status}`);
    return body as T;
  }

  start(input: RunRequest) {
    return this.request<RunState>("/runs", { method: "POST", body: JSON.stringify(input) });
  }

  current() {
    return this.request<RunState | null>("/runs/current");
  }

  result() {
    return this.request<RunResult>("/runs/current/result");
  }

  stop() {
    return this.request<RunState>("/runs/current/stop", { method: "POST" });
  }

  limits() { return this.request<unknown>("/limits"); }
}
