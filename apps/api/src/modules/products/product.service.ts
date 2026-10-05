import type { CacheStore } from "../../cache/cache-store.js";
import type { ApiMetrics } from "../../observability/metrics.js";
import { ProductRepository, type Product } from "./product.repository.js";

const productKey = (id: number) => `product:${id}`;
export const productListKey = "products:list";

export function productCacheKeys(id: number) {
  return [productKey(id), productListKey];
}

export class ProductService {
  constructor(
    private readonly repository: ProductRepository,
    private readonly cache: CacheStore,
    private readonly metrics: ApiMetrics,
    private readonly ttlSeconds: number,
  ) {}

  async list() {
    const cached = await this.readCache<Product[]>("product.list", productListKey);
    if (cached) return cached;

    const products = await this.repository.list();
    await this.writeCache("product.list", productListKey, products);
    return products;
  }

  async getById(id: number) {
    const cached = await this.readCache<Product>("product.get", productKey(id));
    if (cached) return cached;

    const product = await this.repository.getById(id);
    if (product) await this.writeCache("product.get", productKey(id), product);
    return product;
  }

  private async readCache<T>(operation: string, key: string) {
    if (!this.cache.enabled) return null;

    try {
      const value = await this.metrics.observeCache(operation, () => this.cache.get<T>(key));
      this.metrics.recordCacheResult(operation, value === null ? "miss" : "hit");
      return value;
    } catch {
      this.metrics.recordCacheResult(operation, "error");
      return null;
    }
  }

  private async writeCache<T>(operation: string, key: string, value: T) {
    if (!this.cache.enabled) return;

    try {
      await this.metrics.observeCache(operation, () => this.cache.set(key, value, this.ttlSeconds));
      this.metrics.recordCacheResult(operation, "write");
    } catch {
      this.metrics.recordCacheResult(operation, "error");
    }
  }
}
