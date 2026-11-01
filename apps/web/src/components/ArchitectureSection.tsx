import { useState } from "react";
import type { MetricsSummary } from "../lab-types";

const stack = [
  ["nodedotjs", "Node.js + Express", "API services", "#50853d"],
  ["typescript", "TypeScript", "Typed application code", "#3178c6"],
  ["postgresql", "PostgreSQL", "Two product shards", "#416b89"],
  ["redis", "Redis", "Cache & quotas", "#c63f35"],
  ["kubernetes", "Kubernetes", "Pods & autoscaling", "#326ce5"],
  ["docker", "Docker", "Container images", "#2496ed"],
  ["prometheus", "Prometheus", "Metrics collection", "#e6522c"],
  ["grafana", "Grafana", "Metric dashboards", "#d98024"],
  ["k6", "k6", "Traffic generation", "#7d54ce"],
  ["civo", "Civo", "Cluster & VM", "#2685d4"],
  ["react", "React + Vite", "Web frontend", "#2789a2"],
  ["nginx", "NGINX Ingress", "HTTPS routing", "#159447"],
];
const explanations = {
  read: "Product reads check Redis. A miss queries the product’s PostgreSQL shard, then fills the cache.",
  write: "Orders and stock commit atomically on the product’s shard. The API then invalidates the product cache.",
  observe: "The lab controller coordinates the private generator. Prometheus collects metrics for Grafana and this dashboard.",
};

function TechIcon({ name, color }: { name: string; color: string }) {
  return <span className="tech-icon" style={{ backgroundColor: color, maskImage: `url(/icons/tech/${name}.svg)`, WebkitMaskImage: `url(/icons/tech/${name}.svg)` }} aria-hidden="true" />;
}

function FlowConnections() {
  return <svg className="architecture-connections" viewBox="0 0 1000 270" preserveAspectRatio="none" aria-hidden="true">
    <defs>
      <marker id="arch-request-arrow" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto"><path d="M0 0 6 3 0 6Z" fill="#a96348" /></marker>
      <marker id="arch-cache-arrow" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto"><path d="M0 0 6 3 0 6Z" fill="#538e72" /></marker>
    </defs>
    <g fill="none" stroke="#a96348" strokeWidth="1.25" markerEnd="url(#arch-request-arrow)">
      <path d="M150 133H175" /><path d="M325 133H350" /><path d="M500 133H525" />
      <path className="connection-write" d="M725 133H737V186H750" />
    </g>
    <path className="connection-read" d="M725 133H737V81H750" fill="none" stroke="#538e72" strokeWidth="1.25" markerEnd="url(#arch-cache-arrow)" />
    <path className="connection-observe" d="M75 232V257H625V232M425 232V257" fill="none" stroke="#9aab91" strokeWidth="1.2" strokeDasharray="4 4" />
  </svg>;
}

