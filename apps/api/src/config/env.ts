function positiveInteger(value: string | undefined, fallback: number, name: string) {
  const parsed = Number(value ?? fallback);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return parsed;
}

function booleanValue(value: string | undefined, fallback: boolean, name: string) {
  if (value === undefined) return fallback;
  if (value === "true") return true;
  if (value === "false") return false;
  throw new Error(`${name} must be either true or false`);
}

export const env = {
  port: positiveInteger(process.env.PORT, 3001, "PORT"),
  clientOrigin: process.env.CLIENT_ORIGIN ?? "http://localhost:5174",
  databaseUrl: process.env.DATABASE_URL ?? "postgresql://scalelab:scalelab@localhost:5433/scalelab",
  databasePoolMax: positiveInteger(process.env.DATABASE_POOL_MAX, 10, "DATABASE_POOL_MAX"),
  redisUrl: process.env.REDIS_URL ?? "redis://localhost:6379",
  productCacheTtlSeconds: positiveInteger(process.env.PRODUCT_CACHE_TTL_SECONDS, 30, "PRODUCT_CACHE_TTL_SECONDS"),
  rateLimitEnabled: booleanValue(process.env.RATE_LIMIT_ENABLED, true, "RATE_LIMIT_ENABLED"),
  apiRateLimitWindowMs: positiveInteger(process.env.API_RATE_LIMIT_WINDOW_MS, 1_000, "API_RATE_LIMIT_WINDOW_MS"),
  apiRateLimitMaxRequests: positiveInteger(process.env.API_RATE_LIMIT_MAX_REQUESTS, 500, "API_RATE_LIMIT_MAX_REQUESTS"),
  orderRateLimitWindowMs: positiveInteger(process.env.ORDER_RATE_LIMIT_WINDOW_MS, 10_000, "ORDER_RATE_LIMIT_WINDOW_MS"),
  orderRateLimitMaxRequests: positiveInteger(process.env.ORDER_RATE_LIMIT_MAX_REQUESTS, 5, "ORDER_RATE_LIMIT_MAX_REQUESTS"),
  rateLimitFailOpen: booleanValue(process.env.RATE_LIMIT_FAIL_OPEN, true, "RATE_LIMIT_FAIL_OPEN"),
  instanceId: process.env.INSTANCE_ID?.trim() || "api-1",
  keepAliveTimeoutMs: positiveInteger(process.env.SERVER_KEEP_ALIVE_TIMEOUT_MS, 5_000, "SERVER_KEEP_ALIVE_TIMEOUT_MS"),
  headersTimeoutMs: positiveInteger(process.env.SERVER_HEADERS_TIMEOUT_MS, 60_000, "SERVER_HEADERS_TIMEOUT_MS"),
};
