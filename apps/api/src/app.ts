import cors from "cors";
import express, { type ErrorRequestHandler } from "express";
import type { Pool, PoolClient } from "pg";
import { disabledCache, type CacheStore } from "./cache/cache-store.js";
import { env } from "./config/env.js";
import { pools as defaultPools } from "./db/pool.js";
import { ShardRouter } from "./db/shard-router.js";
import { ApiError } from "./lib/api-error.js";
import { requestContext } from "./middleware/request-context.js";
import { createOrderRouter } from "./modules/orders/order.routes.js";
import { createProductRouter } from "./modules/products/product.routes.js";
import { createApiMetrics, type ApiMetrics } from "./observability/metrics.js";
import { disabledRateLimiters, type RateLimiters } from "./rate-limit/rate-limiter.js";

type AppDependencies = {
  database?: Pool;
  shards?: ShardRouter;
  instanceId?: string;
  metrics?: ApiMetrics;
  cache?: CacheStore;
  rateLimiters?: RateLimiters;
};

export function createApp(dependencies: AppDependencies = {}) {
  const shards = dependencies.shards ?? new ShardRouter(dependencies.database ? [dependencies.database] : defaultPools);
  const databases = shards.pools;
  const instanceId = dependencies.instanceId ?? env.instanceId;
  const cache = dependencies.cache ?? disabledCache;
  const metrics = dependencies.metrics ?? createApiMetrics(databases, instanceId, () => cache.isReady());
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

  // Kubernetes uses liveness only to decide whether the Node process should
  // be restarted. Dependency failures must not create a restart loop.
  app.get("/live", (_request, response) => {
    response.json({ status: "alive", instanceId });
  });

  // Readiness controls whether a pod receives traffic. PostgreSQL is required
  // for correct responses, while Redis can safely fall back to PostgreSQL.
  app.get("/ready", async (_request, response) => {
    try {
      await Promise.all(databases.map((database) => metrics.observeQuery("readiness.check", () => database.query("SELECT 1"))));
      response.json({ status: "ready", instanceId });
    } catch {
      response.status(503).json({ status: "not_ready", instanceId });
    }
  });

  app.get("/health", async (_request, response) => {
    const clients: PoolClient[] = [];
    try {
      for (const database of databases) {
        const client = await metrics.observePoolAcquire(() => database.connect());
        clients.push(client);
        await metrics.observeQuery("health.check", () => client.query("SELECT 1"));
      }
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
        databaseShards: databases.length,
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
      clients.forEach((client) => client.release());
    }
  });

  app.use("/api/products", createProductRouter(shards, metrics, cache, env.productCacheTtlSeconds));
  app.use("/api/orders", createOrderRouter(shards, metrics, cache, rateLimiters.orders));

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
        total: databases.reduce((total, database) => total + database.totalCount, 0),
        idle: databases.reduce((total, database) => total + database.idleCount, 0),
        waiting: databases.reduce((total, database) => total + database.waitingCount, 0),
      },
    }));
    response.status(500).json({ error: "Internal server error" });
  };
  app.use(errorHandler);

  return app;
}
