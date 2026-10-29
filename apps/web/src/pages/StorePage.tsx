import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityPanel } from "../components/ActivityPanel";
import { ArchitectureStrip } from "../components/ArchitectureStrip";
import { OrderFeedback } from "../components/OrderFeedback";
import { ProductCard, ProductCardSkeleton } from "../components/ProductCard";
import { ProjectHighlights } from "../components/ProjectHighlights";
import { RequestInfo } from "../components/RequestInfo";
import { api, ApiClientError } from "../lib/api";
import type { ActivityEvent, Order, Product, RequestDebug } from "../types";

function generateUserId() {
  const suffix = typeof globalThis.crypto?.randomUUID === "function"
    ? globalThis.crypto.randomUUID().slice(0, 8)
    : `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`.slice(-8);
  return `user-${suffix}`;
}

type OrderConfirmation = { order: Order; productName: string; debug: RequestDebug };
type OrderFailure = { kind: "stock" | "api" | "validation"; message: string };
type OrderPhase = "ordering" | "refreshing" | null;

function SectionHeading({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return (
    <div className="max-w-2xl">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-600">{eyebrow}</p>
      <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl">{title}</h2>
      <p className="mt-3 text-sm leading-6 text-slate-600 sm:text-base">{description}</p>
    </div>
  );
}

export function StorePage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [quantities, setQuantities] = useState<Record<number, number>>({});
  const [userId, setUserId] = useState(generateUserId);
  const [busyProductId, setBusyProductId] = useState<number | null>(null);
  const [orderPhase, setOrderPhase] = useState<OrderPhase>(null);
  const [loading, setLoading] = useState(true);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [orderFailure, setOrderFailure] = useState<OrderFailure | null>(null);
  const [confirmation, setConfirmation] = useState<OrderConfirmation | null>(null);
  const [debug, setDebug] = useState<RequestDebug | null>(null);
  const [activity, setActivity] = useState<ActivityEvent[]>([]);
  const eventSequence = useRef(0);
  const initialLoadStarted = useRef(false);

  const addActivity = useCallback((message: string, detail?: string, tone: ActivityEvent["tone"] = "neutral") => {
    setActivity((current) => [{
      id: ++eventSequence.current,
      timestamp: new Date().toLocaleTimeString([], { hour12: false }),
      message,
      detail,
      tone,
    }, ...current].slice(0, 12));
  }, []);

  const loadProducts = useCallback(async (reason: "initial" | "refresh") => {
    addActivity(reason === "initial" ? "Fetching products" : "Refreshing inventory");
    const result = await api.listProducts();
    setProducts(result.data);
    setDebug(result.debug);
    setCatalogError(null);
    addActivity(reason === "initial" ? "Products loaded" : "Inventory refreshed", `${result.data.length} products · ${result.debug.responseTimeMs}ms`, "success");
  }, [addActivity]);

  useEffect(() => {
    if (initialLoadStarted.current) return;
    initialLoadStarted.current = true;
    loadProducts("initial")
      .catch((cause: unknown) => {
        const message = cause instanceof Error ? cause.message : "Could not load products";
        setCatalogError(message);
        addActivity("Product request failed", message, "error");
        if (cause instanceof ApiClientError) setDebug(cause.debug);
      })
      .finally(() => setLoading(false));
  }, [addActivity, loadProducts]);

  async function buy(product: Product) {
    const normalizedUserId = userId.trim();
    const quantity = quantities[product.id] ?? 1;
    if (!normalizedUserId) {
      const message = "Enter a user ID before placing an order.";
      setOrderFailure({ kind: "validation", message });
      addActivity("Order not sent", message, "error");
      return;
    }

    setBusyProductId(product.id);
    setOrderPhase("ordering");
    setOrderFailure(null);
    setConfirmation(null);
    addActivity("Sending order request", `${quantity} × ${product.name}`);

    try {
      const result = await api.createOrder({ userId: normalizedUserId, productId: product.id, quantity });
      setConfirmation({ order: result.data, productName: product.name, debug: result.debug });
      setDebug(result.debug);
      addActivity("Order created", `${result.debug.instanceId ?? "API instance unavailable"} · ${result.debug.responseTimeMs}ms`, "success");
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "The order could not be placed";
      const insufficientStock = cause instanceof ApiClientError && cause.status === 409;
      setOrderFailure({ kind: insufficientStock ? "stock" : "api", message });
      if (cause instanceof ApiClientError) setDebug(cause.debug);
      addActivity(insufficientStock ? "Insufficient stock" : "Order request failed", message, "error");
    }

    setOrderPhase("refreshing");
    try {
      await loadProducts("refresh");
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Could not refresh inventory";
      setCatalogError(message);
      addActivity("Inventory refresh failed", message, "error");
      if (cause instanceof ApiClientError) setDebug(cause.debug);
    } finally {
      setBusyProductId(null);
      setOrderPhase(null);
    }
  }

  function updateQuantity(product: Product, value: number) {
    const quantity = Math.min(Math.max(product.stock, 1), Math.max(1, value));
    setQuantities((current) => ({ ...current, [product.id]: quantity }));
  }

  return (
    <main>
      <section className="border-b border-slate-200 bg-white">
        <div className="mx-auto grid max-w-7xl gap-10 px-5 py-14 sm:px-8 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end lg:py-20">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Cloud-native Kubernetes demo</div>
            <h1 className="mt-6 text-4xl font-semibold tracking-[-0.035em] text-slate-950 sm:text-6xl">A tiny store with a real distributed backend.</h1>
            <p className="mt-6 max-w-2xl text-base leading-7 text-slate-600 sm:text-lg">A working flash-sale application used to demonstrate scaling, caching, sharding, Kubernetes, and high-load behavior.</p>
            <a href="#catalog" className="mt-8 inline-flex rounded-lg bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2">Explore the flash sale</a>
          </div>
          <dl className="grid grid-cols-3 divide-x divide-slate-200 overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
            {[["2–6", "API Pods"], ["2", "DB shards"], ["30s", "Cache TTL"]].map(([value, label]) => (
              <div key={label} className="min-w-24 px-4 py-4 text-center sm:min-w-28"><dt className="text-xl font-semibold text-slate-950">{value}</dt><dd className="mt-1 text-xs text-slate-500">{label}</dd></div>
            ))}
          </dl>
        </div>
      </section>

      <div className="mx-auto max-w-7xl px-5 pb-16 sm:px-8 lg:pb-24">
        <section id="catalog" className="scroll-mt-20 py-14 lg:py-20">
          <SectionHeading eyebrow="Live storefront" title="Flash-sale catalog" description="Place a real PostgreSQL-backed order. Inventory is reserved atomically and the product cache is invalidated after the transaction commits." />
          <div className="mt-8 grid gap-8 xl:grid-cols-[minmax(0,1fr)_360px]">
            <div className="min-w-0">
              <div className="grid gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-[1fr_auto] sm:items-end">
                <label className="text-sm font-medium text-slate-700">Demo customer ID<span className="mt-1 block text-xs font-normal text-slate-500">Used only to identify this demo order.</span>
                  <input value={userId} maxLength={100} disabled={busyProductId !== null} onChange={(event) => setUserId(event.target.value)} className="control-field mt-3 font-mono" />
                </label>
                <button type="button" disabled={busyProductId !== null} onClick={() => setUserId(generateUserId())} className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 disabled:opacity-50">Generate new ID</button>
              </div>

              <OrderFeedback confirmation={confirmation} failure={orderFailure} phase={orderPhase} onDismiss={() => { setConfirmation(null); setOrderFailure(null); }} />

              {catalogError && !loading && (
                <div role="alert" className="mt-5 flex items-start justify-between gap-4 rounded-xl border border-rose-200 bg-rose-50 p-4">
                  <div><p className="text-sm font-semibold text-rose-800">Catalog unavailable</p><p className="mt-1 text-sm text-rose-700">{catalogError}</p></div>
                  <button type="button" onClick={() => { setLoading(true); loadProducts("refresh").catch((cause: unknown) => setCatalogError(cause instanceof Error ? cause.message : "Could not load products")).finally(() => setLoading(false)); }} className="shrink-0 rounded-lg border border-rose-300 px-3 py-1.5 text-xs font-medium text-rose-800 hover:bg-rose-100">Try again</button>
                </div>
              )}

              <div className="mt-6 grid gap-5 md:grid-cols-2 2xl:grid-cols-3" aria-busy={loading}>
                {loading ? Array.from({ length: 3 }, (_, index) => <ProductCardSkeleton key={index} />) : products.length === 0 && !catalogError ? (
                  <div className="col-span-full rounded-xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center"><p className="font-medium text-slate-700">No products available</p><p className="mt-2 text-sm text-slate-500">The catalog returned successfully but contains no products.</p></div>
                ) : products.map((product) => (
                  <ProductCard key={product.id} product={product} quantity={quantities[product.id] ?? 1} busy={busyProductId === product.id} disabled={busyProductId !== null && busyProductId !== product.id} onQuantityChange={(quantity) => updateQuantity(product, quantity)} onBuy={() => void buy(product)} />
                ))}
              </div>
            </div>
            <aside className="space-y-5 xl:sticky xl:top-24 xl:self-start"><RequestInfo debug={debug} /><ActivityPanel events={activity} /></aside>
          </div>
        </section>

        <section className="border-t border-slate-200 py-14 lg:py-20"><SectionHeading eyebrow="Request path" title="How one request moves through ScaleLab" description="The storefront stays deliberately small so the infrastructure behind every read and order remains easy to see and explain." /><ArchitectureStrip debug={debug} /></section>
        <section className="border-t border-slate-200 py-14 lg:py-20"><SectionHeading eyebrow="System-design laboratory" title="What ScaleLab demonstrates" description="Each capability was introduced as a measurable experiment, not as decorative infrastructure." /><ProjectHighlights /></section>
        <footer className="flex flex-col gap-3 border-t border-slate-200 pt-8 text-sm text-slate-500 sm:flex-row sm:justify-between"><p>ScaleLab Store · A working distributed-systems demonstration.</p><p className="font-mono text-xs">React → Ingress → API → Redis → PostgreSQL</p></footer>
      </div>
    </main>
  );
}
