import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import type { CacheStore } from "../../cache/cache-store.js";
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
    private readonly database: Pool,
    private readonly metrics: ApiMetrics,
    private readonly cache: CacheStore,
  ) {}

  async create(input: CreateOrderInput) {
    const client = await this.metrics.observePoolAcquire(() => this.database.connect());
    let order: Order;

    try {
      await this.metrics.observeQuery("order.begin", () => client.query("BEGIN"));
      const productResult = await this.metrics.observeQuery("order.lock_product", () => client.query<{ id: number; price: string; stock: number }>(`
        SELECT id, price, stock
        FROM products
        WHERE id = $1
        FOR UPDATE
      `, [input.productId]));
      const product = productResult.rows[0];

      if (!product) throw new ApiError(404, "Product not found");
      if (product.stock < input.quantity) {
        throw new ApiError(409, "Insufficient stock", { availableStock: product.stock });
      }

      const totalPrice = Number(product.price) * input.quantity;
      await this.metrics.observeQuery("order.update_stock", () => client.query(
        "UPDATE products SET stock = stock - $1 WHERE id = $2",
        [input.quantity, input.productId],
      ));
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
    const client = await this.metrics.observePoolAcquire(() => this.database.connect());
    try {
      const result = await this.metrics.observeQuery("order.get", () => client.query<OrderRow>(`
        SELECT id, user_id, product_id, quantity, total_price, status, created_at
        FROM orders
        WHERE id = $1
      `, [id]));
      return result.rows[0] ? mapOrder(result.rows[0]) : undefined;
    } finally {
      client.release();
    }
  }
}
