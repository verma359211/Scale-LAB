type PrometheusValue = [number, string];

type PrometheusResponse = {
  status: "success" | "error";
  error?: string;
  data?: {
    result: Array<{ metric?: Record<string, string>; value?: PrometheusValue; values?: PrometheusValue[] }>;
  };
};

export type MetricKey = keyof typeof metricQueries;
export type MetricPoint = { timestamp: number; value: number };

export type MetricsSummary = {
  generatedAt: string;
  metrics: Record<MetricKey, number | null>;
  unavailable: MetricKey[];
};

export type MetricsTimeseries = {
  generatedAt: string;
  start: string;
  end: string;
  stepSeconds: number;
  series: Record<MetricKey, MetricPoint[]>;
  unavailable: MetricKey[];
  perPod: Record<"cpuPercent" | "requestRps", Array<{ pod: string; points: MetricPoint[] }>>;
};

// These are intentionally fixed server-side. The browser never supplies PromQL.
export const metricQueries = {
  requestRps: "sum(rate(scalelab_http_requests_total[30s]))",
  p95LatencyMs: "histogram_quantile(0.95, sum by (le) (rate(scalelab_http_request_duration_seconds_bucket[30s])))",
  p99LatencyMs: "histogram_quantile(0.99, sum by (le) (rate(scalelab_http_request_duration_seconds_bucket[30s])))",
  httpErrorRate: "100 * (sum(rate(scalelab_http_requests_total{status_code=~\"5..\"}[30s])) or vector(0)) / sum(rate(scalelab_http_requests_total[30s])) and sum(rate(scalelab_http_requests_total[30s])) > 0",
  apiPodCount: "sum(kube_pod_status_ready{namespace=\"scalelab\",pod=~\"scalelab-api-.*\",condition=\"true\"})",
  desiredPodCount: "kube_horizontalpodautoscaler_status_desired_replicas{namespace=\"scalelab\",horizontalpodautoscaler=\"scalelab-api\"}",
  apiCpuPercent: "avg(100 * sum by (pod) (rate(container_cpu_usage_seconds_total{namespace=\"scalelab\",pod=~\"scalelab-api-.*\",container=\"api\"}[30s])) / 0.25)",
  apiCpuMillicores: "1000 * avg(sum by (pod) (rate(container_cpu_usage_seconds_total{namespace=\"scalelab\",pod=~\"scalelab-api-.*\",container=\"api\"}[30s])))",
  redisHitRatio: "100 * (sum(rate(scalelab_cache_operations_total{result=\"hit\"}[30s])) or vector(0)) / sum(rate(scalelab_cache_operations_total{result=~\"hit|miss\"}[30s])) and sum(rate(scalelab_cache_operations_total{result=~\"hit|miss\"}[30s])) > 0",
  postgresP95LatencyMs: "histogram_quantile(0.95, sum by (le) (rate(scalelab_pg_query_duration_seconds_bucket{outcome=\"success\"}[30s])))",
  activeRequests: "sum(scalelab_http_requests_active)",
  ingressRps: "sum(rate(nginx_ingress_controller_requests{namespace=\"scalelab\",ingress=\"scalelab-api\",service=\"scalelab-api\"}[30s]))",
  apiCpuTotalMillicores: "1000 * sum(rate(container_cpu_usage_seconds_total{namespace=\"scalelab\",pod=~\"scalelab-api-.*\",container=\"api\"}[30s]))",
  poolWaiters: "sum(scalelab_pg_pool_waiting_requests{namespace=\"scalelab\"})",
  successfulOrdersRps: "sum(rate(scalelab_http_requests_total{namespace=\"scalelab\",method=\"POST\",route=\"/api/orders\",status_code=\"201\"}[30s]))",
} as const;

export const podQueries = {
  cpuPercent: "100 * sum by (pod) (rate(container_cpu_usage_seconds_total{namespace=\"scalelab\",pod=~\"scalelab-api-.*\",container=\"api\"}[30s])) / on(pod) max by (pod) (kube_pod_container_resource_requests{namespace=\"scalelab\",pod=~\"scalelab-api-.*\",container=\"api\",resource=\"cpu\"})",
  requestRps: "sum by (api_instance) (rate(scalelab_http_requests_total{namespace=\"scalelab\",api_instance=~\"scalelab-api-.*\"}[30s]))",
} as const;

const millisecondMetrics = new Set<MetricKey>(["p95LatencyMs", "p99LatencyMs", "postgresP95LatencyMs"]);

