import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { migrateDatabase } from "./db/migration-runner.js";
import { pool } from "./db/pool.js";

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

const server = createApp().listen(env.port, () => {
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    event: "api_started",
    port: env.port,
    instanceId: env.instanceId,
  }));
});

function shutdown(signal: string) {
  console.log(JSON.stringify({ timestamp: new Date().toISOString(), event: "api_stopping", signal, instanceId: env.instanceId }));
  server.close(() => {
    void pool.end().finally(() => process.exit(0));
  });
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
