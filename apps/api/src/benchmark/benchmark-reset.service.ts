import type { PoolClient } from "pg";
import type { CacheStore } from "../cache/cache-store.js";
import type { ShardRouter } from "../db/shard-router.js";
import type { ApiMetrics } from "../observability/metrics.js";
import { productCacheKeys } from "../modules/products/product.service.js";

const FIRST_BENCHMARK_PRODUCT_ID = 10_001;
const LAST_BENCHMARK_PRODUCT_ID = 10_100;
const BENCHMARK_STOCK = 10_000_000;

export type BenchmarkShardReset = {
  shard: number;
  status: "completed" | "failed";
  ordersDeleted?: number;
  productsRestored?: number;
};

export class BenchmarkResetError extends Error {
  constructor(readonly shards: BenchmarkShardReset[]) {
    super("Benchmark reset failed on one or more database shards");
    this.name = "BenchmarkResetError";
  }
}

export class BenchmarkResetService {
  constructor(
    private readonly shards: ShardRouter,
    private readonly metrics: ApiMetrics,
    private readonly cache: CacheStore,
  ) {}

  async reset() {
    const results = await Promise.all(this.shards.pools.map((database, shard) => this.resetShard(
      () => this.metrics.observePoolAcquire(() => database.connect()),
      shard,
    )));

    if (results.some((result) => result.status === "failed")) {
      throw new BenchmarkResetError(results);
    }

    if (this.cache.enabled) {
      const keys = [...new Set(Array.from(
        { length: LAST_BENCHMARK_PRODUCT_ID - FIRST_BENCHMARK_PRODUCT_ID + 1 },
        (_, index) => productCacheKeys(FIRST_BENCHMARK_PRODUCT_ID + index),
      ).flat())];
      await this.cache.delete(keys).catch(() => undefined);
    }

    return results;
  }

  private async resetShard(connect: () => Promise<PoolClient>, shard: number): Promise<BenchmarkShardReset> {
    let client: PoolClient | undefined;
    try {
      client = await connect();
      await this.metrics.observeQuery("benchmark_reset.begin", () => client!.query("BEGIN"));
      const orders = await this.metrics.observeQuery("benchmark_reset.delete_orders", () => client!.query(`
        DELETE FROM orders
        WHERE product_id IN (
          SELECT id
          FROM products
          WHERE is_benchmark = TRUE
            AND id BETWEEN $1 AND $2
        )
      `, [FIRST_BENCHMARK_PRODUCT_ID, LAST_BENCHMARK_PRODUCT_ID]));
      const products = await this.metrics.observeQuery("benchmark_reset.restore_stock", () => client!.query(`
        UPDATE products
        SET stock = $3
        WHERE is_benchmark = TRUE
          AND id BETWEEN $1 AND $2
      `, [FIRST_BENCHMARK_PRODUCT_ID, LAST_BENCHMARK_PRODUCT_ID, BENCHMARK_STOCK]));
      await this.metrics.observeQuery("benchmark_reset.commit", () => client!.query("COMMIT"));
      return {
        shard,
        status: "completed",
        ordersDeleted: orders.rowCount ?? 0,
        productsRestored: products.rowCount ?? 0,
      };
    } catch {
      if (client) {
        await this.metrics.observeQuery("benchmark_reset.rollback", () => client!.query("ROLLBACK")).catch(() => undefined);
      }
      return { shard, status: "failed" };
    } finally {
      client?.release();
    }
  }
}
