import type { MetricsSummary } from "../lab-types";
import { HPA_TARGET_PERCENT } from "../lib/system-state";

function Node({ title, detail, accent = false }: { title: string; detail: string; accent?: boolean }) {
  return (
    <div className={`rounded-lg border px-3 py-3 text-center ${accent ? "border-blue-200 bg-blue-50" : "border-slate-200 bg-white"}`}>
      <p className="text-xs font-semibold text-slate-900">{title}</p>
      <p className="mt-1 text-[11px] text-slate-500">{detail}</p>
    </div>
  );
}

const Arrow = () => <span className="block text-center text-sm text-slate-300 sm:hidden" aria-hidden="true">↓</span>;

export function SystemTopology({ summary }: { summary: MetricsSummary | null }) {
  const metric = (key: keyof MetricsSummary["metrics"]) => summary?.metrics[key];
  const number = (key: keyof MetricsSummary["metrics"], suffix = "") => {
    const current = metric(key);
    return current == null ? "--" : `${current.toFixed(current >= 100 ? 0 : 1)}${suffix}`;
  };
  const redis = metric("redisHitRatio");

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm" aria-labelledby="topology-title">
      <h2 id="topology-title" className="text-base font-semibold text-slate-950">Live system topology</h2>
      <p className="mt-1 text-sm text-slate-500">The benchmark request path is separate from experiment control and monitoring.</p>

      <div className="mt-5 rounded-lg border border-dashed border-blue-200 bg-blue-50/50 p-3">
        <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-blue-700">Outside Kubernetes</p>
        <Node title="External k6 Load Generator" detail="Civo VM · sends benchmark traffic" accent />
      </div>
      <span className="block py-1 text-center text-slate-300">↓</span>

      <div className="grid items-center gap-2 sm:grid-cols-[1fr_auto_1fr_auto_1fr]">
        <Node title="Civo Load Balancer" detail="public entry point" />
        <span className="hidden text-slate-300 sm:block">→</span><Arrow />
        <Node title="NGINX Ingress" detail={`${number("ingressRps")} API req/s · 30s rolling`} />
        <span className="hidden text-slate-300 sm:block">→</span><Arrow />
        <Node title="Kubernetes Service" detail="routes only to ready Pods" />
      </div>
      <span className="block py-1 text-center text-slate-300">↓</span>

      <div className="mx-auto max-w-lg">
        <Node
          title="Node.js API Pods"
          detail={`${number("apiPodCount")} ready · ${number("desiredPodCount")} desired · ${number("apiCpuPercent", "%")} CPU of request · HPA ${HPA_TARGET_PERCENT}%`}
          accent
        />
      </div>
      <div className="mx-auto grid max-w-xl grid-cols-2 gap-3 py-1 text-center text-slate-300"><span>↙</span><span>↘</span></div>
      <div className="mx-auto grid max-w-xl gap-3 sm:grid-cols-2">
        <Node title="Redis Cache" detail={redis == null ? "No recent cache traffic" : `${number("redisHitRatio", "%")} hit ratio`} />
        <Node title="PostgreSQL Shards" detail={`${number("postgresP95LatencyMs", "ms")} query p95`} />
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-3 text-center text-xs text-slate-600">
          <span className="font-semibold text-slate-800">Prometheus</span> → metrics → <span className="font-semibold text-slate-800">Dashboard</span>
        </div>
        <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-3 text-center text-xs text-slate-600">
          <span className="font-semibold text-slate-800">Lab controller</span> → starts/stops experiments only
        </div>
      </div>
    </section>
  );
}
