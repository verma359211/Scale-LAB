import type { Pool } from "pg";

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
  constructor(private readonly database: Pool) {}

  async list() {
    const result = await this.database.query<ProductRow>(`
      SELECT id, name, description, price, stock, created_at
      FROM products
      ORDER BY id
    `);
    return result.rows.map(mapProduct);
  }

  async getById(id: number) {
    const result = await this.database.query<ProductRow>(`
      SELECT id, name, description, price, stock, created_at
      FROM products
      WHERE id = $1
    `, [id]);
    return result.rows[0] ? mapProduct(result.rows[0]) : undefined;
  }
}
