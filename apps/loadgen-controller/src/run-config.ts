import { z } from "zod";

export const testTypes = ["static", "mixed", "ramp", "spike"] as const;
export type TestType = typeof testTypes[number];
export const MAX_DURATION_SECONDS = 600;

export const runRequestSchema = z.object({
  type: z.enum(testTypes),
  targetRps: z.number().int().min(50).max(Number.MAX_SAFE_INTEGER),
  duration: z.string().regex(/^\d+(s|m)$/),
  readPercent: z.number().int().min(0).max(100).optional(),
  writePercent: z.number().int().min(0).max(100).optional(),
  preAllocatedVUs: z.number().int().positive().optional(),
  maxVUs: z.number().int().positive().optional(),
}).strict().superRefine((value, context) => {
  const durationSeconds = parseDuration(value.duration);
  if (!Number.isFinite(durationSeconds) || durationSeconds < 30 || durationSeconds > MAX_DURATION_SECONDS) {
    context.addIssue({ code: "custom", path: ["duration"], message: "Duration must be between 30 seconds and 10 minutes" });
  }
  if (value.type === "mixed" && (value.readPercent ?? 70) + (value.writePercent ?? 30) !== 100) {
    context.addIssue({ code: "custom", path: ["readPercent"], message: "Read and write percentages must total 100" });
  }
  if (value.preAllocatedVUs && value.maxVUs && value.preAllocatedVUs > value.maxVUs) {
    context.addIssue({ code: "custom", path: ["preAllocatedVUs"], message: "Preallocated VUs cannot exceed maximum VUs" });
  }
});

export type RunRequest = z.infer<typeof runRequestSchema>;

export function parseDuration(duration: string) {
  const match = /^(\d+)(s|m)$/.exec(duration);
  if (!match) return Number.NaN;
  const value = Number(match[1]);
  return match[2] === "m" ? value * 60 : value;
}

export type RunEvent = { timestamp: string; message: string; detail?: string };
export type PublicRunState = {
  id: string;
  status: "starting" | "running" | "stopping" | "completed" | "failed";
  type: TestType;
  configuration: RunRequest;
  startedAt: string;
  endedAt: string | null;
  failureReason: string | null;
  events: RunEvent[];
  resources?: RunResources;
};

export type RunResultSummary = {
  completedRequests?: number;
  achievedRps?: number;
  failureRate?: number;
  p95?: string;
  p99?: string;
  droppedIterations?: number;
  testDuration?: string;
  readRequests?: number;
  writeRequests?: number;
  successfulOrders?: number;
};

export type RunResult = {
  runId: string | null;
  available: boolean;
  exitCode?: number | null;
  stopped?: boolean;
  stdout?: string;
  stderr?: string;
  completedAt?: string;
  summary?: RunResultSummary;
};

export type RunnerOptions = {
  targetUrl: string;
  k6Image: string;
  loadTestsDirectory: string;
  resourceLimits?: ResourceLimits;
};

export type RunResources = { preAllocatedVUs: number; maxVUs: number; cpus: number; memory: string; pids: number };
export type ResourceLimits = RunResources & { vuBudget: number };
export const defaultResourceLimits: ResourceLimits = { preAllocatedVUs: 500, maxVUs: 4_000, vuBudget: 4_000, cpus: 2, memory: "2g", pids: 256 };

export function resourcesForRun(input: RunRequest, limits = defaultResourceLimits): RunResources {
  const preAllocatedVUs = input.preAllocatedVUs ?? limits.preAllocatedVUs;
  const maxVUs = input.maxVUs ?? limits.maxVUs;
  if (preAllocatedVUs > maxVUs) throw new Error("Preallocated VUs cannot exceed maximum VUs");
  if (maxVUs > limits.vuBudget) throw new Error(`Requested ${maxVUs} VUs exceeds configured K6_VU_BUDGET=${limits.vuBudget}. Lower MAX VUs or have the operator increase the VM budget.`);
  return { preAllocatedVUs, maxVUs, cpus: limits.cpus, memory: limits.memory, pids: limits.pids };
}

const scripts: Record<TestType, string> = {
  static: "static-capacity.js",
  mixed: "mixed-load.js",
  ramp: "autoscaling-ramp.js",
  spike: "spike.js",
};

function environmentForRun(input: RunRequest, resources: RunResources) {
  const durationSeconds = parseDuration(input.duration);
  const common = {
    BASE_URL: "__TARGET_URL__",
    PRE_VUS: String(resources.preAllocatedVUs),
    MAX_VUS: String(resources.maxVUs),
  };

  if (input.type === "ramp") {
    return {
      ...common,
      STAGE_DURATION: `${(durationSeconds - 4) * 200}ms`,
      RPS_1: String(Math.max(50, Math.round(input.targetRps * 0.25))),
      RPS_2: String(Math.max(50, Math.round(input.targetRps * 0.4))),
      RPS_3: String(Math.max(50, Math.round(input.targetRps * 0.6))),
      RPS_4: String(Math.max(50, Math.round(input.targetRps * 0.8))),
      RPS_5: String(input.targetRps),
    };
  }

  if (input.type === "spike") {
    const steadySeconds = Math.max(10, durationSeconds - 2);
    const warmup = Math.floor(steadySeconds / 4);
    const spike = Math.floor(steadySeconds / 2);
    const recovery = steadySeconds - warmup - spike;
    return {
      ...common,
      BASE_RPS: String(Math.max(50, Math.round(input.targetRps * 0.1))),
      SPIKE_RPS: String(input.targetRps),
      WARMUP_DURATION: `${warmup}s`,
      SPIKE_DURATION: `${spike}s`,
      RECOVERY_DURATION: `${recovery}s`,
    };
  }

  return {
    ...common,
    TARGET_RPS: String(input.targetRps),
    DURATION: input.duration,
    ...(input.type === "mixed" ? {
      READ_PERCENT: String(input.readPercent ?? 70),
      WRITE_PERCENT: String(input.writePercent ?? 30),
    } : {}),
  };
}

export function buildK6Invocation(input: RunRequest, runId: string, options: RunnerOptions) {
  const containerName = `scalelab-k6-${runId}`;
  const args = ["run", "--rm", "--name", containerName, "--label", "scalelab.role=load-test"];
  const resources = resourcesForRun(input, options.resourceLimits);
  args.push("--cpus", String(resources.cpus), "--memory", resources.memory, "--pids-limit", String(resources.pids));

  args.push("--volume", `${options.loadTestsDirectory}:/load-tests:ro`);

  const environment = environmentForRun(input, resources);
  environment.BASE_URL = options.targetUrl;
  for (const [name, value] of Object.entries(environment)) {
    args.push("--env", `${name}=${value}`);
  }

  args.push(options.k6Image, "run", "--quiet", `/load-tests/${scripts[input.type]}`);
  return { command: "docker", args, containerName };
}
