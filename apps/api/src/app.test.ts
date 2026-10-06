import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, beforeEach, describe, it } from "node:test";
import { Pool } from "pg";
import request from "supertest";
import type { Express } from "express";
import { rateLimit } from "express-rate-limit";
import { createApp } from "./app.js";
import type { CacheStore } from "./cache/cache-store.js";
import { env } from "./config/env.js";
import { migrateDatabase } from "./db/migration-runner.js";
import type { RateLimiters } from "./rate-limit/rate-limiter.js";

const testInstanceId = "api-test-1";
const schema = `test_${randomUUID().replaceAll("-", "")}`;
const adminPool = new Pool({ connectionString: env.databaseUrl });
let testPool: Pool;
let application: Express;

class TestCache implements CacheStore {
  readonly enabled = true;
  readonly values = new Map<string, unknown>();

  isReady() { return true; }
  async get<T>(key: string) { return (this.values.get(key) as T | undefined) ?? null; }
  async set<T>(key: string, value: T) { this.values.set(key, value); }
  async delete(keys: string[]) { keys.forEach((key) => this.values.delete(key)); }
  async ping() { return undefined; }
}

const testCache = new TestCache();

function testRateLimiters(apiLimit: number, orderLimit: number): RateLimiters {
  const policy = (limit: number, windowMs: number, name: string) => rateLimit({
    windowMs,
    limit,
    identifier: name,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    handler: (_request, response) => {
      response.setHeader("retry-after", String(Math.ceil(windowMs / 1_000)));
      response.status(429).json({
        error: "Too many requests",
        retryAfterSeconds: Math.ceil(windowMs / 1_000),
      });
    },
  });

  return {
    enabled: true,
    api: policy(apiLimit, 1_000, "api"),
    orders: policy(orderLimit, 10_000, "orders"),
    isReady: () => true,
    ping: async () => "PONG",
  };
}

