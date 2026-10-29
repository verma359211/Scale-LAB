function positiveInteger(value: string | undefined, fallback: number, name: string) {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) throw new Error(`${name} must be a positive integer`);
  return parsed;
}

function requiredSecret(value: string | undefined, name: string) {
  const secret = value?.trim();
  if (!secret) throw new Error(`${name} must be configured`);
  return secret;
}

export const config = {
  controlsEnabled: process.env.PUBLIC_CONTROLS_ENABLED !== "false",
  allowedOrigin: process.env.PUBLIC_ORIGIN ?? "https://scalelab.chandanverma.space",
  warmupEnabled: process.env.KUBERNETES_WARMUP_ENABLED === "true",
  port: positiveInteger(process.env.PORT, 4000, "PORT"),
  prometheusUrl: process.env.PROMETHEUS_URL ?? "http://localhost:9090",
  loadGeneratorUrl: process.env.LOADGEN_CONTROLLER_URL ?? "http://localhost:4100",
  benchmarkResetUrl: process.env.BENCHMARK_RESET_URL ?? "http://localhost:3001/internal/benchmark/reset",
  benchmarkResetToken: process.env.BENCHMARK_RESET_TOKEN?.trim() ?? "",
  loadGeneratorControlToken: requiredSecret(process.env.LOADGEN_CONTROL_TOKEN, "LOADGEN_CONTROL_TOKEN"),
  upstreamTimeoutMs: positiveInteger(process.env.UPSTREAM_TIMEOUT_MS, 5_000, "UPSTREAM_TIMEOUT_MS"),
};
