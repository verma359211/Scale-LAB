import { randomUUID } from "node:crypto";
import type { CacheStore } from "../../cache/cache-store.js";
import type { ShardRouter } from "../../db/shard-router.js";
import { ApiError } from "../../lib/api-error.js";
import type { ApiMetrics } from "../../observability/metrics.js";
import { productCacheKeys } from "../products/product.service.js";
import type { CreateOrderInput } from "./order.schema.js";

export type Order = {
  id: string;
  userId: string;
  productId: number;
  quantity: number;
  totalPrice: number;
  status: "confirmed";
  createdAt: string;
};

type OrderRow = {
  id: string;
  user_id: string;
  product_id: number;
  quantity: number;
  total_price: string;
  status: "confirmed";
  created_at: Date;
};

function mapOrder(row: OrderRow): Order {
  return {
    id: row.id,
    userId: row.user_id,
    productId: row.product_id,
    quantity: row.quantity,
    totalPrice: Number(row.total_price),
    status: row.status,
    createdAt: row.created_at.toISOString(),
  };
}

export class OrderService {
  constructor(
    private readonly shards: ShardRouter,
    private readonly metrics: ApiMetrics,
    private readonly cache: CacheStore,
  ) {}

  async create(input: CreateOrderInput) {
    const database = this.shards.forProduct(input.productId);
    const client = await this.metrics.observePoolAcquire(() => database.connect());
    let order: Order;

    try {
      await this.metrics.observeQuery("order.begin", () => client.query("BEGIN"));
      const productResult = await this.metrics.observeQuery("order.update_stock", () => client.query<{ id: number; price: string; stock: number }>(`
        UPDATE products
        SET stock = stock - $2
        WHERE id = $1
          AND stock >= $2
        RETURNING id, price, stock
      `, [input.productId, input.quantity]));
      const product = productResult.rows[0];

      if (!product) {
        // The conditional UPDATE intentionally combines the stock check and
        // decrement. A read is needed only on this failure path to preserve
        // the API's 404 versus 409 response behavior.
        const existingProduct = await this.metrics.observeQuery("order.check_rejected_stock", () => client.query<{ stock: number }>(
          "SELECT stock FROM products WHERE id = $1",
          [input.productId],
        ));
        const availableStock = existingProduct.rows[0]?.stock;

        if (availableStock === undefined) throw new ApiError(404, "Product not found");
        throw new ApiError(409, "Insufficient stock", { availableStock });
      }

      const totalPrice = Number(product.price) * input.quantity;
      const orderResult = await this.metrics.observeQuery("order.insert", () => client.query<OrderRow>(`
        INSERT INTO orders (id, user_id, product_id, quantity, total_price, status)
        VALUES ($1, $2, $3, $4, $5, 'confirmed')
        RETURNING id, user_id, product_id, quantity, total_price, status, created_at
      `, [randomUUID(), input.userId, input.productId, input.quantity, totalPrice.toFixed(2)]));

      await this.metrics.observeQuery("order.commit", () => client.query("COMMIT"));
      order = mapOrder(orderResult.rows[0]);
    } catch (error) {
      await this.metrics.observeQuery("order.rollback", () => client.query("ROLLBACK"));
      throw error;
    } finally {
      client.release();
    }

    // The database client is released before Redis I/O. PostgreSQL is already
    // committed, so a cache failure must not fail or roll back the order.
    if (this.cache.enabled) {
      try {
        await this.metrics.observeCache("product.invalidate", () => (
          this.cache.delete(productCacheKeys(input.productId))
        ));
        this.metrics.recordCacheResult("product.invalidate", "invalidate");
      } catch {
        this.metrics.recordCacheResult("product.invalidate", "error");
      }
    }

    return order;
  }

  async getById(id: string) {
    const results = await Promise.all(this.shards.pools.map(async (database) => {
      const client = await this.metrics.observePoolAcquire(() => database.connect());
      try {
        return await this.metrics.observeQuery("order.get", () => client.query<OrderRow>(`
          SELECT id, user_id, product_id, quantity, total_price, status, created_at
          FROM orders
          WHERE id = $1
        `, [id]));
      } finally {
        client.release();
      }
    }));
    const row = results.find((result) => result.rows[0])?.rows[0];
    return row ? mapOrder(row) : undefined;
  }
}
