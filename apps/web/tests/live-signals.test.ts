import assert from "node:assert/strict";
import { it } from "node:test";
import type { MetricsSummary, MetricsTimeseries, RunState } from "../src/lab-types.ts";
import { clusterSignal, latestRunEvent, metricTrend, observedCommentary } from "../src/lib/live-signals.ts";

const now = Date.parse("2026-11-01T12:00:00Z");
const timestamp = new Date(now).toISOString();
const summary: MetricsSummary = { generatedAt: timestamp, metrics: { apiPodCount: 2, apiCpuPercent: 60 } as MetricsSummary["metrics"], unavailable: [] };
const history = (series: Partial<MetricsTimeseries["series"]>) => ({ series } as MetricsTimeseries);

it("compares with a real 30-second sample and handles zero baselines honestly", () => {
  const points = [{ timestamp: now - 30000, value: 100 }];
  assert.deepEqual(metricTrend(150, points, timestamp, false), { direction: "up", label: "50%" });
  assert.deepEqual(metricTrend(50, points, timestamp, false), { direction: "down", label: "50%" });
  assert.deepEqual(metricTrend(1, [{ timestamp: now - 30000, value: 0 }], timestamp, false), { direction: "up", label: "From 0" });
  assert.deepEqual(metricTrend(0, [{ timestamp: now - 30000, value: 0 }], timestamp, false), { direction: "flat", label: "0%" });
  assert.equal(metricTrend(150, points, timestamp, true), null);
  assert.equal(metricTrend(150, [], timestamp, false), null);
  assert.equal(metricTrend(150, [{ timestamp: now - 60000, value: 100 }], timestamp, false), null);
});

it("requires a fresh Ready-pod signal before showing the reporting indicator", () => {
  assert.equal(clusterSignal(null, null, now), "connecting");
  assert.equal(clusterSignal(summary, null, now), "reporting");
  assert.equal(clusterSignal(summary, "Unavailable", now), "delayed");
  assert.equal(clusterSignal(summary, null, now + 60000), "delayed");
  assert.equal(clusterSignal({ ...summary, metrics: { ...summary.metrics, apiPodCount: null } }, null, now), "delayed");
});

it("reports measured CPU crossings and Ready-count increases without inventing a scale event", () => {
  const cpu = [{ timestamp: now - 6000, value: 65 }, { timestamp: now - 3000, value: 75 }];
  assert.match(observedCommentary(summary, history({ apiCpuPercent: cpu }), false).message, /CPU crossed/);
  const pods = [{ timestamp: now - 4000, value: 2 }, { timestamp: now - 1000, value: 3 }];
  assert.match(observedCommentary(summary, history({ apiPodCount: pods, apiCpuPercent: cpu }), false).message, /2 → 3/);
  const gap = [{ timestamp: now - 60000, value: 2 }, { timestamp: now - 1000, value: 3 }];
  assert.doesNotMatch(observedCommentary(summary, history({ apiPodCount: gap }), false).message, /rose/);
  assert.match(observedCommentary(summary, history({ apiPodCount: pods }), true).message, /delayed/);
  assert.match(observedCommentary(null, null, false).message, /No live observations/);
});

it("uses the last recorded event when several lifecycle events share a timestamp", () => {
  const run = { events: [{ timestamp, message: "Restoring autoscaling" }, { timestamp, message: "Test stopped" }] } as RunState;
  assert.equal(latestRunEvent(run)?.message, "Test stopped");
});
