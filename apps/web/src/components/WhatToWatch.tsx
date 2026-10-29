const steps = [
  ["1", "Generate", "External k6 sends controlled traffic"],
  ["2", "Route", "NGINX distributes requests"],
  ["3", "Measure", "CPU and latency respond"],
  ["4", "Scale", "HPA requests more API pods"],
  ["5", "Cache", "Redis serves repeated reads"],
  ["6", "Observe", "Prometheus feeds this dashboard"],
];

export function WhatToWatch() {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm" aria-labelledby="watch-title">
      <div>
        <h2 id="watch-title" className="text-base font-semibold text-slate-950">What happens during a test?</h2>
        <p className="mt-1 text-sm text-slate-500">Follow load → CPU → HPA → capacity while the workload runs.</p>
      </div>
      <ol className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-6">
        {steps.map(([number, title, detail]) => (
          <li key={number} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <div className="flex items-center gap-2">
              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-slate-900 font-mono text-[10px] font-semibold text-white">{number}</span>
              <span className="text-sm font-semibold text-slate-900">{title}</span>
            </div>
            <p className="mt-2 text-xs leading-5 text-slate-500">{detail}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}
