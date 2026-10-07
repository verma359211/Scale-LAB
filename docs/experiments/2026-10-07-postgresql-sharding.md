# PostgreSQL sharding foundation

## Summary

ScaleLab now stores products and their orders across two independent PostgreSQL databases. This is an architecture verification, not a performance result. No sharded load-test numbers have been recorded yet.

## Setup

- Date: 2026-10-07
- API: Kubernetes Deployment with HPA
- Database shards: 2
- Shard key: `productId`
- Routing rule: `productId % 2`
- Redis: ON
- Rate limiter: OFF in the current Kubernetes benchmark configuration so it does not hide database capacity
- Queue: OFF
- Inventory buckets: OFF

## Request behavior

- `GET /api/products/:id`: routed directly to the owning shard.
- `POST /api/orders`: routed directly to the product's shard. The product stock update and order insert remain in one local transaction.
- `GET /api/products`: queried on both shards and merged by the API.
- `GET /api/orders/:id`: queried on both shards because the order UUID does not currently identify its shard.

## Verification performed

- Both PostgreSQL StatefulSets became ready.
- `/health` reported two healthy database shards.
- Seed products were split between the two databases.
- An order for an odd product ID was stored only on shard 1.
- An order for an even product ID was stored only on shard 0.
- Product stock and test orders were reset after the smoke test.
- Both PostgreSQL exporters were scraped by Prometheus.
- API pool metrics exposed a bounded `shard` label.
- API tests, typecheck, and production build passed.

## Initial 200 RPS comparison

Both tests used the same Kubernetes deployment and ran for four minutes at a target of 200 order requests per second.

| Workload | Completed RPS | Requests | Dropped | Errors | Average | Median | p95 | p99 | Max VUs |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| One hot product | 193.19 | 47,095 | 906 | 24.96% | 3.33 s | 4.13 s | 5.38 s | 5.84 s | 1,019 |
| 100 distributed products | 192.67 | 46,996 | 984 | 1.30% | 182.31 ms | 6.35 ms | 152.76 ms | 5.43 s | 671 |

The hot-product run concentrated work on shard 1. Shard 1 averaged about 799 millicores and peaked at 983 millicores, while shard 0 averaged about 64 millicores. Pool waiters on shard 1 peaked between 429 and 566 per API pod; shard 0 stayed at zero.

The distributed run used both databases. Shard 0 averaged about 176 millicores and shard 1 about 166 millicores. Their measured peaks were 377 and 272 millicores respectively. Most requests were fast, but a short tail event near the end produced 614 HTTP 500 responses and raised p99 above five seconds.

API logs identify the distributed-run failures as PostgreSQL pool acquisition timeouts. Both shard pools temporarily had no idle clients and pool waiters peaked around 61–73 per shard per API pod. During the same interval, readiness checks timed out for API pods, PostgreSQL, both PostgreSQL exporters, and the web pod. This broad failure pattern, plus missing exporter scrapes, indicates a short local Docker Desktop/Kubernetes node stall contaminated the tail of the distributed result. It was not a sustained CPU limit on either database shard.

The raw k6 summaries are stored as:

- `results/kubernetes-write-hot-200rps-20261007-153938.json`
- `results/kubernetes-write-distributed-200rps-20261007-154411.json`

The benchmark orders were deleted and all 100 benchmark products were restored to 10,000,000 stock after the comparison.

## Important limitation

Product-level sharding distributes traffic for different products, but it does not make one hot product row faster. Every write for product `10001`, for example, still reaches one row on one shard and contends on the same row lock.

Changing the shard count is not an environment-only operation. Existing rows must be deliberately copied and rebalanced; the startup migrations do not automatically reshard existing data.
