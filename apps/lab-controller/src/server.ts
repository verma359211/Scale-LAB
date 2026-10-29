import { createApp } from "./app.js";
import { BenchmarkResetClient } from "./benchmark-reset.js";
import { config } from "./config.js";
import { LoadGeneratorClient } from "./load-generator.js";
import { PrometheusClient } from "./prometheus.js";
import { RunCoordinator } from "./run-coordinator.js";
import { KubernetesClient } from "./kubernetes.js";
import { PodWarmup } from "./warmup.js";

const metrics = new PrometheusClient(config.prometheusUrl, config.upstreamTimeoutMs);
const loadGenerator = new LoadGeneratorClient(
  config.loadGeneratorUrl,
  config.upstreamTimeoutMs,
  config.loadGeneratorControlToken,
);
const benchmarkReset = new BenchmarkResetClient(
  config.benchmarkResetUrl,
  config.benchmarkResetToken,
  config.upstreamTimeoutMs,
);
const warmup = config.warmupEnabled ? new PodWarmup(new KubernetesClient()) : undefined;
const runs = new RunCoordinator(loadGenerator, benchmarkReset, 1_000, warmup ? async () => { await warmup.restore(); } : undefined);
const app = createApp(metrics, runs, { warmup, controlsEnabled: config.controlsEnabled, allowedOrigin: config.allowedOrigin });

if (warmup) {
  // Recovery does not depend on the browser. The separate CronJob also restores
  // expired leases if this process is unavailable or restarts.
  const recover = () => warmup.current().catch(() => console.error(JSON.stringify({ service: "lab-controller", event: "warmup-recovery-retry" })));
  void recover();
  setInterval(() => void recover(), 10_000).unref();
}

app.listen(config.port, () => {
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    service: "lab-controller",
    event: "started",
    port: config.port,
  }));
});
