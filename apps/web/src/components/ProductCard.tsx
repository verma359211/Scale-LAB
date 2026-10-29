import type { Product } from "../types";

type Props = {
  product: Product;
  quantity: number;
  busy: boolean;
  disabled: boolean;
  onQuantityChange: (quantity: number) => void;
  onBuy: () => void;
};

const currency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

const productVisuals = [
  { label: "KEYS", color: "text-blue-700", surface: "bg-blue-50" },
  { label: "WEAR", color: "text-violet-700", surface: "bg-violet-50" },
  { label: "DESK", color: "text-amber-700", surface: "bg-amber-50" },
];

export function ProductCard({ product, quantity, busy, disabled, onQuantityChange, onBuy }: Props) {
  const soldOut = product.stock === 0;
  const visual = productVisuals[(product.id - 1) % productVisuals.length];

  return (
    <article className="group flex min-h-[420px] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md">
      <div className={`relative grid h-40 place-items-center border-b border-slate-200 ${visual.surface}`}>
        <div className="product-grid absolute inset-0 opacity-25" />
        <div className={`relative grid h-20 w-20 place-items-center rounded-2xl border border-current/20 bg-white/70 font-mono text-sm font-semibold tracking-[0.24em] ${visual.color}`}>
          {visual.label}
        </div>
        <span className="absolute left-4 top-4 rounded-md border border-slate-200 bg-white/70 px-2 py-1 font-mono text-[10px] text-slate-500">
          SKU-{String(product.id).padStart(3, "0")}
        </span>
      </div>

      <div className="flex flex-1 flex-col p-5">
        <div className="flex items-start justify-between gap-4">
          <h3 className="text-lg font-semibold leading-6 text-slate-950">{product.name}</h3>
          <span className={`shrink-0 rounded-full border px-2.5 py-1 text-xs font-medium ${soldOut ? "border-rose-200 bg-rose-50 text-rose-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}>
            {soldOut ? "Sold out" : `${product.stock} left`}
          </span>
        </div>

        <p className="mt-3 flex-1 text-sm leading-6 text-slate-600">{product.description}</p>
        <p className="mt-5 text-2xl font-semibold tracking-tight text-slate-950">{currency.format(product.price)}</p>

        <div className="mt-5 grid grid-cols-[88px_1fr] gap-3">
          <label className="text-xs font-medium text-slate-500">
            Quantity
            <input
              aria-label={`Quantity for ${product.name}`}
              type="number"
              inputMode="numeric"
              min={1}
              max={Math.max(product.stock, 1)}
              value={quantity}
              disabled={busy || disabled || soldOut}
              onChange={(event) => onQuantityChange(Number(event.target.value) || 1)}
              className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-center text-sm text-slate-900 outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200 disabled:cursor-not-allowed disabled:opacity-50"
            />
          </label>
          <div className="flex flex-col justify-end">
            <button
              type="button"
              disabled={busy || disabled || soldOut}
              onClick={onBuy}
              className="rounded-lg bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {busy ? "Creating order…" : soldOut ? "Sold out" : "Place order"}
            </button>
          </div>
        </div>
      </div>
    </article>
  );
}

export function ProductCardSkeleton() {
  return (
    <div aria-hidden="true" className="min-h-[420px] overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="h-40 animate-pulse border-b border-slate-200 bg-slate-100" />
      <div className="space-y-4 p-5">
        <div className="h-5 w-2/3 animate-pulse rounded bg-slate-200" />
        <div className="h-4 w-full animate-pulse rounded bg-slate-100" />
        <div className="h-4 w-4/5 animate-pulse rounded bg-slate-100" />
        <div className="h-7 w-1/3 animate-pulse rounded bg-slate-200" />
        <div className="h-10 w-full animate-pulse rounded-lg bg-slate-200" />
      </div>
    </div>
  );
}
