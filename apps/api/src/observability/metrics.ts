import type { RequestHandler } from "express";
import type { Pool } from "pg";
import {
  collectDefaultMetrics,
  Counter,
  Gauge,
  Histogram,
  Registry,
} from "prom-client";

function routeLabel(request: Parameters<RequestHandler>[0]) {
  const routePath = typeof request.route?.path === "string" ? request.route.path : undefined;
  if (!routePath) return "unmatched";

  const route = `${request.baseUrl}${routePath}`.replace(/\/$/, "");
  return route || "/";
}

export function createApiMetrics(database: Pool, instanceId: string) {
  const registry = new Registry();
  registry.setDefaultLabels({ service: "scalelab-api", instance_id: instanceId });

  collectDefaultMetrics({
    register: registry,
    prefix: "scalelab_node_",
    eventLoopMonitoringPrecision: 10,
  });

  const requestsTotal = new Counter({
    name: "scalelab_http_requests_total",
    help: "Completed ScaleLab HTTP requests.",
    labelNames: ["method", "route", "status_code"],
    registers: [registry],
  });

  const requestDuration = new Histogram({
    name: "scalelab_http_request_duration_seconds",
    help: "ScaleLab HTTP response duration in seconds.",
    labelNames: ["method", "route", "status_code"],
    buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
    registers: [registry],
  });

  const activeRequests = new Gauge({
    name: "scalelab_http_requests_active",
    help: "HTTP requests currently being processed by this API instance.",
    labelNames: ["method"],
    registers: [registry],
  });

  new Gauge({
    name: "scalelab_pg_pool_connections_total",
    help: "Total PostgreSQL clients currently managed by the pg pool.",
    registers: [registry],
    collect() {
      this.set(database.totalCount);
    },
  });

  new Gauge({
    name: "scalelab_pg_pool_connections_idle",
    help: "Idle PostgreSQL clients currently available in the pg pool.",
    registers: [registry],
    collect() {
      this.set(database.idleCount);
    },
  });

  new Gauge({
    name: "scalelab_pg_pool_waiting_requests",
    help: "Requests waiting for a PostgreSQL client from the pg pool.",
    registers: [registry],
    collect() {
      this.set(database.waitingCount);
    },
  });

  const middleware: RequestHandler = (request, response, next) => {
    // Prometheus scrapes should not inflate the application traffic baseline.
    if (request.path === "/metrics") {
      next();
      return;
    }

    const method = request.method;
    const stopTimer = requestDuration.startTimer();
    let finalized = false;
    activeRequests.labels(method).inc();

    response.once("finish", () => {
      finalized = true;
      const labels = {
        method,
        route: routeLabel(request),
        status_code: String(response.statusCode),
      };
      activeRequests.labels(method).dec();
      requestsTotal.inc(labels);
      stopTimer(labels);
    });

    response.once("close", () => {
      // A disconnected client may close without `finish`; do not leave the in-flight gauge elevated.
      if (!finalized) activeRequests.labels(method).dec();
    });

    next();
  };

  return { registry, middleware };
}

export type ApiMetrics = ReturnType<typeof createApiMetrics>;
