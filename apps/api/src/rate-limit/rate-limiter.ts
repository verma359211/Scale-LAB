import type { RequestHandler } from "express";
import { rateLimit } from "express-rate-limit";
import { RedisStore, type RedisReply } from "rate-limit-redis";
import type { RedisClientType } from "redis";
import type { ApiMetrics } from "../observability/metrics.js";

export type RateLimiters = {
  enabled: boolean;
  api: RequestHandler;
  orders: RequestHandler;
  isReady: () => boolean;
  ping: () => Promise<unknown>;
};

const passThrough: RequestHandler = (_request, _response, next) => next();

export const disabledRateLimiters: RateLimiters = {
  enabled: false,
  api: passThrough,
  orders: passThrough,
  isReady: () => false,
  ping: async () => undefined,
};

type PolicyOptions = {
  name: "api" | "orders";
  windowMs: number;
  limit: number;
  redisPrefix: string;
};

type RateLimiterOptions = {
  enabled: boolean;
  failOpen: boolean;
  instanceId: string;
  apiWindowMs: number;
  apiMaxRequests: number;
  orderWindowMs: number;
  orderMaxRequests: number;
};

function createPolicy(
  client: RedisClientType,
  metrics: ApiMetrics,
  failOpen: boolean,
  instanceId: string,
  options: PolicyOptions,
) {
  let continuousStoreFailureLogged = false;
  const store = new RedisStore({
    prefix: options.redisPrefix,
    sendCommand: async (...command: string[]) => {
      const result = await metrics.observeRateLimitStore(
        options.name,
        () => client.sendCommand(command) as Promise<RedisReply>,
      );
      continuousStoreFailureLogged = false;
      return result;
    },
  });

  const limiter = rateLimit({
    windowMs: options.windowMs,
    limit: options.limit,
    identifier: options.name,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    passOnStoreError: failOpen,
    logger: {
      warn: (error, message) => console.warn(JSON.stringify({
        timestamp: new Date().toISOString(),
        level: "warn",
        event: "rate_limit_warning",
        instanceId,
        policy: options.name,
        message,
        error: error instanceof Error ? error.message : String(error),
      })),
      // During an outage every request sees the same store failure. Log the
      // first one and rely on metrics for volume so stdout cannot become the bottleneck.
      error: (error, message) => {
        if (continuousStoreFailureLogged) return;
        continuousStoreFailureLogged = true;
        console.error(JSON.stringify({
          timestamp: new Date().toISOString(),
          level: "error",
          event: "rate_limit_store_unavailable",
          instanceId,
          policy: options.name,
          message,
          error: error instanceof Error ? error.message : String(error),
        }));
      },
    },
    skip: (request) => request.method === "OPTIONS",
    store,
    handler: (request, response) => {
      metrics.recordRateLimitDecision(options.name, "rejected");
      const rateLimitInfo = (request as typeof request & { rateLimit?: { resetTime?: Date } }).rateLimit;
      const resetTime = rateLimitInfo?.resetTime?.getTime();
      const retryAfterSeconds = resetTime
        ? Math.max(1, Math.ceil((resetTime - Date.now()) / 1_000))
        : Math.max(1, Math.ceil(options.windowMs / 1_000));

      response.setHeader("retry-after", String(retryAfterSeconds));
      response.status(429).json({
        error: "Too many requests",
        retryAfterSeconds,
      });
    },
  });

  return ((request, response, next) => {
    limiter(request, response, (error?: unknown) => {
      if (error) {
        next(error);
        return;
      }
      metrics.recordRateLimitDecision(options.name, "allowed");
      next();
    });
  }) satisfies RequestHandler;
}

export function createRateLimiters(
  client: RedisClientType,
  metrics: ApiMetrics,
  options: RateLimiterOptions,
): RateLimiters {
  if (!options.enabled) return disabledRateLimiters;

  return {
    enabled: true,
    api: createPolicy(client, metrics, options.failOpen, options.instanceId, {
      name: "api",
      windowMs: options.apiWindowMs,
      limit: options.apiMaxRequests,
      redisPrefix: "scalelab:rate-limit:api:",
    }),
    orders: createPolicy(client, metrics, options.failOpen, options.instanceId, {
      name: "orders",
      windowMs: options.orderWindowMs,
      limit: options.orderMaxRequests,
      redisPrefix: "scalelab:rate-limit:orders:",
    }),
    isReady: () => client.isReady,
    ping: () => client.ping(),
  };
}
