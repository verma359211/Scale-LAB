import type { RequestDebug } from "../types";

type Props = {
  debug: RequestDebug | null;
};

export function RequestInfo({ debug }: Props) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm" aria-labelledby="request-info-title">
      <div className="flex items-center justify-between">
        <h3 id="request-info-title" className="text-sm font-semibold text-slate-950">Last request</h3>
        <span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 font-mono text-[10px] text-slate-500">HTTP</span>
      </div>
      <dl className="mt-4 space-y-3">
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-3">
          <dt className="text-xs text-slate-500">API Pod</dt>
          <dd className="max-w-[220px] break-all text-right font-mono text-xs text-slate-700">{debug?.instanceId ?? "No request yet"}</dd>
        </div>
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-3">
          <dt className="text-xs text-slate-500">Browser latency</dt>
          <dd className="font-mono text-xs text-slate-700">{debug ? `${debug.responseTimeMs}ms` : "—"}</dd>
        </div>
        <div>
          <dt className="text-xs text-slate-500">Request ID</dt>
          <dd className="mt-1.5 break-all font-mono text-[11px] leading-4 text-slate-400">{debug?.requestId ?? "—"}</dd>
        </div>
      </dl>
    </section>
  );
}
