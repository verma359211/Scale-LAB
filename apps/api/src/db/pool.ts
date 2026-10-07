import { Pool } from "pg";
import { env } from "../config/env.js";

export function createPool(connectionString = env.databaseUrl) {
  return new Pool({
    connectionString,
    max: env.databasePoolMax,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  });
}

export const pools = env.databaseShardUrls.map(createPool);
export const pool = pools[0];
