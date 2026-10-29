import type { MetricPoint } from "../lab-types";

const colors = ["#2563eb", "#db2777", "#059669", "#9333ea", "#d97706", "#0891b2", "#dc2626", "#475569"];
export function podColor(pod: string, index?: number) {
  if (index !== undefined) return colors[index] ?? `hsl(${(index * 137.508) % 360} 65% 42%)`;
  let hash = 0;
  for (const character of pod) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  return colors[hash % colors.length];
}

// Do not draw a line through a scrape outage or past the life of a terminated pod.
export function splitMetricGaps(points: MetricPoint[], maximumGapMs = 12_000) {
  const segments: MetricPoint[][] = [];
  for (const point of points) {
    const last = segments.at(-1);
    if (!last || point.timestamp - last.at(-1)!.timestamp > maximumGapMs) segments.push([point]);
    else last.push(point);
  }
  return segments;
}
