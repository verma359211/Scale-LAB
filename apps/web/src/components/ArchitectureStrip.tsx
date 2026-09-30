import type { RequestDebug } from "../types";

type ArchitectureStripProps = {
  debug: RequestDebug | null;
};

export function ArchitectureStrip({ debug }: ArchitectureStripProps) {
  const nodes = [
    { eyebrow: "Traffic", title: "Browser", detail: "Incoming requests" },
    {
      eyebrow: "Compute",
      title: debug?.instanceId ?? "API-1",
      detail: debug ? `${debug.responseTimeMs}ms browser latency` : "Waiting for a request",
    },
    { eyebrow: "Persistence", title: "PostgreSQL", detail: "Pooled connections" },
  ];

  return (
    <section aria-label="Current system architecture" className="mt-8 rounded-2xl border border-white/10 bg-slate-900/40 p-5">
      <div className="mb-4 flex items-center justify-between gap-4">
        <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Live request path</h2>
        <span className="text-xs text-slate-600">Detailed metrics live in Grafana</span>
      </div>
      <div className="grid items-center gap-3 md:grid-cols-[1fr_auto_1fr_auto_1fr]">
        {nodes.map((node, index) => (
          <div className="contents" key={node.title}>
            <div className="rounded-xl border border-slate-800 bg-slate-950/70 px-4 py-3">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-400/70">{node.eyebrow}</p>
              <p className="mt-1 font-semibold text-white">{node.title}</p>
              <p className="mt-1 text-xs text-slate-500">{node.detail}</p>
            </div>
            {index < nodes.length - 1 && <span aria-hidden="true" className="text-center text-cyan-400/50">↓</span>}
          </div>
        ))}
      </div>
    </section>
  );
}
