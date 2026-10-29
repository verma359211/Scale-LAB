import { configuredTarget } from "./target.js";
import { defaultResourceLimits, resourcesForRun } from "./run-config.js";

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

const resourceLimits = {
  preAllocatedVUs: positiveInteger(process.env.K6_PREALLOCATED_VUS, 500, "K6_PREALLOCATED_VUS"),
  maxVUs: positiveInteger(process.env.K6_MAX_VUS, 4_000, "K6_MAX_VUS"),
  vuBudget: positiveInteger(process.env.K6_VU_BUDGET, 4_000, "K6_VU_BUDGET"),
  cpus: positiveInteger(process.env.K6_CPUS, defaultResourceLimits.cpus, "K6_CPUS"),
  memory: process.env.K6_MEMORY ?? defaultResourceLimits.memory,
  pids: positiveInteger(process.env.K6_PIDS_LIMIT, defaultResourceLimits.pids, "K6_PIDS_LIMIT"),
};
if (!/^[1-9]\d*[mg]$/.test(resourceLimits.memory)) throw new Error("K6_MEMORY must be a positive Docker memory budget, for example 2g or 512m");
resourcesForRun({ type: "static", targetRps: 50, duration: "30s" }, resourceLimits);

export const config = {
  resourceLimits,
  port: positiveInteger(process.env.PORT, 4100, "PORT"),
  targetUrl: configuredTarget(process.env.SCALELAB_TARGET_URL),
  controlToken: requiredSecret(process.env.LOADGEN_CONTROL_TOKEN, "LOADGEN_CONTROL_TOKEN"),
  k6Image: process.env.K6_IMAGE ?? "grafana/k6:1.8.1",
  loadTestsDirectory: process.env.LOAD_TESTS_DIR ?? "/load-tests",
  cooldownSeconds: positiveInteger(process.env.RUN_COOLDOWN_SECONDS, 30, "RUN_COOLDOWN_SECONDS"),
};
