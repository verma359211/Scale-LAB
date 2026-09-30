import { migrateDatabase } from "./migration-runner.js";
import { pool } from "./pool.js";

try {
  await migrateDatabase(pool);
  console.log(JSON.stringify({ timestamp: new Date().toISOString(), event: "database_migrated" }));
} finally {
  await pool.end();
}
