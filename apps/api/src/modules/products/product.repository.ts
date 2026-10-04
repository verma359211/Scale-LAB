import type { Pool } from "pg";
import type { ApiMetrics } from "../../observability/metrics.js";

export type Product = {
  id: number;
  name: string;
  description: string;
  price: number;
  stock: number;
  createdAt: string;
};

type ProductRow = {
  id: number;
  name: string;
  description: string;
  price: string;
  stock: number;
  created_at: Date;
};

function mapProduct(row: ProductRow): Product {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    price: Number(row.price),
    stock: row.stock,
    createdAt: row.created_at.toISOString(),
  };
}

export class ProductRepository {
  constructor(
    private readonly database: Pool,
    private readonly metrics: ApiMetrics,
  ) {}

  async list() {
    const client = await this.metrics.observePoolAcquire(() => this.database.connect());
    try {
      const result = await this.metrics.observeQuery("product.list", () => client.query<ProductRow>(`
        SELECT id, name, description, price, stock, created_at
        FROM products
        ORDER BY id
      `));
      return result.rows.map(mapProduct);
    } finally {
      client.release();
    }
  }

  async getById(id: number) {
    const client = await this.metrics.observePoolAcquire(() => this.database.connect());
    try {
      const result = await this.metrics.observeQuery("product.get", () => client.query<ProductRow>(`
        SELECT id, name, description, price, stock, created_at
        FROM products
        WHERE id = $1
      `, [id]));
      return result.rows[0] ? mapProduct(result.rows[0]) : undefined;
    } finally {
      client.release();
    }
  }
}
