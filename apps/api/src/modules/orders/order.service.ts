import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { ApiError } from "../../lib/api-error.js";
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
  constructor(private readonly database: Pool) {}

  async create(input: CreateOrderInput) {
    const client = await this.database.connect();

    try {
      await client.query("BEGIN");
      const productResult = await client.query<{ id: number; price: string; stock: number }>(`
        SELECT id, price, stock
        FROM products
        WHERE id = $1
        FOR UPDATE
      `, [input.productId]);
      const product = productResult.rows[0];

      if (!product) throw new ApiError(404, "Product not found");
      if (product.stock < input.quantity) {
        throw new ApiError(409, "Insufficient stock", { availableStock: product.stock });
      }

      const totalPrice = Number(product.price) * input.quantity;
      await client.query("UPDATE products SET stock = stock - $1 WHERE id = $2", [input.quantity, input.productId]);
      const orderResult = await client.query<OrderRow>(`
        INSERT INTO orders (id, user_id, product_id, quantity, total_price, status)
        VALUES ($1, $2, $3, $4, $5, 'confirmed')
        RETURNING id, user_id, product_id, quantity, total_price, status, created_at
      `, [randomUUID(), input.userId, input.productId, input.quantity, totalPrice.toFixed(2)]);

      await client.query("COMMIT");
      return mapOrder(orderResult.rows[0]);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async getById(id: string) {
    const result = await this.database.query<OrderRow>(`
      SELECT id, user_id, product_id, quantity, total_price, status, created_at
      FROM orders
      WHERE id = $1
    `, [id]);
    return result.rows[0] ? mapOrder(result.rows[0]) : undefined;
  }
}
