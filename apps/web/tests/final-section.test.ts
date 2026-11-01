import assert from "node:assert/strict";
import { it } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AboutBuilder } from "../src/components/AboutBuilder.tsx";
import { LabActivityFeed } from "../src/components/LabActivityFeed.tsx";
import type { RunState } from "../src/lab-types.ts";

it("uses the supplied personal links without embedding duplicate load-test results", () => {
  const html = renderToStaticMarkup(createElement(AboutBuilder));
  assert.match(html, /Chandan Verma/);
  for (const url of ["https://www.chandanverma.space", "https://github.com/verma359211", "https://www.linkedin.com/in/cverma7"]) assert.ok(html.includes(`href="${url}"`));
  assert.doesNotMatch(html, /Achieved RPS|Failure rate|Load Test Result/);
});

it("keeps the compact timeline newest first and retains matching raw output in a closed drawer", () => {
  const run: RunState = { id: "current", type: "static", status: "completed", configuration: { type: "static", targetRps: 200, duration: "60s" }, startedAt: "2026-11-01T00:00:00Z", endedAt: "2026-11-01T00:01:00Z", failureReason: null, events: [{ timestamp: "2026-11-01T00:00:00Z", message: "Test running" }, { timestamp: "2026-11-01T00:01:00Z", message: "Test completed", detail: "Recorded detail" }] };
  const html = renderToStaticMarkup(createElement(LabActivityFeed, { run, result: { runId: "current", available: true, stdout: "Measured output", stderr: "Diagnostic output" } }));
  assert.ok(html.indexOf("Test completed") < html.indexOf("Test running"));
  assert.match(html, /2 events/);
  assert.match(html, /Recorded detail/);
  assert.match(html, /Measured output/);
  assert.match(html, /Diagnostic output/);
  assert.doesNotMatch(html, /<details[^>]*\bopen/);
  const stale = renderToStaticMarkup(createElement(LabActivityFeed, { run, result: { runId: "older", available: true, stdout: "Stale output" } }));
  assert.doesNotMatch(stale, /Stale output/);
});

it("shows an honest empty activity state", () => {
  const html = renderToStaticMarkup(createElement(LabActivityFeed, { run: null }));
  assert.match(html, /No test events yet/);
  assert.match(html, /0 events/);
  assert.match(html, /No k6 output available/);
  assert.doesNotMatch(html, /Test completed/);
});
