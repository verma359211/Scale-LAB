import assert from "node:assert/strict";
import { it } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { TelemetryPanels } from "../src/components/TelemetryPanels.tsx";
import type { MetricsTimeseries } from "../src/lab-types.ts";

it("uses friendly pod identities consistently when chart series arrive in different orders", () => {
  const points = [{ timestamp: 0, value: 1 }, { timestamp: 3000, value: 2 }];
  const data = { start: new Date(0).toISOString(), end: new Date(3000).toISOString(), series: {}, perPod: {
    cpuPercent: [{ pod: "scalelab-api-b", points }, { pod: "scalelab-api-a", points }],
    requestRps: [{ pod: "scalelab-api-a", points }, { pod: "scalelab-api-b", points }],
  } } as unknown as MetricsTimeseries;
  const html = renderToStaticMarkup(createElement(TelemetryPanels, { data, summary: null, loading: false, windowMinutes: 5 }));
  assert.doesNotMatch(html, /scalelab-api-[ab]/);
  assert.match(html, /Pod 1/);
  assert.match(html, /Pod 2/);
  assert.equal((html.match(/<article/g) ?? []).length, 11);
});

it("retains unavailable metrics and all chart families in the integrated bento grid", () => {
  const html = renderToStaticMarkup(createElement(TelemetryPanels, { data: null, summary: null, loading: false, windowMinutes: 10 }));
  assert.match(html, /10-minute system metric history/);
  assert.match(html, /CPU by pod/);
  assert.match(html, /Database query time/);
  assert.equal((html.match(/class="bento-stat /g) ?? []).length, 14);
  assert.equal((html.match(/No metric samples yet/g) ?? []).length, 11);
  assert.match(html, /<dd>—<\/dd>/);
  assert.doesNotMatch(html, /<polyline/);
});

it("passes range-loading state to every dashboard chart", () => {
  const html = renderToStaticMarkup(createElement(TelemetryPanels, { data: null, summary: null, loading: false, historyLoading: true, windowMinutes: 10 }));
  assert.equal((html.match(/aria-label="Loading metric history"/g) ?? []).length, 11);
  assert.doesNotMatch(html, /No metric samples yet/);
});
