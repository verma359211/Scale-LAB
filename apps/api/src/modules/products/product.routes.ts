import { Router } from "express";
import type { Pool } from "pg";
import { z } from "zod";
import { ApiError } from "../../lib/api-error.js";
import type { ApiMetrics } from "../../observability/metrics.js";
import { ProductRepository } from "./product.repository.js";

const productIdSchema = z.coerce.number().int().positive();

export function createProductRouter(database: Pool, metrics: ApiMetrics) {
  const router = Router();
  const products = new ProductRepository(database, metrics);

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