export function ArchitectureSection({ summary }: { summary: MetricsSummary | null }) {
  const [view, setView] = useState<keyof typeof explanations>("read");
  const ready = summary?.metrics.apiPodCount;
  const desired = summary?.metrics.desiredPodCount;
  return <section id="architecture" className="architecture-section" aria-labelledby="architecture-title">
    <header className="architecture-heading">
      <div><p className="hero-kicker">03 / Architecture</p><h2 id="architecture-title">How ScaleLab is built<span>.</span></h2></div>
      <p>A small ecommerce app. A real cloud system.<br />Follow the traffic, then see what keeps it running.</p>
      <a href="https://github.com/verma359211/Scale-LAB" target="_blank" rel="noreferrer">Explore the code <span aria-hidden="true">↗</span></a>
    </header>
    <div className="architecture-layout">
      <figure className="architecture-map" data-view={view} aria-label="ScaleLab request, control and monitoring architecture">
        <p className="architecture-scroll-hint">Follow the request → swipe to explore</p>
        <div className="architecture-flow-scroll" role="region" aria-label="Request flow diagram, scroll horizontally on smaller screens" tabIndex={0}>
          <div className="architecture-canvas">
            <FlowConnections />
            <div className="architecture-lanes">
              <div className="architecture-lane"><h3>Load generation</h3><div className="architecture-node"><TechIcon name="k6" color="#7d54ce" /><strong>k6 generator</strong><small>External Civo VM</small><p>Real HTTP traffic.<br />One test at a time.</p></div></div>
              <div className="architecture-lane"><h3>Public entry</h3><div className="architecture-node"><TechIcon name="civo" color="#2685d4" /><strong>Civo load balancer</strong><small>Managed entry point</small><p>Forwards traffic<br />into the cluster.</p></div></div>
              <div className="architecture-lane"><h3>Ingress</h3><div className="architecture-node"><TechIcon name="nginx" color="#159447" /><strong>NGINX Ingress</strong><small>HTTPS · Layer 7</small><p>Routes requests to<br />Ready API endpoints.</p><span className="architecture-service">Kubernetes Service</span></div></div>
              <div className="architecture-lane"><h3>Compute / Kubernetes</h3><div className="architecture-api-stack"><div className="architecture-node architecture-pods"><TechIcon name="nodedotjs" color="#50853d" /><strong>Node.js API pods</strong><small>Express + TypeScript</small><p>HPA · 2–6 replicas<br />70% CPU target</p><span className="architecture-live-count">Snapshot: {ready == null ? "—" : Math.round(ready)} Ready / {desired == null ? "—" : Math.round(desired)} desired</span></div></div></div>
              <div className="architecture-lane architecture-data"><h3>Data layer</h3><div className="architecture-node architecture-redis"><TechIcon name="redis" color="#c63f35" /><div><strong>Redis</strong><small>Product cache<br />Shared rate-limit store</small></div></div><div className="architecture-node architecture-postgres"><TechIcon name="postgresql" color="#416b89" /><div><strong>PostgreSQL</strong><small>2 shards · by product<br />Atomic orders & stock</small></div></div></div>
            </div>
          </div>
        </div>
        <div className="architecture-support"><p>Observability & orchestration</p><div className="architecture-support-tools">
          <div><TechIcon name="prometheus" color="#e6522c" /><span><strong>Prometheus</strong><small>Metrics collection</small></span></div>
          <div><TechIcon name="grafana" color="#d98024" /><span><strong>Grafana</strong><small>Detailed dashboards</small></span></div>
          <div><svg className="architecture-controller-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><rect x="8" y="8" width="8" height="8" rx="2" /><path d="M12 2v6m0 8v6M2 12h6m8 0h6M5 5l4 4m6 6 4 4M5 19l4-4m6-6 4-4" /></svg><span><strong>Lab controller</strong><small>Private generator · cleanup</small></span></div>
        </div></div>
        <figcaption className="architecture-explore"><div role="group" aria-label="Explore architecture paths">{(["read", "write", "observe"] as const).map(path => <button key={path} type="button" aria-pressed={view === path} onClick={() => setView(path)}>{path === "read" ? "Product read" : path === "write" ? "Place an order" : "Observe"}</button>)}</div><p aria-live="polite">{explanations[view]}</p></figcaption>
      </figure>
      <aside className="architecture-stack" aria-labelledby="stack-title"><h3 id="stack-title">The tech stack</h3><ul>{stack.map(([icon, name, description, color]) => <li key={name}><TechIcon name={icon} color={color} /><div><strong>{name}</strong><small>{description}</small></div></li>)}</ul><a href="/store">Explore the working Store <span aria-hidden="true">↗</span></a></aside>
    </div>
    <p className="architecture-footnote"><span>Scale the API. Protect the inventory. Measure the result.</span> Solid arrows: requests · dashed lines: control & telemetry · stacked cards illustrate autoscaling, not live pod count.</p>
  </section>;
}
