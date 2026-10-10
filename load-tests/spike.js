import { runProductRead, standardThresholds, summaryTrendStats } from "./lib/product-read.js";

const baseUrl = __ENV.BASE_URL || "http://nginx:80";
const baseRps = Number(__ENV.BASE_RPS || 200);
const spikeRps = Number(__ENV.SPIKE_RPS || 2000);

export const options = {
  discardResponseBodies: true,
  summaryTrendStats,
  scenarios: {
    suddenSpike: {
      executor: "ramping-arrival-rate",
      startRate: baseRps,
      timeUnit: "1s",
      preAllocatedVUs: Number(__ENV.PRE_VUS || 1000),
      maxVUs: Number(__ENV.MAX_VUS || 4000),
      stages: [
        { duration: __ENV.WARMUP_DURATION || "1m", target: baseRps },
        { duration: "1s", target: spikeRps },
        { duration: __ENV.SPIKE_DURATION || "2m", target: spikeRps },
        { duration: "1s", target: baseRps },
        { duration: __ENV.RECOVERY_DURATION || "1m", target: baseRps },
      ],
    },
  },
  thresholds: standardThresholds,
};

export default function () {
  runProductRead(baseUrl);
}
