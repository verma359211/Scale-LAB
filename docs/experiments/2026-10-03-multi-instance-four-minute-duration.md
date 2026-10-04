# Four-minute multi-instance duration test

## Summary

Repeating 1,100 and 1,200 RPS for four minutes exposed a non-deterministic Nginx upstream failure mode. The 1,100-RPS run entered an 11-second `no live upstreams` cascade and failed 2,009 requests, while the immediately following 1,200-RPS run delivered all 288,000 requests successfully. The lower rate failing while the higher rate succeeds means this pair cannot define a deterministic RPS capacity threshold. It instead reveals sensitivity to transient container-to-host connection failures and Nginx's passive upstream-ejection policy.

## Controlled environment

- Date: 2026-10-03
- Git commit: `be2cd4044110253834d702a87786cc97493c648b`
- Working tree: dirty with the current observability and experiment work
- Node.js: v26.3.0
- Runtime: three compiled Node API processes
- API endpoints: api-1 on 3101, api-2 on 3102, api-3 on 3103
- PostgreSQL pool maximum: 20 per API, 60 aggregate potential connections
- Request path: Dockerized k6 -> Dockerized Nginx -> Windows-host Node APIs -> Dockerized PostgreSQL
- k6 executor: `constant-arrival-rate`
- Duration: four minutes per measured point
- Iteration: exactly one `GET /api/products/:id`
- Preallocated VUs: 500
- Maximum VUs: 3,000
- Prometheus scrape interval: three seconds
- Successful request/access logging: disabled

A 15-second 300-RPS warm-up and ten-second settling interval preceded 1,100 RPS. After that run, all API and Nginx health checks passed and the system settled for 20 seconds before 1,200 RPS.

## k6 results

| Target | Achieved | Requests | Dropped | HTTP failures | Avg | Median | p90 | p95 | p99 | Max | Max active VUs |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 1,100 | 1,095.41 RPS | 262,876 | 1,129 | 2,009 / 0.764% | 51.12 ms | 5.17 ms | 53.37 ms | 310.23 ms | 1,078.77 ms | 1,291.75 ms | 1,088 |
| 1,200 | 1,200.11 RPS | 288,000 | 0 | 0 / 0% | 15.84 ms | 5.79 ms | 35.40 ms | 63.38 ms | 164.84 ms | 1,103.83 ms | 249 |

The 1,100-RPS test technically remained just inside its configured thresholds (`checks > 99%`, failures below 1%), but it is not healthy: it lost requests, failed to schedule all requested arrivals, and accumulated second-scale latency. Its sudden concurrency demand caused k6 to grow from 500 preallocated VUs to 1,093 allocated VUs, with 1,088 active at the peak. Although the 3,000 ceiling was not reached, 1,129 iterations were dropped while k6 dynamically expanded during the burst.

The 1,200-RPS run was fully delivered but its four-minute average/p95/p99 latency of 15.84/63.38/164.84 ms is worse than its earlier two-minute 10.92/25.01/135.13 ms result. Duration therefore exposes more tail variability even in a successful run.

## Runtime, pool and database metrics

| Metric | 1,100 RPS, failed run | 1,200 RPS, successful run |
|---|---:|---:|
| Traffic-share steady averages | 24.54–37.78% | 31.95–35.41% |
| Node CPU steady averages | 30.97–47.17% | 44.32–49.46% |
| Node CPU maximum | 61.64% | 58.24% |
| Event-loop lag steady averages | 3.76–4.39 ms | 3.67–6.64 ms |
| Event-loop maximum | 34.20 ms | 149.85 ms |
| Active-request maximum | 833 | 105 |
| Pool-waiter steady averages | 7.59–23.20 | 0–1.83 |
| Pool-waiter maximum | 813 | 85 |
| Pool-acquisition rolling p95 averages | 118.29–243.62 ms | 1.81–9.64 ms |
| Pool-acquisition rolling p95 maximum | 1,725.07 ms | 73.68 ms |
| Query rolling p95 averages | 20.28–23.03 ms | 23.65–26.30 ms |
| Query rolling p99 averages | 44.16–45.76 ms | 47.91–58.27 ms |
| PostgreSQL container CPU avg/max | 69.16% / 159.67% | 72.75% / 119.96% |

Neither run shows sustained Node CPU saturation. PostgreSQL query execution is moderately slower at 1,200, yet the successful higher-rate run has dramatically less pool acquisition waiting. This proves that the large pool queue at 1,100 was not caused simply by its offered RPS.

## Nginx results

| Metric | 1,100 RPS | 1,200 RPS |
|---|---:|---:|
| Upstream connection timeouts | 58 | 24 |
| Temporary upstream-disable events | 35 | 11 |
| `no live upstreams` | 2,009 | 0 |
| Nginx writing connections avg/max | 61.90 / 1,065 | 22.30 / 159 |
| Nginx active connections avg/max | 916 / 1,094 | 501 / 501 |
| Nginx container CPU avg/max | 63.02% / 180.76% | 72.40% / 198.16% |

