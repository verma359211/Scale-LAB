import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { metricQueries, podQueries, PrometheusClient } from "./prometheus.js";

describe("dashboard Prometheus queries", () => {
  it("scopes ingress traffic to the public ScaleLab API ingress", () => {
    assert.match(metricQueries.ingressRps, /namespace=\"scalelab\"/);
    assert.match(metricQueries.ingressRps, /ingress=\"scalelab-api\"/);
    assert.match(metricQueries.ingressRps, /service=\"scalelab-api\"/);
  });

  it("does not manufacture ratios when their denominator is zero", () => {
    assert.doesNotMatch(metricQueries.redisHitRatio, /clamp_min/);
    assert.match(metricQueries.redisHitRatio, /> 0$/);
    assert.doesNotMatch(metricQueries.httpErrorRate, /clamp_min/);
    assert.match(metricQueries.httpErrorRate, /> 0$/);
  });

  it("preserves unavailable instant query results as null", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => new Response(JSON.stringify({
      status: "success",
      data: { result: [] },
    }), { status: 200, headers: { "content-type": "application/json" } });

    try {
      const summary = await new PrometheusClient("http://prometheus", 1_000).summary();
      assert.equal(summary.metrics.redisHitRatio, null);
      assert.equal(summary.metrics.ingressRps, null);
      assert.equal(summary.unavailable.length, Object.keys(metricQueries).length);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("queries real 5/10 minute windows and retains every labelled pod and sample gap", async () => {
    const originalFetch = globalThis.fetch;
    const urls: URL[] = [];
    globalThis.fetch = async (url) => {
      const parsed = new URL(String(url)); urls.push(parsed);
      const perPod = Object.values(podQueries).includes(parsed.searchParams.get("query") as never);
      return new Response(JSON.stringify({ status: "success", data: { result: perPod ? [
        { metric: { pod: "scalelab-api-old" }, values: [[1, "10"], [2, "NaN"], [50, "20"]] },
        { metric: { api_instance: "scalelab-api-new" }, values: [[50, "5"]] },
      ] : [] } }));
    };
    try {
      const client = new PrometheusClient("http://prometheus", 1_000);
      for (const minutes of [5, 10]) {
        const result = await client.timeseries(minutes);
        assert.equal(Date.parse(result.end) - Date.parse(result.start), minutes * 60_000);
        assert.equal(result.perPod.cpuPercent.length, 2);
        assert.equal(result.perPod.requestRps[1]?.points.length, 2);
      }
      for (const url of urls) {
        assert.equal(url.pathname, "/api/v1/query_range");
        assert.equal(url.searchParams.get("step"), "3");
      }
      assert.match(podQueries.cpuPercent, /kube_pod_container_resource_requests/);
      assert.match(podQueries.requestRps, /api_instance/);
      await assert.rejects(client.timeseries(15));
    } finally { globalThis.fetch = originalFetch; }
  });
});
