export type MetricKey =
  | "requestRps"
  | "p95LatencyMs"
  | "p99LatencyMs"
  | "httpErrorRate"
  | "apiPodCount"
  | "desiredPodCount"
  | "apiCpuPercent"
  | "apiCpuMillicores"
  | "redisHitRatio"
  | "postgresP95LatencyMs"
  | "activeRequests"
  | "ingressRps"
  | "apiCpuTotalMillicores"
  | "poolWaiters"
  | "successfulOrdersRps";

export type MetricPoint = { timestamp: number; value: number };
export type MetricsSummary = {
  generatedAt: string;
  metrics: Record<MetricKey, number | null>;
  unavailable: MetricKey[];
};
export type MetricsTimeseries = {
  generatedAt: string;
  start: string;
  end: string;
  stepSeconds: number;
  series: Record<MetricKey, MetricPoint[]>;
  unavailable: MetricKey[];
  perPod: Record<"cpuPercent" | "requestRps", Array<{ pod: string; points: MetricPoint[] }>>;
};

export type TestType = "static" | "mixed" | "ramp" | "spike";
export type RunRequest = {
  type: TestType;
  targetRps: number;
  duration: string;
  readPercent?: number;
  writePercent?: number;
  preAllocatedVUs?: number;
  maxVUs?: number;
};
export type RunEvent = { timestamp: string; message: string; detail?: string };
export type RunState = {
  id: string;
  status: "preparing" | "starting" | "running" | "stopping" | "resetting" | "restoring" | "completed" | "failed";
  type: TestType;
  configuration: RunRequest;
  startedAt: string;
  endedAt: string | null;
  failureReason: string | null;
  events: RunEvent[];
  resources?: { preAllocatedVUs: number; maxVUs: number; cpus: number; memory: string; pids: number };
  cleanup?: {
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
};

export type RunResult = {
  runId: string | null;
  available: boolean;
  exitCode?: number | null;
  stopped?: boolean;
  stdout?: string;
  stderr?: string;
  completedAt?: string;
  summary?: {
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
};

export type BenchmarkResetResult = {
  status: "completed";
  shards: Array<{
    shard: number;
    status: "completed" | "failed";
    ordersDeleted?: number;
    productsRestored?: number;
  }>;
};

export type WarmupState = {
  status: "idle" | "warming" | "ready" | "failed" | "disabled";
  readyReplicas: number | null;
  desiredReplicas: number | null;
  targetReplicas: number | null;
  baselineReplicas: number | null;
  expiresAt: string | null;
  message: string;
};
export type LabConfiguration = {
  controlsEnabled: boolean;
  generator: { preAllocatedVUs: number; maxVUs: number; vuBudget: number; cpus: number; memory: string; pids: number } | null;
  presets: Array<{ id: string; name: string; description: string; observe: string; profile: string; warmup: string; configuration: RunRequest }>;
};
export type StartRunRequest = (RunRequest | { preset: string }) & { warmStart?: boolean };
