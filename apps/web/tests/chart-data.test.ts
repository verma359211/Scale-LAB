import assert from "node:assert/strict";
import { it } from "node:test";
import { podColor, splitMetricGaps } from "../src/lib/chart-data.ts";

it("breaks lines across missing scrapes and assigns stable pod colors", () => {
  const points = [{ timestamp: 0, value: 1 }, { timestamp: 3_000, value: 2 }, { timestamp: 30_000, value: 3 }];
  assert.deepEqual(splitMetricGaps(points).map((segment) => segment.length), [2, 1]);
  assert.deepEqual(splitMetricGaps([]), []);
  assert.equal(podColor("pod-1"), podColor("pod-1"));
  assert.equal(new Set(Array.from({ length: 6 }, (_, index) => podColor(`pod-${index}`, index))).size, 6);
});
