type Props = {
  label: string;
  value: number | null | undefined;
  format: (value: number) => string;
  detail?: string;
  loading?: boolean;
  emptyText?: string;
  help?: string;
};

export function MetricCard({ label, value, format, detail, loading, emptyText = "Unavailable", help }: Props) {
  return (
    <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm" title={help}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-[0.12em] text-slate-500">{label}</p>
        {help && <span tabIndex={0} className="grid h-5 w-5 shrink-0 place-items-center rounded-full border border-slate-200 text-[10px] font-semibold text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900" aria-label={help} title={help}>?</span>}
      </div>
      {loading ? (
        <div className="mt-3 h-8 w-24 animate-pulse rounded bg-slate-100" />
      ) : (
        <p className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
          {value === null || value === undefined ? "--" : format(value)}
        </p>
      )}
      {!loading && (value === null || value === undefined)
        ? <p className="mt-1.5 text-xs text-slate-500">{emptyText}</p>
        : detail && <p className="mt-1.5 text-xs text-slate-500">{detail}</p>}
    </article>
  );
}
