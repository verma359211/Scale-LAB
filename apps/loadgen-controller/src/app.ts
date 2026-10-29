import express, { type ErrorRequestHandler } from "express";
import { ZodError, z } from "zod";
import { requireControlToken } from "./control-auth.js";
import { runRequestSchema } from "./run-config.js";
import type { K6RunManager } from "./runner.js";

export function createApp(manager: Pick<K6RunManager, "current" | "result" | "start" | "stop"> & Partial<Pick<K6RunManager, "limits">>, controlToken: string) {
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "16kb" }));

  app.get("/live", (_request, response) => response.json({ status: "alive", service: "loadgen-controller" }));
  app.get("/limits", requireControlToken(controlToken), (_request, response) => response.json(manager.limits?.()));
  app.get("/runs/current", (_request, response) => response.json(manager.current()));
  app.get("/runs/current/result", (_request, response) => response.json(manager.result()));
  app.post("/runs", requireControlToken(controlToken), (request, response) => {
    const input = runRequestSchema.parse(request.body);
    response.status(202).json(manager.start(input));
  });
  app.post("/runs/current/stop", requireControlToken(controlToken), (_request, response) => response.status(202).json(manager.stop()));
  app.use((_request, response) => response.status(404).json({ error: "Not found" }));

  const errorHandler: ErrorRequestHandler = (error, _request, response, _next) => {
    if (error instanceof ZodError) {
      response.status(400).json({ error: "Invalid request", details: z.flattenError(error) });
      return;
    }
    const message = error instanceof Error ? error.message : "Unexpected load-generator error";
    const status = message.includes("already running") || message.includes("No active")
      ? 409
      : message.includes("Please wait") ? 429 : message.includes("VUs") ? 400 : 500;
    response.status(status).json({ error: message });
  };
  app.use(errorHandler);
  return app;
}
