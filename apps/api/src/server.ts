import { createApp } from "./app.js";
import { createRedisCache } from "./cache/cache-store.js";
import { redisClient } from "./cache/redis-client.js";
import { env } from "./config/env.js";
import { migrateDatabase } from "./db/migration-runner.js";
import { pool } from "./db/pool.js";

function errorFields(error: unknown) {
  return {
    errorName: error instanceof Error ? error.name : "UnknownError",
    errorCode: typeof error === "object" && error && "code" in error ? String(error.code) : undefined,
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
  };
}

pool.on("error", (error) => {
  console.error(JSON.stringify({
    timestamp: new Date().toISOString(),
    level: "error",
    event: "database_pool_error",
    instanceId: env.instanceId,
    ...errorFields(error),
    pool: { total: pool.totalCount, idle: pool.idleCount, waiting: pool.waitingCount },
  }));
});

process.on("warning", (warning) => {
  console.warn(JSON.stringify({
    timestamp: new Date().toISOString(),
    level: "warn",
    event: "process_warning",
    instanceId: env.instanceId,
    ...errorFields(warning),
  }));
});

// This observes fatal errors without changing Node's default crash behavior.
process.on("uncaughtExceptionMonitor", (error, origin) => {
  console.error(JSON.stringify({
    timestamp: new Date().toISOString(),
    level: "error",
    event: "uncaught_exception",
    origin,
    instanceId: env.instanceId,
    ...errorFields(error),
  }));
});

async function waitForDatabase(attempts = 30) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await pool.query("SELECT 1");
      return;
    } catch (error) {
      if (attempt === attempts) throw error;
      await new Promise((resolve) => setTimeout(resolve, 1_000));
    }
  }
}

await waitForDatabase();
await migrateDatabase(pool);
await redisClient.connect();
const cache = createRedisCache(redisClient);

const server = createApp({ cache }).listen(env.port, () => {
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    event: "api_started",
    port: env.port,
    instanceId: env.instanceId,
  }));
});

// Keep this explicit so Nginx can retire upstream keep-alive connections
// before Node does, avoiding reuse races that surface as ECONNRESET.
server.keepAliveTimeout = env.keepAliveTimeoutMs;
server.headersTimeout = env.headersTimeoutMs;

server.on("error", (error) => {
  console.error(JSON.stringify({
    timestamp: new Date().toISOString(),
    level: "error",
    event: "http_server_error",
    instanceId: env.instanceId,
    ...errorFields(error),
  }));
});

function shutdown(signal: string) {
  console.log(JSON.stringify({ timestamp: new Date().toISOString(), event: "api_stopping", signal, instanceId: env.instanceId }));
  server.close(() => {
    void Promise.allSettled([pool.end(), redisClient.quit()]).finally(() => process.exit(0));
  });
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
