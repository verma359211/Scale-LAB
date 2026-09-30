import http from "k6/http";
import { check } from "k6";

const baseUrl = __ENV.BASE_URL || "http://localhost:3001";

export const options = {
  discardResponseBodies: true,
  summaryTrendStats: ["avg", "min", "med", "max", "p(90)", "p(95)", "p(99)"],
  scenarios: {
    spike: {
      executor: "ramping-arrival-rate",
      startRate: Number(__ENV.SPIKE_NORMAL_RPS || 50),
      timeUnit: "1s",
      preAllocatedVUs: Number(__ENV.SPIKE_PREALLOCATED_VUS || 200),
      maxVUs: Number(__ENV.SPIKE_MAX_VUS || 1500),
      stages: [
        { duration: __ENV.SPIKE_WARMUP_DURATION || "15s", target: Number(__ENV.SPIKE_NORMAL_RPS || 50) },
        { duration: __ENV.SPIKE_RAMP_DURATION || "3s", target: Number(__ENV.SPIKE_PEAK_RPS || 2000) },
        { duration: __ENV.SPIKE_PEAK_DURATION || "20s", target: Number(__ENV.SPIKE_PEAK_RPS || 2000) },
        { duration: __ENV.SPIKE_RECOVERY_DURATION || "5s", target: Number(__ENV.SPIKE_NORMAL_RPS || 50) },
        { duration: __ENV.SPIKE_COOLDOWN_DURATION || "15s", target: Number(__ENV.SPIKE_NORMAL_RPS || 50) },
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
  const response = http.get(`${baseUrl}/api/products`, {
    timeout: "2s",
    tags: { endpoint: "products-list" },
  });
  check(response, { "product list succeeds": (result) => result.status === 200 });
}
