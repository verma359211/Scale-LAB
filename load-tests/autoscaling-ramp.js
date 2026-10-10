import { runProductRead, standardThresholds, summaryTrendStats } from "./lib/product-read.js";

const baseUrl = __ENV.BASE_URL || "http://nginx:80";
const stageDuration = __ENV.STAGE_DURATION || "2m";
const rates = [
  Number(__ENV.RPS_1 || 500),
  Number(__ENV.RPS_2 || 800),
  Number(__ENV.RPS_3 || 1200),
  Number(__ENV.RPS_4 || 1600),
  Number(__ENV.RPS_5 || 2000),
];

const stages = rates.flatMap((rate, index) => {
  if (index === 0) {
    return [{ duration: stageDuration, target: rate }];
  }

  return [
    { duration: "1s", target: rate },
    { duration: stageDuration, target: rate },
  ];
});

export const options = {
  discardResponseBodies: true,
  summaryTrendStats,
  scenarios: {
    autoscalingRamp: {
      executor: "ramping-arrival-rate",
      startRate: rates[0],
      timeUnit: "1s",
      preAllocatedVUs: Number(__ENV.PRE_VUS || 1000),
      maxVUs: Number(__ENV.MAX_VUS || 4000),
      stages,
    },
  },
  thresholds: standardThresholds,
};

export default function () {
  runProductRead(baseUrl);
}
