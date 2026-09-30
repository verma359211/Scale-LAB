import type { Product } from "../types";

type Props = {
  product: Product;
  quantity: number;
  busy: boolean;
  onQuantityChange: (quantity: number) => void;
  onBuy: () => void;
};

const currency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

export function ProductCard({ product, quantity, busy, onQuantityChange, onBuy }: Props) {
  const soldOut = product.stock === 0;

  return (
    <article className="flex h-full flex-col rounded-2xl border border-white/10 bg-slate-900/70 p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-400">Flash-sale item</p>
          <h2 className="mt-2 text-xl font-semibold text-white">{product.name}</h2>
        </div>
        <span className={`rounded-full px-3 py-1 text-xs font-medium ${soldOut ? "bg-rose-400/10 text-rose-300" : "bg-emerald-400/10 text-emerald-300"}`}>
          {soldOut ? "Sold out" : `${product.stock} left`}
        </span>
      </div>

      <p className="mt-4 flex-1 text-sm leading-6 text-slate-400">{product.description}</p>
      <p className="mt-6 text-3xl font-semibold text-white">{currency.format(product.price)}</p>

      <div className="mt-6 flex gap-3">
        <label className="flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-950 px-3 text-sm text-slate-400">
          Qty
          <input
            aria-label={`Quantity for ${product.name}`}
            type="number"
            min={1}
            max={Math.max(product.stock, 1)}
            value={quantity}
            onChange={(event) => onQuantityChange(Math.max(1, Number(event.target.value) || 1))}
            className="w-12 bg-transparent py-3 text-center text-white outline-none"
          />
        </label>
        <button
          type="button"
          disabled={busy || soldOut}
          onClick={onBuy}
          className="flex-1 rounded-xl bg-cyan-400 px-4 py-3 font-semibold text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {busy ? "Placing order…" : soldOut ? "Sold out" : "Buy"}
        </button>
      </div>
    </article>
  );
}
