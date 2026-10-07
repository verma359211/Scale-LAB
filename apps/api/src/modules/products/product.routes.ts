import { Router } from "express";
import { z } from "zod";
import type { CacheStore } from "../../cache/cache-store.js";
import type { ShardRouter } from "../../db/shard-router.js";
import { ApiError } from "../../lib/api-error.js";
import type { ApiMetrics } from "../../observability/metrics.js";
import { ProductRepository } from "./product.repository.js";
import { ProductService } from "./product.service.js";

const productIdSchema = z.coerce.number().int().positive();

export function createProductRouter(
  shards: ShardRouter,
  metrics: ApiMetrics,
  cache: CacheStore,
  cacheTtlSeconds: number,
) {
  const router = Router();
  const products = new ProductService(
    new ProductRepository(shards, metrics),
    cache,
    metrics,
    cacheTtlSeconds,
  );

  router.get("/", async (_request, response) => {
    response.json({ data: await products.list() });
  });

  router.get("/:id", async (request, response) => {
    const parsedId = productIdSchema.safeParse(request.params.id);
    if (!parsedId.success) throw new ApiError(400, "Invalid product ID");

    const product = await products.getById(parsedId.data);
    if (!product) throw new ApiError(404, "Product not found");
    response.json({ data: product });
  });

  return router;
}
