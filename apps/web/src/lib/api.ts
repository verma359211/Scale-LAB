import type { Order, Product, RequestDebug } from "../types";

const baseUrl = import.meta.env.VITE_API_URL ?? "/api";

export class ApiClientError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly debug: RequestDebug,
  ) {
    super(message);
  }
}

type ApiResult<T> = { data: T; debug: RequestDebug };

async function request<T>(path: string, options?: RequestInit): Promise<ApiResult<T>> {
  const startedAt = performance.now();
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...options?.headers },
  });
  const debug = {
    requestId: response.headers.get("x-request-id"),
    instanceId: response.headers.get("x-instance-id"),
    responseTimeMs: Number((performance.now() - startedAt).toFixed(1)),
  };
  const body = await response.json().catch(() => null);

  if (!response.ok) {
    throw new ApiClientError(body?.error ?? `Request failed (${response.status})`, response.status, debug);
  }
  return { data: body.data as T, debug };
}

export const api = {
  listProducts: () => request<Product[]>("/products"),
  getProduct: (id: number) => request<Product>(`/products/${id}`),
  createOrder: (input: { userId: string; productId: number; quantity: number }) =>
    request<Order>("/orders", { method: "POST", body: JSON.stringify(input) }),
  getOrder: (id: string) => request<Order>(`/orders/${id}`),
};
