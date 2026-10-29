import type { RequestDebug } from "../types";

type ArchitectureStripProps = {
  debug: RequestDebug | null;
};

export function ArchitectureStrip({ debug }: ArchitectureStripProps) {
  const nodes = [
    { short: "01", title: "Browser", detail: "Sends product and order requests." },
    { short: "02", title: "Cloud load balancer", detail: "Receives public traffic." },
    { short: "03", title: "Ingress", detail: "Routes HTTP traffic into the cluster." },
    { short: "04", title: "Kubernetes Service", detail: "Targets healthy, ready API Pods." },
    {
      short: "05",
      title: debug?.instanceId ?? "API Pods",
      detail: debug ? "Handled the last visible request." : "Horizontally scalable Node.js instances.",
    },
    { short: "06", title: "Redis", detail: "Caches frequent product reads." },
    { short: "07", title: "PostgreSQL shards", detail: "Distribute persistent product data." },
  ];

  return (
    <div className="mt-8 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
        <p className="text-sm font-medium text-slate-700">Live request path</p>
        <span className="hidden font-mono text-xs text-slate-400 sm:block">Last pod: {debug?.instanceId ?? "waiting for request"}</span>
      </div>
      <ol className="grid sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
        {nodes.map((node, index) => (
          <li key={node.short} className="relative min-h-36 border-b border-slate-200 p-4 sm:border-r xl:border-b-0">
            <div className="flex items-center justify-between">
              <span className="font-mono text-xs text-blue-600">{node.short}</span>
              {index < nodes.length - 1 && <span aria-hidden="true" className="text-slate-300">→</span>}
            </div>
            <p className="mt-5 break-words text-sm font-semibold text-slate-950">{node.title}</p>
            <p className="mt-2 text-xs leading-5 text-slate-500">{node.detail}</p>
          </li>
        ))}
      </ol>
      <p className="border-t border-slate-200 bg-slate-50 px-5 py-3 text-xs text-slate-500">
        Redis serves cache hits directly; cache misses continue to the owning PostgreSQL shard.
      </p>
    </div>
  );
}
