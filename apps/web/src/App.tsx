import { useCallback, useEffect, useState } from "react";
import { ProductCard } from "./components/ProductCard";
import { ArchitectureStrip } from "./components/ArchitectureStrip";
import { api, ApiClientError } from "./lib/api";
import type { Order, Product, RequestDebug } from "./types";

function generateUserId() {
  return `user-${crypto.randomUUID().slice(0, 8)}`;
}

export default function App() {
  const [products, setProducts] = useState<Product[]>([]);
  const [quantities, setQuantities] = useState<Record<number, number>>({});
  const [userId, setUserId] = useState(generateUserId);
  const [busyProductId, setBusyProductId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [order, setOrder] = useState<Order | null>(null);
  const [debug, setDebug] = useState<RequestDebug | null>(null);

  const loadProducts = useCallback(async () => {
    const result = await api.listProducts();
    setProducts(result.data);
    setDebug(result.debug);
  }, []);

  useEffect(() => {
    loadProducts()
      .catch((cause: unknown) => {
        setError(cause instanceof Error ? cause.message : "Could not load products");
        if (cause instanceof ApiClientError) setDebug(cause.debug);
      })
      .finally(() => setLoading(false));
  }, [loadProducts]);

  async function buy(product: Product) {
    const normalizedUserId = userId.trim();
    if (!normalizedUserId) {
      setError("Enter a user ID before placing an order.");
      return;
    }

    setBusyProductId(product.id);
    setError(null);
    setOrder(null);

    try {
      const result = await api.createOrder({
        userId: normalizedUserId,
        productId: product.id,
        quantity: quantities[product.id] ?? 1,
      });
      setOrder(result.data);
      setDebug(result.debug);
      await loadProducts();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The order could not be placed");
      if (cause instanceof ApiClientError) setDebug(cause.debug);
      await loadProducts().catch(() => undefined);
    } finally {
      setBusyProductId(null);
    }
  }

  return (
    <main className="min-h-screen overflow-hidden bg-slate-950 text-slate-100">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.13),transparent_35%),radial-gradient(circle_at_80%_20%,rgba(129,140,248,0.09),transparent_30%)]" />
      <div className="relative mx-auto max-w-6xl px-5 py-10 sm:px-8 lg:py-16">
        <header className="border-b border-white/10 pb-9">
          <div className="inline-flex items-center gap-2 rounded-full border border-cyan-400/20 bg-cyan-400/5 px-3 py-1.5 text-xs font-medium text-cyan-300">
            <span className="h-2 w-2 rounded-full bg-cyan-400 shadow-[0_0_12px_#22d3ee]" /> ScaleLab · Kubernetes autoscaling
          </div>
          <h1 className="mt-5 text-4xl font-semibold tracking-tight text-white sm:text-6xl">A tiny store built to scale.</h1>
          <p className="mt-4 max-w-2xl leading-7 text-slate-400">
            Place a PostgreSQL-backed order and see which autoscaled API pod handled the request.
          </p>
        </header>

        <ArchitectureStrip debug={debug} />

        <section className="mt-8 grid gap-5 rounded-2xl border border-white/10 bg-slate-900/50 p-5 md:grid-cols-[1fr_auto] md:items-end">
          <label className="text-sm font-medium text-slate-300">
            Demo user ID
            <input
              value={userId}
              maxLength={100}
              onChange={(event) => setUserId(event.target.value)}
              className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 font-mono text-sm text-white outline-none focus:border-cyan-400"
            />
          </label>
          <button type="button" onClick={() => setUserId(generateUserId())} className="rounded-xl border border-slate-700 px-4 py-3 text-sm text-slate-300 hover:border-cyan-400/50 hover:text-cyan-300">
            Generate another
          </button>
        </section>

        {order && (
          <div className="mt-6 rounded-2xl border border-emerald-400/20 bg-emerald-400/10 p-5 text-emerald-100">
            <p className="font-semibold">Order confirmed</p>
            <p className="mt-1 text-sm text-emerald-200/80">Order {order.id} · {order.quantity} item(s) · ${order.totalPrice.toFixed(2)}</p>
          </div>
        )}

        {error && (
          <div role="alert" className="mt-6 flex items-center justify-between rounded-2xl border border-rose-400/20 bg-rose-400/10 p-5 text-rose-100">
            <div><p className="font-semibold">Order failed</p><p className="mt-1 text-sm text-rose-200/80">{error}</p></div>
            <button type="button" onClick={() => setError(null)} aria-label="Dismiss error" className="text-xl text-rose-200">×</button>
          </div>
        )}

        <section className="mt-10">
          <div className="mb-5 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-400">Flash-sale products</h2>
            <span className="font-mono text-xs text-slate-600">GET /api/products</span>
          </div>

          {loading ? (
            <div className="rounded-2xl border border-white/10 p-12 text-center text-slate-500">Loading products…</div>
          ) : products.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-700 p-12 text-center text-slate-400">No products are available.</div>
          ) : (
            <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
              {products.map((product) => (
                <ProductCard
                  key={product.id}
                  product={product}
                  quantity={quantities[product.id] ?? 1}
                  busy={busyProductId === product.id}
                  onQuantityChange={(quantity) => setQuantities((current) => ({ ...current, [product.id]: quantity }))}
                  onBuy={() => void buy(product)}
                />
              ))}
            </div>
          )}
        </section>

        <aside className="mt-10 rounded-xl border border-white/5 bg-black/20 px-4 py-3 font-mono text-xs text-slate-500">
          <span className="mr-5">request: {debug?.requestId ?? "—"}</span>
          <span className="mr-5">instance: {debug?.instanceId ?? "—"}</span>
          <span>browser latency: {debug ? `${debug.responseTimeMs}ms` : "—"}</span>
        </aside>
      </div>
    </main>
  );
}
