import type { Order, RequestDebug } from "../types";

type Confirmation = { order: Order; productName: string; debug: RequestDebug };
type Failure = { kind: "stock" | "api" | "validation"; message: string };
type Props = {
  confirmation: Confirmation | null;
  failure: Failure | null;
  phase: "ordering" | "refreshing" | null;
  onDismiss: () => void;
};

const currency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

export function OrderFeedback({ confirmation, failure, phase, onDismiss }: Props) {
  if (phase) {
    return (
      <div role="status" aria-live="polite" className="mt-5 rounded-xl border border-blue-200 bg-blue-50 p-4">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-blue-200 border-t-blue-600" />
          <div>
            <p className="text-sm font-semibold text-blue-900">{phase === "ordering" ? "Creating your order…" : "Refreshing available stock…"}</p>
            <p className="mt-1 text-xs leading-5 text-blue-700">{phase === "ordering" ? "One API request reserves inventory and creates the order in a PostgreSQL transaction." : "The order request has finished; the catalog is loading the latest inventory."}</p>
          </div>
        </div>
        {phase === "ordering" && (
          <ol className="mt-4 grid gap-2 text-xs text-slate-600 sm:grid-cols-3">
            {["Send API request", "Reserve inventory atomically", "Create order record"].map((step, index) => (
              <li key={step} className="rounded-lg border border-blue-200 bg-white/70 px-3 py-2"><span className="mr-2 font-mono text-blue-600">0{index + 1}</span>{step}</li>
            ))}
          </ol>
        )}
      </div>
    );
  }

  if (confirmation) {
    const details = [
      ["Product", confirmation.productName],
      ["Quantity", String(confirmation.order.quantity)],
      ["Total", currency.format(confirmation.order.totalPrice)],
      ["API Pod", confirmation.debug.instanceId ?? "Unavailable"],
      ["Latency", `${confirmation.debug.responseTimeMs}ms`],
      ["Request ID", confirmation.debug.requestId ?? "Unavailable"],
    ];
    return (
      <div role="status" className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
        <div className="flex items-start justify-between gap-4">
          <div><p className="text-sm font-semibold text-emerald-900">Order confirmed</p><p className="mt-1 text-sm text-emerald-700">Inventory was reserved and the order was committed.</p></div>
          <button type="button" onClick={onDismiss} aria-label="Dismiss order confirmation" className="rounded-md px-2 text-lg text-emerald-700 hover:bg-emerald-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500">×</button>
        </div>
        <dl className="mt-4 grid gap-3 text-xs sm:grid-cols-2 lg:grid-cols-3">
          <div className="rounded-lg border border-emerald-200 bg-white/70 p-3 sm:col-span-2 lg:col-span-3"><dt className="text-emerald-700">Order ID</dt><dd className="mt-1 break-all font-mono text-emerald-950">{confirmation.order.id}</dd></div>
          {details.map(([label, value]) => <div key={label}><dt className="text-emerald-700">{label}</dt><dd className="mt-1 break-all font-mono text-emerald-950">{value}</dd></div>)}
        </dl>
      </div>
    );
  }

  if (failure) {
    const title = failure.kind === "stock" ? "Not enough stock" : failure.kind === "validation" ? "Check your order" : "Order could not be created";
    return (
      <div role="alert" className="mt-5 flex items-start justify-between gap-4 rounded-xl border border-rose-200 bg-rose-50 p-4">
        <div><p className="text-sm font-semibold text-rose-900">{title}</p><p className="mt-1 text-sm text-rose-700">{failure.message}</p></div>
        <button type="button" onClick={onDismiss} aria-label="Dismiss order error" className="rounded-md px-2 text-lg text-rose-700 hover:bg-rose-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500">×</button>
      </div>
    );
  }

  return null;
}
