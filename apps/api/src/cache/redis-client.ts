import { createClient } from "redis";
import { env } from "../config/env.js";

export const redisClient = createClient({
  url: env.redisUrl,
  disableOfflineQueue: true,
  socket: { connectTimeout: 2_000 },
});

redisClient.on("error", (error) => {
  console.error(JSON.stringify({
    timestamp: new Date().toISOString(),
    level: "error",
    event: "redis_client_error",
    instanceId: env.instanceId,
    message: error.message,
  }));
});
