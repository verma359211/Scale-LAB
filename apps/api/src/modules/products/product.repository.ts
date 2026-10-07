import type { ShardRouter } from "../../db/shard-router.js";
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
    private readonly shards: ShardRouter,
    private readonly metrics: ApiMetrics,
  ) {}

  async list() {
    const products = await Promise.all(this.shards.pools.map(async (database) => {
      const client = await this.metrics.observePoolAcquire(() => database.connect());
      try {
      const result = await this.metrics.observeQuery("product.list", () => client.query<ProductRow>(`
        SELECT id, name, description, price, stock, created_at
        FROM products
        WHERE is_benchmark = FALSE
        ORDER BY id
      `));
      return result.rows.map(mapProduct);
      } finally {
        client.release();
      }
    }));
    return products.flat().sort((left, right) => left.id - right.id);
  }

  async getById(id: number) {
    const database = this.shards.forProduct(id);
    const client = await this.metrics.observePoolAcquire(() => database.connect());
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
