import http from "k6/http";
import { check } from "k6";
import { Counter } from "k6/metrics";

const baseUrl = __ENV.BASE_URL || "http://nginx:80";

const networkErrors = new Counter("scalelab_network_errors");
const requestTimeouts = new Counter("scalelab_request_timeouts");
const http5xx = new Counter("scalelab_http_5xx");

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

	if (response.status >= 500) {
		http5xx.add(1);
	}

	if (response.status === 0) {
		const error = String(response.error || "").toLowerCase();

		if (error.includes("timeout")) {
			requestTimeouts.add(1);
		} else {
			networkErrors.add(1);
		}
	}

	check(response, {
		"product detail succeeds": (result) => result.status === 200,
	});
}
