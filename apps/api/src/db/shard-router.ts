import type { Pool } from "pg";

export class ShardRouter {
  constructor(readonly pools: Pool[]) {
    if (pools.length === 0) throw new Error("At least one database shard is required");
  }

  forProduct(productId: number) {
    return this.pools[productId % this.pools.length];
  }
}
