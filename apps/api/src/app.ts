import cors from "cors";
import express, { type ErrorRequestHandler } from "express";
import type { Pool } from "pg";
import { env } from "./config/env.js";
import { pool as defaultPool } from "./db/pool.js";
import { ApiError } from "./lib/api-error.js";
import { requestContext } from "./middleware/request-context.js";
import { createOrderRouter } from "./modules/orders/order.routes.js";
import { createProductRouter } from "./modules/products/product.routes.js";
import { createApiMetrics, type ApiMetrics } from "./observability/metrics.js";

type AppDependencies = {
  database?: Pool;
  instanceId?: string;
  metrics?: ApiMetrics;
};

export function createApp(dependencies: AppDependencies = {}) {
  const database = dependencies.database ?? defaultPool;
  const instanceId = dependencies.instanceId ?? env.instanceId;
  const metrics = dependencies.metrics ?? createApiMetrics(database, instanceId);
  const app = express();

  app.disable("x-powered-by");
  app.use(requestContext(instanceId));
  app.use(metrics.middleware);
  app.use(cors({
    origin: env.clientOrigin,
    exposedHeaders: ["x-request-id", "x-instance-id"],
  }));
  app.use(express.json({ limit: "100kb" }));

  app.get("/metrics", async (_request, response) => {
    response.setHeader("content-type", metrics.registry.contentType);
    response.send(await metrics.registry.metrics());
  });

  app.get("/health", async (_request, response) => {
    try {
      await database.query("SELECT 1");
      response.json({ status: "ok", database: "healthy", instanceId });
    } catch {
      response.status(503).json({ status: "degraded", database: "unhealthy", instanceId });
    }
  });

  app.use("/api/products", createProductRouter(database));
  app.use("/api/orders", createOrderRouter(database));

  app.use((_request, response) => {
    response.status(404).json({ error: "Route not found" });
  });

  const errorHandler: ErrorRequestHandler = (error, _request, response, next) => {
    if (response.headersSent) {
      next(error);
      return;
    }

    if (error instanceof ApiError) {
      response.status(error.statusCode).json({ error: error.message, details: error.details });
      return;
    }

    console.error(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: "error",
      requestId: response.locals.requestId,
      instanceId,
      message: error instanceof Error ? error.message : "Unknown error",
    }));
    response.status(500).json({ error: "Internal server error" });
  };
  app.use(errorHandler);

  return app;
}
