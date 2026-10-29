import { z } from "zod";

export const testTypes = ["static", "mixed", "ramp", "spike"] as const;
export const MAX_DURATION_SECONDS = 600;

export function durationToSeconds(duration: string) {
  const match = /^(\d+)(s|m)$/.exec(duration);
  if (!match) return Number.NaN;
  const value = Number(match[1]);
  return match[2] === "m" ? value * 60 : value;
}

export const runRequestSchema = z.object({
  type: z.enum(testTypes),
  targetRps: z.number().int().min(50).max(Number.MAX_SAFE_INTEGER),
  duration: z.string().regex(/^\d+(s|m)$/),
  readPercent: z.number().int().min(0).max(100).optional(),
  writePercent: z.number().int().min(0).max(100).optional(),
  preAllocatedVUs: z.number().int().positive().optional(),
  maxVUs: z.number().int().positive().optional(),
}).strict().superRefine((value, context) => {
  const seconds = durationToSeconds(value.duration);
  if (!Number.isFinite(seconds) || seconds < 30 || seconds > MAX_DURATION_SECONDS) {
    context.addIssue({
      code: "custom",
      path: ["duration"],
      message: `Duration must be between 30 seconds and ${MAX_DURATION_SECONDS / 60} minutes`,
    });
  }

  if (value.type === "mixed") {
    const read = value.readPercent ?? 70;
    const write = value.writePercent ?? 30;
    if (read + write !== 100) {
      context.addIssue({
        code: "custom",
        path: ["readPercent"],
        message: "Read and write percentages must total 100",
      });
    }
  }
  if (value.preAllocatedVUs && value.maxVUs && value.preAllocatedVUs > value.maxVUs) {
    context.addIssue({ code: "custom", path: ["preAllocatedVUs"], message: "Preallocated VUs cannot exceed maximum VUs" });
  }
});

export type RunRequest = z.infer<typeof runRequestSchema>;

export type RunEvent = {
  timestamp: string;
  message: string;
  detail?: string;
};

export type CleanupState = {
  required: boolean;
  status: "not_required" | "pending" | "running" | "completed" | "failed";
  failureReason: string | null;
  shards?: Array<{
    shard: number;
    status: "completed" | "failed";
    ordersDeleted?: number;
    productsRestored?: number;
  }>;
};

export type RunState = {
  id: string;
  status: "preparing" | "starting" | "running" | "stopping" | "resetting" | "restoring" | "completed" | "failed";
  type: RunRequest["type"];
  configuration: RunRequest;
  startedAt: string;
  endedAt: string | null;
  failureReason: string | null;
  events: RunEvent[];
  cleanup?: CleanupState;
  resources?: { preAllocatedVUs: number; maxVUs: number; cpus: number; memory: string; pids: number };
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
