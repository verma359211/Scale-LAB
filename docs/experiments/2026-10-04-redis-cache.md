# Redis cache experiment

## Purpose

The pre-cache capacity experiment found a healthy tested point at 1,900 RPS, degradation near 2,000 RPS, and overload at 2,200 RPS. PostgreSQL query p95 remained comparatively stable while pool waiters and pool-acquisition latency increased. This experiment will measure whether removing repeated product-read queries moves that knee.

## Architecture

```text
k6 -> Nginx -> three API instances -> Redis
                                      | miss
                                      v
                                  PostgreSQL
```

## Cache behavior

- `GET /api/products/:id` uses `product:{id}`.
- `GET /api/products` uses `products:list`.
- Both entry types expire after 30 seconds.
- Cache misses read PostgreSQL and populate Redis.
- Orders always validate and update stock in PostgreSQL.
- After commit, an order deletes the affected product key and list key.
- Redis errors fall back to PostgreSQL.

## Metrics

- Redis connection status for each API instance
- Cache hits, misses, writes, invalidations, and errors
- Cache hit ratio
- Redis command latency
- Existing HTTP, Node, PostgreSQL pool, query, Nginx, and scrape metrics

## Comparison to run

Use the unchanged capacity workload and compare 1,900, 2,000, and 2,200 RPS against the pre-cache results. Record achieved RPS, failures, dropped iterations, latency, API CPU, Redis hit ratio/latency, PostgreSQL pool waiters/acquisition latency, query rate/latency, and Nginx upstream failures. Do not claim an improvement until measured results are recorded.

## Current results

Functional smoke validation at 100 RPS completed 1,001/1,001 reads without errors at approximately 2.62 ms average latency. Cache metrics showed hits dominating after initial population, all three API connections reported ready, and a controlled Redis outage fell back to PostgreSQL successfully. This is not a post-cache capacity result; the controlled 1,900/2,000/2,200-RPS comparison has not been run yet.
