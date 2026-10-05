import cors from "cors";
import express, { type ErrorRequestHandler } from "express";
import type { Pool, PoolClient } from "pg";
import { disabledCache, type CacheStore } from "./cache/cache-store.js";
import { env } from "./config/env.js";
import { pool as defaultPool } from "./db/pool.js";
import { ApiError } from "./lib/api-error.js";
import { requestContext } from "./middleware/request-context.js";
import { createOrderRouter } from "./modules/orders/order.routes.js";
import { createProductRouter } from "./modules/products/product.routes.js";
import { createApiMetrics, type ApiMetrics } from "./observability/metrics.js";
import { disabledRateLimiters, type RateLimiters } from "./rate-limit/rate-limiter.js";

type AppDependencies = {
  database?: Pool;
  instanceId?: string;
  metrics?: ApiMetrics;
  cache?: CacheStore;
  rateLimiters?: RateLimiters;
};

export function createApp(dependencies: AppDependencies = {}) {
  const database = dependencies.database ?? defaultPool;
  const instanceId = dependencies.instanceId ?? env.instanceId;
  const cache = dependencies.cache ?? disabledCache;
  const metrics = dependencies.metrics ?? createApiMetrics(database, instanceId, () => cache.isReady());
  const rateLimiters = dependencies.rateLimiters ?? disabledRateLimiters;
  const app = express();

  app.disable("x-powered-by");
  // Nginx is the only trusted hop. Express can therefore use the client IP
  // supplied by Nginx without treating arbitrary forwarding chains as trusted.
  app.set("trust proxy", 1);
  app.use(requestContext(instanceId));
  app.use(metrics.middleware);
  app.use(cors({
    origin: env.clientOrigin,
    exposedHeaders: ["x-request-id", "x-instance-id", "ratelimit", "ratelimit-policy", "retry-after"],
  }));
  app.use("/api", rateLimiters.api);
  app.use(express.json({ limit: "100kb" }));

  app.get("/metrics", async (_request, response) => {
    response.setHeader("content-type", metrics.registry.contentType);
    response.send(await metrics.registry.metrics());
  });

  app.get("/health", async (_request, response) => {
    let client: PoolClient | undefined;
    try {
      const acquiredClient = await metrics.observePoolAcquire(() => database.connect());
      client = acquiredClient;
      await metrics.observeQuery("health.check", () => acquiredClient.query("SELECT 1"));
      let redis = "disabled";
      let rateLimiter = "disabled";
      if (cache.enabled) {
        try {
          await cache.ping();
          redis = "healthy";
        } catch {
          redis = "unhealthy";
        }
      }
      if (rateLimiters.enabled) {
        try {
          await rateLimiters.ping();
          rateLimiter = "healthy";
        } catch {
          rateLimiter = "unhealthy";
        }
      }

      response.json({
        status: redis === "unhealthy" || rateLimiter === "unhealthy" ? "degraded" : "ok",
        database: "healthy",
        redis,
        rateLimiter,
        instanceId,
      });
    } catch {
      response.status(503).json({
        status: "degraded",
        database: "unhealthy",
        redis: cache.isReady() ? "healthy" : cache.enabled ? "unhealthy" : "disabled",
        rateLimiter: rateLimiters.isReady() ? "healthy" : rateLimiters.enabled ? "unhealthy" : "disabled",
        instanceId,
      });
    } finally {
      client?.release();
    }
  });

  app.use("/api/products", createProductRouter(database, metrics, cache, env.productCacheTtlSeconds));
  app.use("/api/orders", createOrderRouter(database, metrics, cache, rateLimiters.orders));

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
      event: "request_failed",
      requestId: response.locals.requestId,
      instanceId,
      method: _request.method,
      path: _request.originalUrl,
      errorName: error instanceof Error ? error.name : "UnknownError",
      errorCode: typeof error === "object" && error && "code" in error ? String(error.code) : undefined,
      message: error instanceof Error ? error.message : "Unknown error",
      stack: error instanceof Error ? error.stack : undefined,
      pool: {
        total: database.totalCount,
        idle: database.idleCount,
        waiting: database.waitingCount,
      },
    }));
    response.status(500).json({ error: "Internal server error" });
  };
  app.use(errorHandler);

  return app;
}
