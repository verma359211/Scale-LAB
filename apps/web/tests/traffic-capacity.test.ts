import assert from "node:assert/strict";
import { it } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { TrafficCapacityChart } from "../src/components/TrafficCapacityChart.tsx";
import { TimeSeriesChart } from "../src/components/TimeSeriesChart.tsx";
import type { MetricsTimeseries } from "../src/lab-types.ts";

it("shows a loading status instead of empty-sample copy while a new range is pending", () => {
  const hero = renderToStaticMarkup(createElement(TrafficCapacityChart, { data: null, loading: true }));
  const chart = renderToStaticMarkup(createElement(TimeSeriesChart, { title: "CPU", description: "Test chart", series: [], formatValue: String, loading: true }));
  for (const html of [hero, chart]) {
    assert.match(html, /role="status" aria-label="Loading metric history"/);
    assert.doesNotMatch(html, /No metric samples yet|Waiting for live metric samples/);
  }
});

it("shows an honest empty state without generating illustrative chart data", () => {
  const html = renderToStaticMarkup(createElement(TrafficCapacityChart, { data: null }));
  assert.match(html, /Waiting for live metric samples/);
  assert.doesNotMatch(html, /<polyline/);
});

it("uses independent traffic and server axes and preserves scrape gaps", () => {
  const data = {
    start: new Date(0).toISOString(), end: new Date(60000).toISOString(),
    series: {
      ingressRps: [{ timestamp: 0, value: 1000 }, { timestamp: 3000, value: 2000 }, { timestamp: 40000, value: 500 }],
      apiPodCount: [{ timestamp: 0, value: 2 }, { timestamp: 3000, value: 3 }],
    },
  } as MetricsTimeseries;
  const html = renderToStaticMarkup(createElement(TrafficCapacityChart, { data }));
  assert.match(html, /REQ \/ SEC/);
  assert.match(html, /READY SERVERS/);
  assert.match(html, /Latest traffic 500.0/);
  assert.match(html, /Latest Ready servers 3/);
  assert.equal((html.match(/class="traffic-line"/g) ?? []).length, 2);
  assert.equal((html.match(/class="server-line"/g) ?? []).length, 1);
});

it("keeps measured zero traffic visible instead of treating it as missing", () => {
  const data = { start: new Date(0).toISOString(), end: new Date(3000).toISOString(), series: {
    ingressRps: [{ timestamp: 0, value: 0 }, { timestamp: 3000, value: 0 }], apiPodCount: [],
  } } as unknown as MetricsTimeseries;
  const html = renderToStaticMarkup(createElement(TrafficCapacityChart, { data }));
  assert.match(html, /Latest traffic 0.0/);
  assert.match(html, /Server count unavailable/);
  assert.match(html, /class="traffic-line"/);
});
