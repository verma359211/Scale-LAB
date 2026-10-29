import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Pool, PoolClient, QueryResult } from "pg";
import { disabledCache } from "../cache/cache-store.js";
import { ShardRouter } from "../db/shard-router.js";
import type { ApiMetrics } from "../observability/metrics.js";
import { BenchmarkResetService } from "./benchmark-reset.service.js";

function shardPool(queries: string[]) {
  const client = {
    async query(sql: string) {
      queries.push(sql.trim().split(/\s+/).slice(0, 3).join(" "));
      const isDelete = sql.includes("DELETE FROM orders");
      const isUpdate = sql.includes("UPDATE products");
      return { rowCount: isDelete ? 4 : isUpdate ? 50 : null } as QueryResult;
    },
    release() { queries.push("RELEASE"); },
  } as unknown as PoolClient;
  return { connect: async () => client } as unknown as Pool;
}

const metrics = {
  observePoolAcquire: <T>(operation: () => Promise<T>) => operation(),
  observeQuery: <T>(_name: string, operation: () => Promise<T>) => operation(),
} as ApiMetrics;

describe("benchmark reset service", () => {
  it("runs an independent transaction on every configured shard", async () => {
    const shard0: string[] = [];
    const shard1: string[] = [];
    const service = new BenchmarkResetService(
      new ShardRouter([shardPool(shard0), shardPool(shard1)]),
      metrics,
      disabledCache,
    );

    const result = await service.reset();

    assert.deepEqual(result.map((shard) => shard.status), ["completed", "completed"]);
    for (const queries of [shard0, shard1]) {
      assert.ok(queries.includes("BEGIN"));
      assert.ok(queries.includes("DELETE FROM orders"));
      assert.ok(queries.includes("UPDATE products SET"));
      assert.ok(queries.includes("COMMIT"));
      assert.ok(queries.includes("RELEASE"));
    }
  });
});
