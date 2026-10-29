const capabilities = [
  ["HPA", "Horizontal API scaling", "CPU-based scaling from two to six API Pods."],
  ["K8s", "Kubernetes orchestration", "Services, probes, deployments, and controlled resources."],
  ["RDS", "Redis cache-aside", "Frequent product reads avoid unnecessary database work."],
  ["PG", "PostgreSQL sharding", "Products and orders route across two physical shards."],
  ["429", "Distributed rate limiting", "Redis-backed quotas stay consistent across API Pods."],
  ["L7", "Ingress load balancing", "Layer 7 routing reaches every ready application Pod."],
  ["MET", "Prometheus metrics", "Request, runtime, cache, pool, and database telemetry."],
  ["OBS", "Grafana observability", "Dashboards correlate traffic with system behavior."],
  ["k6", "Repeatable load tests", "Capacity, ramp, spike, limiter, and write workloads."],
  ["TX", "Safe inventory updates", "Atomic stock reservation prevents overselling."],
];

export function ProjectHighlights() {
  return (
    <div className="mt-8 grid gap-px overflow-hidden rounded-xl border border-slate-200 bg-slate-200 sm:grid-cols-2 lg:grid-cols-5">
      {capabilities.map(([code, title, detail]) => (
        <article key={title} className="min-h-44 bg-white p-5 transition hover:bg-slate-50">
          <span className="grid h-9 w-9 place-items-center rounded-lg border border-blue-200 bg-blue-50 font-mono text-[10px] font-semibold text-blue-700">{code}</span>
          <h3 className="mt-5 text-sm font-semibold text-slate-950">{title}</h3>
          <p className="mt-2 text-xs leading-5 text-slate-500">{detail}</p>
        </article>
      ))}
    </div>
  );
}
