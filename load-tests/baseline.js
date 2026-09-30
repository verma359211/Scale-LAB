import http from "k6/http";
import { check, sleep } from "k6";

const baseUrl = __ENV.BASE_URL || "http://localhost:3001";

export const options = {
  discardResponseBodies: true,
  summaryTrendStats: ["avg", "min", "med", "max", "p(90)", "p(95)", "p(99)"],
  scenarios: {
    baseline: {
      executor: "constant-vus",
      vus: Number(__ENV.BASELINE_VUS || 3),
      duration: __ENV.BASELINE_DURATION || "20s",
    },
  },
  thresholds: {
    checks: ["rate>0.99"],
    http_req_failed: ["rate<0.01"],
  },
};

export default function () {
  const listResponse = http.get(`${baseUrl}/api/products`, { tags: { endpoint: "products-list" } });
  check(listResponse, { "product list succeeds": (response) => response.status === 200 });

  const productId = (__VU + __ITER) % 3 + 1;
  const productResponse = http.get(`${baseUrl}/api/products/${productId}`, { tags: { endpoint: "product-detail" } });
  check(productResponse, { "product detail succeeds": (response) => response.status === 200 });
  sleep(0.5);
}
