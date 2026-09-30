export type Product = {
  id: number;
  name: string;
  description: string;
  price: number;
  stock: number;
  createdAt: string;
};

export type Order = {
  id: string;
  userId: string;
  productId: number;
  quantity: number;
  totalPrice: number;
  status: "confirmed";
  createdAt: string;
};

export type RequestDebug = {
  requestId: string | null;
  instanceId: string | null;
  responseTimeMs: number;
};
