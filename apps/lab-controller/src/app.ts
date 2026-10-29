import express, { type ErrorRequestHandler } from "express";
import { ZodError, z } from "zod";
import type { MetricsSummary, MetricsTimeseries } from "./prometheus.js";
import { runRequestSchema, type RunRequest, type RunResult, type RunState } from "./run-schema.js";
import type { BenchmarkResetResult } from "./benchmark-reset.js";
import { presets } from "./presets.js";
import { TestControls } from "./test-controls.js";
import type { PodWarmup } from "./warmup.js";

export type MetricsProvider = {
  summary(): Promise<MetricsSummary>;
  timeseries(windowMinutes?: number): Promise<MetricsTimeseries>;
};

export type RunProvider = {
  start(input: RunRequest): Promise<RunState>;
  current(): Promise<RunState | null>;
  stop(): Promise<RunState>;
  result(): Promise<RunResult>;
  resetBenchmark(): Promise<BenchmarkResetResult>;
  limits?(): Promise<unknown>;
  lifecycleBusy?(): boolean;
};

const timeseriesQuerySchema = z.object({
  window: z.coerce.number().int().refine((value) => [5, 10].includes(value), "Window must be 5 or 10 minutes").default(5),
}).strict();

export function createApp(metrics: MetricsProvider, runs: RunProvider, options: { warmup?: PodWarmup; controlsEnabled?: boolean; allowedOrigin?: string } = {}) {
  const app = express();
  const controls = new TestControls(runs, options.warmup);
  app.disable("x-powered-by");
  app.use(express.json({ limit: "16kb" }));
  app.use((_request, response, next) => {
    response.setHeader("cache-control", "no-store");
    next();
  });

  app.get("/live", (_request, response) => response.json({ status: "alive", service: "lab-controller" }));
  app.use("/lab-api", (request, response, next) => {
    if (request.method !== "POST") return next();
    const safetyAction = request.path === "/runs/current/stop" || request.path === "/warmup/restore";
    if (options.controlsEnabled === false && !safetyAction) { response.status(403).json({ error: "Public test controls are disabled by the operator" }); return; }
    const origin = request.get("origin");
    if (origin && origin !== (options.allowedOrigin ?? "https://scalelab.chandanverma.space")) {
      response.status(403).json({ error: "Cross-origin test-control requests are not permitted" }); return;
    }
    next();
  });
  app.get("/lab-api/config", async (_request, response) => {
    let generator: unknown = null;
    try { generator = await runs.limits?.() ?? null; } catch { /* Show unavailable budgets, never invent them. */ }
    response.json({ presets, controlsEnabled: options.controlsEnabled !== false, generator });
  });
  app.get("/lab-api/warmup", async (_request, response) => response.json(await controls.warmupState()));
  app.post("/lab-api/warmup", async (request, response) => {
    z.object({}).strict().parse(request.body ?? {});
    response.status(202).json(await controls.prepare());
  });
  app.post("/lab-api/warmup/restore", async (_request, response) => response.json(await controls.restore()));

  app.get("/lab-api/metrics/summary", async (_request, response) => {
    response.json(await metrics.summary());
  });

  app.get("/lab-api/metrics/timeseries", async (request, response) => {
    const query = timeseriesQuerySchema.parse(request.query);
    response.json(await metrics.timeseries(query.window));
  });

  app.post("/lab-api/runs", async (request, response) => {
    // Warm-start changes execution, never the preset's workload or generator env.
    const { warmStart, ...workload } = z.object({ warmStart: z.boolean().default(false) }).passthrough().parse(request.body);
    const presetRequest = z.object({ preset: z.enum(["autoscaling", "spike", "throughput"]) }).strict();
    const body = z.union([presetRequest, runRequestSchema]).parse(workload);
    const input = "preset" in body ? runRequestSchema.parse(presets.find((preset) => preset.id === body.preset)!.configuration) : body;
    response.status(202).json(await controls.start(input, warmStart));
  });

  app.get("/lab-api/runs/current", async (_request, response) => {
    response.json(await controls.current());
  });

  app.get("/lab-api/runs/current/result", async (_request, response) => {
    response.json(await controls.result());
  });

  app.post("/lab-api/runs/current/stop", async (_request, response) => {
    response.status(202).json(await controls.stop());
  });

  app.post("/lab-api/benchmark/reset", async (_request, response) => {
    response.json(await controls.reset());
  });

  app.use((_request, response) => response.status(404).json({ error: "Not found" }));

  const errorHandler: ErrorRequestHandler = (error, _request, response, _next) => {
    if (error instanceof ZodError) {
      response.status(400).json({ error: "Invalid request", details: z.flattenError(error) });
      return;
    }
    const message = error instanceof Error ? error.message : "Unexpected controller error";
    const status = message.includes("already running") || message.includes("No active") ? 409
      : message.includes("Please wait") ? 429 : message.includes("VUs") ? 400 : 502;
    response.status(status).json({ error: message });
  };
  app.use(errorHandler);

  return app;
}
