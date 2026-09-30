import http from "k6/http";
import { check } from "k6";

const baseUrl = __ENV.BASE_URL || "http://localhost:3001";

export const options = {
  discardResponseBodies: true,
  summaryTrendStats: ["avg", "min", "med", "max", "p(90)", "p(95)", "p(99)"],
  scenarios: {
    ramp: {
      executor: "ramping-arrival-rate",
      startRate: Number(__ENV.RAMP_START_RPS || 50),
      timeUnit: "1s",
      preAllocatedVUs: Number(__ENV.RAMP_PREALLOCATED_VUS || 100),
      maxVUs: Number(__ENV.RAMP_MAX_VUS || 1000),
      stages: [
        { duration: __ENV.RAMP_STAGE_DURATION || "20s", target: Number(__ENV.RAMP_LEVEL_1 || 100) },
        { duration: __ENV.RAMP_STAGE_DURATION || "20s", target: Number(__ENV.RAMP_LEVEL_2 || 250) },
        { duration: __ENV.RAMP_STAGE_DURATION || "20s", target: Number(__ENV.RAMP_LEVEL_3 || 500) },
        { duration: __ENV.RAMP_STAGE_DURATION || "20s", target: Number(__ENV.RAMP_LEVEL_4 || 1000) },
        { duration: __ENV.RAMP_STAGE_DURATION || "20s", target: Number(__ENV.RAMP_LEVEL_5 || 2000) },
        { duration: __ENV.RAMP_RECOVERY_DURATION || "20s", target: Number(__ENV.RAMP_RECOVERY_RPS || 50) },
      ],
    },
  },
  thresholds: {
    checks: ["rate>0.99"],
    http_req_failed: ["rate<0.01"],
    http_req_duration: ["p(95)<250", "p(99)<500"],
    dropped_iterations: ["count==0"],
  },
};

export default function () {
  const productId = (__VU + __ITER) % 3 + 1;
  const response = http.get(`${baseUrl}/api/products/${productId}`, {
    timeout: "2s",
    tags: { endpoint: "product-detail" },
  });
  check(response, { "product detail succeeds": (result) => result.status === 200 });
}
