import { runProductRead, standardThresholds, summaryTrendStats } from "./lib/product-read.js";

const baseUrl = __ENV.BASE_URL || "http://nginx:80";

export const options = {
  discardResponseBodies: true,
  summaryTrendStats,
  scenarios: {
    staticCapacity: {
      executor: "constant-arrival-rate",
      rate: Number(__ENV.TARGET_RPS || 1000),
      timeUnit: "1s",
      duration: __ENV.DURATION || "2m",
      preAllocatedVUs: Number(__ENV.PRE_VUS || 500),
      maxVUs: Number(__ENV.MAX_VUS || 3000),
    },
  },
  thresholds: standardThresholds,
};

export default function () {
  runProductRead(baseUrl);
}
