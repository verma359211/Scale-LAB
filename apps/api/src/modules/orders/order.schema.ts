import { z } from "zod";

export const createOrderSchema = z.object({
  userId: z.string().trim().min(1).max(100),
  productId: z.number().int().positive(),
  quantity: z.number().int().positive().max(100),
}).strict();

export const orderIdSchema = z.string().uuid();

export type CreateOrderInput = z.infer<typeof createOrderSchema>;
