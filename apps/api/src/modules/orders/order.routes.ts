import { Router } from "express";
import type { Pool } from "pg";
import { ApiError } from "../../lib/api-error.js";
import { createOrderSchema, orderIdSchema } from "./order.schema.js";
import { OrderService } from "./order.service.js";

export function createOrderRouter(database: Pool) {
  const router = Router();
  const orders = new OrderService(database);

  router.post("/", async (request, response) => {
    const parsed = createOrderSchema.safeParse(request.body);
    if (!parsed.success) throw new ApiError(400, "Invalid order", parsed.error.flatten());
    response.status(201).json({ data: await orders.create(parsed.data) });
  });

  router.get("/:id", async (request, response) => {
    const parsedId = orderIdSchema.safeParse(request.params.id);
    if (!parsedId.success) throw new ApiError(400, "Invalid order ID");

    const order = await orders.getById(parsedId.data);
    if (!order) throw new ApiError(404, "Order not found");
    response.json({ data: order });
  });

  return router;
}
