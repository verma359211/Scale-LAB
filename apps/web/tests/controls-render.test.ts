import assert from "node:assert/strict";
import { it } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { K6ResultPanel } from "../src/components/K6ResultPanel.tsx";
import { LoadTestPanel } from "../src/components/LoadTestPanel.tsx";

it("keeps detailed output collapsed while retaining console text and visible failure messages", () => {
  const html = renderToStaticMarkup(createElement(K6ResultPanel, {
    run: null, error: "Generator unavailable", result: { runId: "1", available: false, stdout: "live output retained" },
  }));
  assert.match(html, /Detailed k6 Output/);
  assert.match(html, /live output retained/);
  assert.match(html, /Generator unavailable/);
  assert.doesNotMatch(html, /<details[^>]*\bopen/);
});

it("defaults to server-defined scenario cards with custom controls collapsed and no RPS ceiling", () => {
  const noop = async () => {};
  const html = renderToStaticMarkup(createElement(LoadTestPanel, {
    run: null, warmup: null, warmupError: null, actionPending: false, actionError: null, resetNotice: null,
    onStart: noop, onStop: noop, onReset: noop, onRestore: noop,
    configuration: { controlsEnabled: true, generator: null, presets: [{ id: "autoscaling", name: "Watch Kubernetes Autoscaling", description: "Scale API pods", observe: "Readiness", profile: "4,000 RPS", warmup: "Use normal baseline", configuration: { type: "ramp", targetRps: 4000, duration: "10m" } }] },
  }));
  assert.match(html, /Watch Kubernetes Autoscaling/);
  assert.match(html, /Advanced Options/);
  assert.match(html, /Start with warm API pods/);
  assert.doesNotMatch(html, /Warm Up API Pods/);
  assert.doesNotMatch(html, /type="checkbox"[^>]*checked/);
  assert.match(html, /aria-pressed="true"/);
  assert.doesNotMatch(html, /<details[^>]*\bopen/);
  assert.doesNotMatch(html, /Operator token/);
  const targetInput = html.match(/<input[^>]*type="number"[^>]*min="50"[^>]*>/)?.[0];
  assert.ok(targetInput);
  assert.doesNotMatch(targetInput, /max=/);
});
