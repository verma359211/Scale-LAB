import type { MetricsTimeseries } from "../lab-types";
import { useEffect, useRef, useState } from "react";
import { splitMetricGaps } from "../lib/chart-data";
import { ChartLoader } from "./ChartLoader";

export function TrafficCapacityChart({ data, loading = false }: { data: MetricsTimeseries | null; loading?: boolean }) {
  const container = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(960);
  useEffect(() => {
    if (!container.current) return;
    // Match the drawing to its container so axis labels stay readable on phones.
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setWidth(Math.max(320, Math.min(960, entry.contentRect.width)));
    });
    observer.observe(container.current);
    return () => observer.disconnect();
  }, []);
  const requests = data?.series.ingressRps ?? [];
  const servers = data?.series.apiPodCount ?? [];
  const start = data ? Date.parse(data.start) : 0;
  const end = data ? Date.parse(data.end) : 1;
  const trafficMax = Math.max(10, Math.ceil(Math.max(0, ...requests.map(p => p.value)) / 100) * 100);
  const serverMax = Math.max(4, Math.ceil(Math.max(0, ...servers.map(p => p.value)) / 4) * 4);
  const height = width < 560 ? 260 : 280, left = 52, right = 48, top = 28, bottom = 38;
  const plotWidth = width - left - right, plotHeight = height - top - bottom;
  const x = (time: number) => left + (time - start) / Math.max(1, end - start) * plotWidth;
  const y = (value: number, maximum: number) => top + (1 - value / maximum) * plotHeight;
  const time = (value: number) => new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const number = (value: number) => value >= 1000 ? `${+(value / 1000).toFixed(1)}k` : `${Math.round(value)}`;

  return <div className="traffic-capacity-chart" ref={container}>
    <div className="hero-chart-heading"><h3>What happens when traffic increases?</h3><span>REAL METRICS / {data ? `${Math.round((end - start) / 60000)} MIN` : "WAITING"}</span></div>
    <div className="hero-chart-legend"><span><i />Requests / second <small>left axis</small></span><span><i />Ready API servers <small>right axis</small></span></div>
    {loading ? <ChartLoader aspectRatio={`${width}/${height}`} /> : requests.length === 0 && servers.length === 0 ? <div className="hero-chart-empty">Waiting for live metric samples. No simulated data is shown.</div> :
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Requests per second and Ready API servers over time">
        <desc>Two independent scales: requests per second on the left, Ready server count on the right. Missing scrapes remain gaps. {requests.length ? `Latest traffic ${requests[requests.length - 1]!.value.toFixed(1)} requests per second.` : "Traffic unavailable."} {servers.length ? `Latest Ready servers ${servers[servers.length - 1]!.value}.` : "Server count unavailable."} Line crossings do not imply equal values.</desc>
        <text x={left} y={12} className="axis-label">REQ / SEC</text><text x={width - right} y={12} textAnchor="end" className="axis-label">READY SERVERS</text>
        {[0, 1, 2, 3, 4].map(i => <g key={i}>
          <line x1={left} x2={width - right} y1={top + i / 4 * plotHeight} y2={top + i / 4 * plotHeight} className="chart-grid" />
          <text x={left - 12} y={top + i / 4 * plotHeight + 4} textAnchor="end">{number(trafficMax * (1 - i / 4))}</text>
          <text x={width - right + 12} y={top + i / 4 * plotHeight + 4} className="server-axis">{serverMax * (1 - i / 4)}</text>
        </g>)}
        {splitMetricGaps(requests).map((segment, index) => <g key={`traffic-${index}`}>
          <polygon points={`${x(segment[0]!.timestamp)},${top + plotHeight} ${segment.map(p => `${x(p.timestamp)},${y(p.value, trafficMax)}`).join(" ")} ${x(segment[segment.length - 1]!.timestamp)},${top + plotHeight}`} fill="#b84a30" fillOpacity="0.055" />
          <polyline points={segment.map(p => `${x(p.timestamp)},${y(p.value, trafficMax)}`).join(" ")} className="traffic-line" />
        </g>)}
        {splitMetricGaps(servers).map((segment, index) => <polyline key={`servers-${index}`} points={segment.map((p, i) => `${i ? `${x(p.timestamp)},${y(segment[i - 1]!.value, serverMax)} ` : ""}${x(p.timestamp)},${y(p.value, serverMax)}`).join(" ")} className="server-line" />)}
        {(width < 560 ? [0, 2, 4] : [0, 1, 2, 3, 4]).map(i => <text key={i} x={left + i / 4 * plotWidth} y={height - 10} textAnchor={i === 0 ? "start" : i === 4 ? "end" : "middle"}>{time(start + i / 4 * (end - start))}</text>)}
      </svg>}
    <p className="hero-chart-note">Traffic uses a rolling 30-second rate. Server counts are measured snapshots. Each line has its own labeled scale.</p>
  </div>;
}