describe("ScaleLab API", () => {
  before(async () => {
    await adminPool.query(`CREATE SCHEMA ${schema}`);
    testPool = new Pool({
      connectionString: env.databaseUrl,
      options: `-c search_path=${schema}`,
    });
    await migrateDatabase(testPool);
    application = createApp({ database: testPool, instanceId: testInstanceId, cache: testCache });
  });

  beforeEach(async () => {
    testCache.values.clear();
    await testPool.query("TRUNCATE TABLE orders");
    await testPool.query(`
      UPDATE products
      SET stock = CASE id
        WHEN 1 THEN 25
        WHEN 2 THEN 40
        WHEN 3 THEN 12
      END
    `);
  });

  after(async () => {
    await testPool?.end();
    await adminPool.query(`DROP SCHEMA ${schema} CASCADE`);
    await adminPool.end();
  });

  it("returns seeded products", async () => {
    const response = await request(application).get("/api/products");
    assert.equal(response.status, 200);
    assert.equal(response.body.data.length, 3);
    assert.equal(response.body.data[0].name, "ScaleLab Mechanical Keyboard");
  });

  it("returns a product by ID", async () => {
    const response = await request(application).get("/api/products/1");
    assert.equal(response.status, 200);
    assert.equal(response.body.data.id, 1);
    assert.equal(response.body.data.stock, 25);
  });

  it("creates an order and safely reduces stock", async () => {
    await request(application).get("/api/products/1");
    assert.equal(testCache.values.has("product:1"), true);

    const response = await request(application).post("/api/orders").send({
      userId: "user-123",
      productId: 1,
      quantity: 2,
    });
    assert.equal(response.status, 201);
    assert.equal(response.body.data.status, "confirmed");
    assert.equal(response.body.data.totalPrice, 159.98);
    assert.equal(testCache.values.has("product:1"), false);
    assert.equal(testCache.values.has("products:list"), false);

    const product = await request(application).get("/api/products/1");
    assert.equal(product.body.data.stock, 23);
  });

  it("returns a persisted order", async () => {
    const created = await request(application).post("/api/orders").send({
      userId: "user-456",
      productId: 2,
      quantity: 1,
    });
    const response = await request(application).get(`/api/orders/${created.body.data.id}`);
    assert.equal(response.status, 200);
    assert.equal(response.body.data.userId, "user-456");
    assert.equal(response.body.data.productId, 2);
  });

  it("rejects an order when stock is insufficient", async () => {
    const response = await request(application).post("/api/orders").send({
      userId: "user-789",
      productId: 3,
      quantity: 13,
    });
    assert.equal(response.status, 409);
    assert.equal(response.body.error, "Insufficient stock");
    assert.equal(response.body.details.availableStock, 12);
  });

  it("rejects invalid order input", async () => {
    const response = await request(application).post("/api/orders").send({
      userId: "",
      productId: 1,
      quantity: 0,
    });
    assert.equal(response.status, 400);
    assert.equal(response.body.error, "Invalid order");
  });

  it("reports API, database and instance health", async () => {
    const response = await request(application).get("/health");
    assert.equal(response.status, 200);
    assert.equal(response.body.status, "ok");
    assert.equal(response.body.database, "healthy");
    assert.equal(response.body.redis, "healthy");
    assert.equal(response.body.instanceId, testInstanceId);
    assert.equal(response.headers["x-instance-id"], testInstanceId);
  });

  it("exposes Kubernetes liveness and readiness", async () => {
    const live = await request(application).get("/live");
    assert.equal(live.status, 200);
    assert.equal(live.body.status, "alive");
    assert.equal(live.body.instanceId, testInstanceId);

    const ready = await request(application).get("/ready");
    assert.equal(ready.status, 200);
    assert.equal(ready.body.status, "ready");
    assert.equal(ready.body.instanceId, testInstanceId);
  });

  it("serves repeated product reads from the cache", async () => {
    const first = await request(application).get("/api/products/1");
    assert.equal(first.body.data.stock, 25);

    await testPool.query("UPDATE products SET stock = 7 WHERE id = 1");
    const second = await request(application).get("/api/products/1");
    assert.equal(second.body.data.stock, 25);
  });

  it("generates a request ID when the caller does not provide one", async () => {
    const response = await request(application).get("/api/products");
    assert.match(response.headers["x-request-id"], /^req-[0-9a-f-]{36}$/);
  });

  it("reuses a valid caller request ID", async () => {
    const response = await request(application).get("/api/products").set("x-request-id", "client-request-123");
    assert.equal(response.headers["x-request-id"], "client-request-123");
  });

  it("enforces an API quota without limiting health and metrics", async () => {
    const limitedApp = createApp({
      database: testPool,
      instanceId: testInstanceId,
      cache: testCache,
      rateLimiters: testRateLimiters(2, 1),
    });

    assert.equal((await request(limitedApp).get("/health")).status, 200);
    assert.equal((await request(limitedApp).get("/metrics")).status, 200);
    assert.equal((await request(limitedApp).get("/api/products/1")).status, 200);
    assert.equal((await request(limitedApp).get("/api/products/1")).status, 200);

    const rejected = await request(limitedApp).get("/api/products/1");
    assert.equal(rejected.status, 429);
    assert.equal(rejected.body.error, "Too many requests");
    assert.match(rejected.headers["x-request-id"], /^req-[0-9a-f-]{36}$/);
    assert.equal(rejected.headers["x-instance-id"], testInstanceId);
    assert.ok(rejected.headers.ratelimit);
    assert.ok(rejected.headers["ratelimit-policy"]);
    assert.equal(rejected.headers["retry-after"], "1");
  });

  it("applies a stricter policy to order creation", async () => {
    const limitedApp = createApp({
      database: testPool,
      instanceId: testInstanceId,
      cache: testCache,
      rateLimiters: testRateLimiters(10, 1),
    });
    const order = { userId: "rate-limit-user", productId: 1, quantity: 1 };

    assert.equal((await request(limitedApp).post("/api/orders").send(order)).status, 201);
    const rejected = await request(limitedApp).post("/api/orders").send(order);
    assert.equal(rejected.status, 429);
    assert.equal(rejected.body.retryAfterSeconds, 10);
  });

  it("exposes Prometheus HTTP, process and PostgreSQL pool metrics", async () => {
    await request(application).get("/api/products/1");
    const response = await request(application).get("/metrics");

    assert.equal(response.status, 200);
    assert.match(response.headers["content-type"], /text\/plain/);
    assert.match(response.text, /scalelab_http_requests_total/);
    assert.match(response.text, /scalelab_http_request_duration_seconds_bucket/);
    assert.match(response.text, /scalelab_http_requests_active/);
    assert.match(response.text, /route="\/api\/products\/:id"/);
    assert.match(response.text, /scalelab_node_process_resident_memory_bytes/);
    assert.match(response.text, /scalelab_pg_pool_connections_total/);
    assert.match(response.text, /scalelab_pg_pool_connections_idle/);
    assert.match(response.text, /scalelab_pg_pool_waiting_requests/);
    assert.match(response.text, /scalelab_pg_pool_acquire_duration_seconds_bucket/);
    assert.match(response.text, /scalelab_pg_query_duration_seconds_bucket/);
    assert.match(response.text, /operation="product.get"/);
    assert.match(response.text, /scalelab_pg_pool_acquire_timeouts_total/);
    assert.match(response.text, /scalelab_pg_query_errors_total/);
    assert.match(response.text, /scalelab_http_request_aborts_total/);
    assert.match(response.text, /scalelab_cache_operations_total/);
    assert.match(response.text, /scalelab_cache_operation_duration_seconds_bucket/);
    assert.match(response.text, /scalelab_redis_connected/);
    assert.match(response.text, /scalelab_rate_limit_decisions_total/);
    assert.match(response.text, /scalelab_rate_limit_store_duration_seconds/);
    assert.match(response.text, /scalelab_rate_limit_redis_connected/);
    assert.match(response.text, /instance_id="api-test-1"/);
    assert.doesNotMatch(response.text, /requestId|userId/);
  });
});
