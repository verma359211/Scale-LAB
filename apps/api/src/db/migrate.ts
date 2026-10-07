import { migrateDatabase } from "./migration-runner.js";
import { pools } from "./pool.js";

try {
  await Promise.all(
    pools.map((pool, shardIndex) =>
      migrateDatabase(pool, undefined, {
        index: shardIndex,
        count: pools.length,
      }),
    ),
  );

  console.log(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      event: "database_migrated",
      databaseShards: pools.length,
    }),
  );
} finally {
  await Promise.allSettled(pools.map((pool) => pool.end()));
}
