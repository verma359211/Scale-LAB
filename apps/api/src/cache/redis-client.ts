import { createClient } from "redis";
import { env } from "../config/env.js";

export const redisClient = createClient({
  url: env.redisUrl,
  disableOfflineQueue: true,
  socket: { connectTimeout: 2_000 },
});

// Rate limiting has its own connection so limiter traffic and cache traffic do
// not block each other on one Redis socket during a burst.
export const rateLimitRedisClient = redisClient.duplicate();

redisClient.on("error", (error) => {
  console.error(JSON.stringify({
    timestamp: new Date().toISOString(),
    level: "error",
    event: "redis_client_error",
    instanceId: env.instanceId,
    message: error.message,
  }));
});

rateLimitRedisClient.on("error", (error) => {
  console.error(JSON.stringify({
    timestamp: new Date().toISOString(),
    level: "error",
    event: "rate_limit_redis_client_error",
    instanceId: env.instanceId,
    message: error.message,
  }));
});