function normalizeValue(key: MetricKey, raw: string) {
  const value = Number(raw);
  if (!Number.isFinite(value)) return null;
  return millisecondMetrics.has(key) ? value * 1_000 : value;
}

export class PrometheusClient {
  private summaryCache?: { expires: number; promise: Promise<MetricsSummary> };
  private rangeCache = new Map<number, { expires: number; promise: Promise<MetricsTimeseries> }>();
  constructor(
    private readonly baseUrl: string,
    private readonly timeoutMs: number,
  ) {}

  private async fetch(queryPath: string, parameters: URLSearchParams) {
    const response = await fetch(`${this.baseUrl}${queryPath}?${parameters}`, {
      signal: AbortSignal.timeout(this.timeoutMs),
      headers: { Accept: "application/json" },
    });
    if (!response.ok) throw new Error(`Prometheus returned HTTP ${response.status}`);

    const body = await response.json() as PrometheusResponse;
    if (body.status !== "success" || !body.data) {
      throw new Error(body.error ?? "Prometheus query failed");
    }
    return body.data.result;
  }

  async summary(): Promise<MetricsSummary> {
    if (this.summaryCache && this.summaryCache.expires > Date.now()) return this.summaryCache.promise;
    const promise = this.loadSummary();
    this.summaryCache = { expires: Date.now() + 3_000, promise };
    return promise;
  }

  private async loadSummary(): Promise<MetricsSummary> {
    const entries = await Promise.all(Object.entries(metricQueries).map(async ([rawKey, query]) => {
      const key = rawKey as MetricKey;
      try {
        const result = await this.fetch("/api/v1/query", new URLSearchParams({ query }));
        const value = result[0]?.value?.[1];
        return [key, value === undefined ? null : normalizeValue(key, value)] as const;
      } catch {
        return [key, null] as const;
      }
    }));

    const metrics = Object.fromEntries(entries) as Record<MetricKey, number | null>;
    const unavailable = entries.filter(([, value]) => value === null).map(([key]) => key);
    return { generatedAt: new Date().toISOString(), metrics, unavailable };
  }

  async timeseries(windowMinutes = 5): Promise<MetricsTimeseries> {
    if (![5, 10].includes(windowMinutes)) throw new Error("Window must be 5 or 10 minutes");
    const cached = this.rangeCache.get(windowMinutes);
    if (cached && cached.expires > Date.now()) return cached.promise;
    const promise = this.loadTimeseries(windowMinutes);
    this.rangeCache.set(windowMinutes, { expires: Date.now() + 5_000, promise });
    return promise;
  }

  private async loadTimeseries(windowMinutes: number): Promise<MetricsTimeseries> {
    const end = new Date();
    const start = new Date(end.getTime() - windowMinutes * 60_000);
    const stepSeconds = 3;
    const range = (query: string) => this.fetch("/api/v1/query_range", new URLSearchParams({
      query, start: String(start.getTime() / 1_000), end: String(end.getTime() / 1_000), step: String(stepSeconds),
    }));
    const entries = await Promise.all(Object.entries(metricQueries).map(async ([rawKey, query]) => {
      const key = rawKey as MetricKey;
      try {
        const result = await range(query);
        const points = (result[0]?.values ?? []).flatMap(([timestamp, raw]) => {
          const value = normalizeValue(key, raw);
          return value === null ? [] : [{ timestamp: timestamp * 1_000, value }];
        });
        return [key, points] as const;
      } catch {
        return [key, []] as const;
      }
    }));

    const series = Object.fromEntries(entries) as Record<MetricKey, MetricPoint[]>;
    const podEntries = await Promise.all(Object.entries(podQueries).map(async ([key, query]) => {
      try {
        const results = await range(query);
        return [key, results.flatMap((result) => {
          const pod = result.metric?.pod ?? result.metric?.api_instance;
          if (!pod) return [];
          const points = (result.values ?? []).flatMap(([timestamp, raw]) => {
            const value = Number(raw);
            return Number.isFinite(value) ? [{ timestamp: timestamp * 1_000, value }] : [];
          });
          return [{ pod, points }];
        }).sort((a, b) => a.pod.localeCompare(b.pod))] as const;
      } catch { return [key, []] as const; }
    }));
    const unavailable = entries.filter(([, points]) => points.length === 0).map(([key]) => key);
    return {
      generatedAt: new Date().toISOString(),
      start: start.toISOString(),
      end: end.toISOString(),
      stepSeconds,
      series,
      perPod: Object.fromEntries(podEntries) as MetricsTimeseries["perPod"],
      unavailable,
    };
  }
}
