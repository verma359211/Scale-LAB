import assert from "node:assert/strict";
import { it } from "node:test";
import { resolvePage } from "../src/lib/routes.ts";

it("routes the dashboard at root and legacy URL while preserving the Store", () => {
  assert.equal(resolvePage("/"), "lab");
  assert.equal(resolvePage("/scalelab"), "lab");
  assert.equal(resolvePage("/store"), "store");
  assert.equal(resolvePage("/store/"), "store");
});
