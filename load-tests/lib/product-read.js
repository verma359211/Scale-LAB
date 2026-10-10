import http from "k6/http";
import { check } from "k6";
import { Counter } from "k6/metrics";

const networkErrors = new Counter("scalelab_network_errors");
const requestTimeouts = new Counter("scalelab_request_timeouts");
const http5xx = new Counter("scalelab_http_5xx");

export const summaryTrendStats = ["avg", "min", "med", "max", "p(90)", "p(95)", "p(99)"];

export const standardThresholds = {
  checks: ["rate>0.99"],
  http_req_failed: ["rate<0.01"],
};

export function runProductRead(baseUrl) {
  const productId = ((__VU + __ITER) % 3) + 1;
  const response = http.get(`${baseUrl}/api/products/${productId}`, {
    tags: { endpoint: "product-detail" },
  });

  if (response.status >= 500) {
    http5xx.add(1);
  }

  if (response.status === 0) {
    const error = String(response.error || "").toLowerCase();
    const timedOut = error.includes("timeout")
      || error.includes("timed out")
      || error.includes("deadline exceeded");

    if (timedOut) {
      requestTimeouts.add(1);
    } else {
      networkErrors.add(1);
    }
  }

  check(response, {
    "product detail succeeds": (result) => result.status === 200,
  });
}
