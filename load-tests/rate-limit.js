import http from "k6/http";
import { check } from "k6";
import { Rate } from "k6/metrics";

const baseUrl = __ENV.BASE_URL || "http://nginx:80";
const allowed = new Rate("rate_limit_allowed");
const rejected = new Rate("rate_limit_rejected");
const unexpected = new Rate("rate_limit_unexpected");

export const options = {
  discardResponseBodies: true,
  scenarios: {
    rateLimit: {
      executor: "constant-arrival-rate",
      rate: Number(__ENV.TARGET_RPS || 1000),
      timeUnit: "1s",
      duration: __ENV.DURATION || "30s",
      preAllocatedVUs: Number(__ENV.PRE_VUS || 500),
      maxVUs: Number(__ENV.MAX_VUS || 2000),
    },
  },
  thresholds: {
    checks: ["rate==1"],
    rate_limit_allowed: ["rate>0"],
    rate_limit_rejected: ["rate>0.25"],
    rate_limit_unexpected: ["rate==0"],
  },
};

export default function () {
  const productId = ((__VU + __ITER) % 3) + 1;
  const response = http.get(`${baseUrl}/api/products/${productId}`, {
    responseCallback: http.expectedStatuses(200, 429),
    tags: { endpoint: "rate-limit-product-detail" },
  });

  allowed.add(response.status === 200);
  rejected.add(response.status === 429);
  unexpected.add(response.status !== 200 && response.status !== 429);

  check(response, {
    "request is allowed or intentionally limited": (result) => result.status === 200 || result.status === 429,
    "rate-limit header is present": (result) => Boolean(result.headers.Ratelimit),
  });
}