At 1,100 RPS, the 2,009 `no live upstreams` messages exactly equal k6's 2,009 failed checks. The proxy failure is therefore the direct source of every client-visible error.

At 1,200 RPS, timeout and temporary-disable events are distributed across the run and across upstreams: ten connection timeouts each to api-1 and api-2, four to api-3, with five temporary-disable events for api-1 and six for api-2. Their unavailability windows never overlap across all three servers, so Nginx always has somewhere to retry and k6 sees no failure.

## Failure timeline at 1,100 RPS

The run started at 14:47:32 UTC. Its important sequence was:

1. At 14:48:30, the first upstream connection timeout targeted api-2. CPU, pool waiting and throughput were normal.
2. Around 14:48:50, a cluster of connection timeouts targeted api-1. Before this cluster, each API completed about 366 RPS, Node CPU was 39–43%, pool waiters were zero and pool-acquisition p95 was about one millisecond.
3. Nginx temporarily disabled api-1 and redistributed its traffic to api-2 and api-3.
4. By the 14:49:01 scrape, api-1 had fallen to 216 RPS while api-3 had risen to 467 RPS. Api-3 then had 559 active requests, 539 pool waiters and 389 ms rolling pool-acquisition p95.
5. Additional timeouts and temporary-disable decisions affected the remaining upstreams.
6. From 14:48:59.248 through 14:49:10.190, all upstream unavailability windows overlapped. Nginx emitted 2,009 `no live upstreams` responses.
7. Pools and traffic recovered, although rolling histogram quantiles remained elevated until the 30-second windows cleared.

The 1,100-RPS log is strongly asymmetric:

| Upstream | Connection timeouts | Temporary-disable events |
|---|---:|---:|
| api-1 / 3101 | 42 | 28 |
| api-2 / 3102 | 9 | 4 |
| api-3 / 3103 | 7 | 3 |

This ordering matters. Pool queueing did not precede the first timeout cluster: Nginx's temporary removal of api-1 shifted enough work to api-3 to create the large pool queue. In this run, a transient upstream connection problem triggered the database/pool overload, and Nginx's passive health policy amplified it into a system-wide failure.

## Interpretation

The four-minute results are non-monotonic:

```text
1,100 RPS -> intermittent 11-second failure cascade
1,200 RPS -> full throughput, no client-visible failure
```

Therefore it would be incorrect to declare 1,100 RPS the deterministic capacity or to claim that 1,200 RPS is universally safe. The environment is noisy and failure depends on whether transient upstream connect failures become concentrated on one server enough for passive ejection windows to overlap.

The most strongly supported trigger is the Nginx-container-to-Windows-host connection path or a short Node listener/backlog event, because the initial connection timeouts occur while application CPU, event-loop and pool metrics are healthy. Once one upstream is excluded, pool pressure becomes a secondary bottleneck on the remaining processes.

This topology includes Docker Desktop networking twice: k6 reaches Nginx on the Compose network, then Nginx crosses `host.docker.internal` to reach Node processes running on Windows. These numbers are useful for this local lab but should not be treated as production Linux capacity.

## Recommended next controlled experiment

Do not increase RPS yet. Repeat 1,100 RPS at least two more times for four minutes with the exact same configuration. If only some runs fail, the primary result is variability rather than a fixed capacity boundary.

After repeatability is measured, change one variable: place the three Node processes on the same Docker network as Nginx, keeping three processes, pool sizes, queries, Nginx timeouts and offered RPS unchanged. Comparing host-run APIs against container-network APIs will directly test whether Docker Desktop's container-to-host connection path causes the timeout clusters. This is an experiment topology change, not an application optimization.

## Raw evidence

### 1,100 RPS, four minutes

- `docs/experiments/results/multi-instance/nginx-3api-1100rps-pool20-20261003-201731-manifest.json`
- `docs/experiments/results/multi-instance/nginx-3api-1100rps-pool20-20261003-201731-k6-summary.json`
- `docs/experiments/results/multi-instance/nginx-3api-1100rps-pool20-20261003-201731-prometheus.json`
- `docs/experiments/results/multi-instance/nginx-3api-1100rps-pool20-20261003-201731-docker-stats.ndjson`
- `docs/experiments/results/multi-instance/nginx-3api-1100rps-pool20-20261003-201731-nginx.log`
- `docs/experiments/results/multi-instance/nginx-3api-1100rps-pool20-20261003-201731-analysis.json`

### 1,200 RPS, four minutes

- `docs/experiments/results/multi-instance/nginx-3api-1200rps-pool20-20261003-202248-manifest.json`
- `docs/experiments/results/multi-instance/nginx-3api-1200rps-pool20-20261003-202248-k6-summary.json`
- `docs/experiments/results/multi-instance/nginx-3api-1200rps-pool20-20261003-202248-prometheus.json`
- `docs/experiments/results/multi-instance/nginx-3api-1200rps-pool20-20261003-202248-docker-stats.ndjson`
- `docs/experiments/results/multi-instance/nginx-3api-1200rps-pool20-20261003-202248-nginx.log`
- `docs/experiments/results/multi-instance/nginx-3api-1200rps-pool20-20261003-202248-analysis.json`
