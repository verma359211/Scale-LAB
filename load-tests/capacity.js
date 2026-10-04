import http from "k6/http";
import { check } from "k6";

const baseUrl = __ENV.BASE_URL || "http://nginx:80";

export const options = {
  discardResponseBodies: true,
  summaryTrendStats: ["avg", "min", "med", "max", "p(90)", "p(95)", "p(99)"],
  scenarios: {
    capacity: {
      executor: "constant-arrival-rate",
      rate: Number(__ENV.TARGET_RPS || 1000),
      timeUnit: "1s",
      duration: __ENV.DURATION || "2m",
      preAllocatedVUs: Number(__ENV.PRE_VUS || 500),
      maxVUs: Number(__ENV.MAX_VUS || 3000),
    },
  },
  thresholds: {
    checks: ["rate>0.99"],
    http_req_failed: ["rate<0.01"],
  },
};

export default function () {
  const productId = ((__VU + __ITER) % 3) + 1;
  const response = http.get(`${baseUrl}/api/products/${productId}`, {
    tags: { endpoint: "product-detail" },
  });

  check(response, {
    "product detail succeeds": (result) => result.status === 200,
  });
}
