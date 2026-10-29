import http from "k6/http";
import { check } from "k6";
import { Counter, Trend } from "k6/metrics";
import {
  recordResponseDiagnostics,
  standardThresholds,
  summaryTrendStats,
} from "./lib/product-read.js";

const baseUrl = __ENV.BASE_URL || "http://nginx:80";
const readPercent = Number(__ENV.READ_PERCENT ?? 70);
const writePercent = Number(__ENV.WRITE_PERCENT ?? 30);

function validatePercentages() {
  const percentages = [readPercent, writePercent];
  const validRange = percentages.every((value) => Number.isFinite(value) && value >= 0 && value <= 100);
  const validTotal = Math.abs(readPercent + writePercent - 100) < 0.000001;

  if (!validRange || !validTotal) {
    throw new Error(
      `READ_PERCENT and WRITE_PERCENT must each be between 0 and 100 and total 100; received ${readPercent} + ${writePercent}`,
    );
  }
}

validatePercentages();

const readRequests = new Counter("scalelab_mixed_read_requests");
const writeRequests = new Counter("scalelab_mixed_write_requests");
const readLatency = new Trend("scalelab_mixed_read_latency", true);
const writeLatency = new Trend("scalelab_mixed_write_latency", true);
const successfulOrders = new Counter("scalelab_mixed_orders_successful");
const failedOrders = new Counter("scalelab_mixed_orders_failed");
const insufficientStock = new Counter("scalelab_mixed_orders_insufficient_stock");

export const options = {
  discardResponseBodies: true,
  summaryTrendStats,
  scenarios: {
    mixedLoad: {
      executor: "constant-arrival-rate",
      rate: Number(__ENV.TARGET_RPS || 100),
      timeUnit: "1s",
      duration: __ENV.DURATION || "2m",
      preAllocatedVUs: Number(__ENV.PRE_VUS || 100),
      maxVUs: Number(__ENV.MAX_VUS || 1000),
    },
  },
  thresholds: standardThresholds,
};

function runRead() {
  const productId = ((__VU + __ITER) % 3) + 1;
  const response = http.get(`${baseUrl}/api/products/${productId}`, {
    tags: { endpoint: "mixed-product-detail", operation: "read" },
  });

  readRequests.add(1);
  readLatency.add(response.timings.duration);
  recordResponseDiagnostics(response);

  check(response, {
    "mixed product read succeeds": (result) => result.status === 200,
  });
}

function runWrite() {
  const productId = 10001 + ((__VU + __ITER) % 100);
  const response = http.post(`${baseUrl}/api/orders`, JSON.stringify({
    userId: `mixed-${__VU}-${__ITER}`,
    productId,
    quantity: 1,
  }), {
    headers: { "Content-Type": "application/json" },
    responseCallback: http.expectedStatuses(201, 409),
    tags: { endpoint: "mixed-order-create", operation: "write" },
  });

  writeRequests.add(1);
  writeLatency.add(response.timings.duration);
  recordResponseDiagnostics(response);

  successfulOrders.add(response.status === 201 ? 1 : 0);
  insufficientStock.add(response.status === 409 ? 1 : 0);
  failedOrders.add(response.status !== 201 && response.status !== 409 ? 1 : 0);

  check(response, {
    "mixed order has a known outcome": (result) => result.status === 201 || result.status === 409,
  });
}

export default function () {
  if (Math.random() * 100 < readPercent) {
    runRead();
  } else {
    runWrite();
  }
}
