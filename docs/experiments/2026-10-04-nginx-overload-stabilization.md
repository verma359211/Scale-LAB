# Nginx overload stabilization experiment

## Summary headline

`least_conn` made the three-instance topology substantially more resilient near 2,000 RPS, but it did not remove the database-pool capacity knee or prevent Nginx's passive-health cascade under severe overload.

## Question

The previous proxy configuration could turn gradual backend slowdown into an abrupt failure:

```text
database/pool pressure
-> API responses slow
-> Nginx records upstream failures
-> upstreams are temporarily disabled
-> the remaining APIs receive more work
-> all upstream exclusion windows overlap
-> Nginx returns "no live upstreams"
```

This experiment tested whether conservative passive-health/retry settings, aligned upstream keep-alive lifetimes, and load-aware balancing make that behavior more stable and understandable. It was not intended to make 2,200 RPS healthy.

## Environment

- Date: 2026-10-04
- Git commit: `be2cd4044110253834d702a87786cc97493c648b` with uncommitted working-tree changes
- Runtime: `node:26.3.0-alpine`, compiled `dist/server.js`, `NODE_ENV=production`
- Topology: k6 container -> Nginx container -> three API containers -> PostgreSQL container
- API pool maximum: 20 per instance, 60 aggregate
- Workload: one `GET /api/products/:id` per iteration
- Executor: k6 `constant-arrival-rate`, no sleep
- Duration: four minutes per measured run
- k6 allocation: 1,500 preallocated VUs, 4,000 maximum VUs
- Access logs and successful per-request API logs: disabled
- Prometheus scrape interval: three seconds

All components, including k6, shared one Docker Desktop VM on a Windows workstation. Chrome, VS Code, Codex, and other desktop processes remained open. The user had already observed that opening Postman could disturb a run. No user applications were closed or given dedicated resources, so this is a valid result for the local lab as operated, not a hardware-isolated production benchmark.

## Profiles

Profile A changed the upstream failure/retry behavior:

- round-robin balancing
- `max_fails=5`
- `fail_timeout=2s`
- two-second connect timeout
- ten-second send/read timeouts
- at most two upstream attempts within three seconds

Profile B kept profile A and aligned the connection lifetimes:

- Nginx upstream `keepalive_timeout=60s`
- Node `keepAliveTimeout=65s`
- Node `headersTimeout=70s`

Profile C kept profile B and added `least_conn`.

The profile-specific Compose files keep these settings isolated from the default topology. Explicit Node server timeout environment variables make the connection-lifetime contract observable and repeatable rather than relying on runtime defaults.

## Controlled 2,000 RPS comparison

| Profile | Achieved RPS | Failures | Dropped | Avg | p95 | p99 | Peak VUs | Upstream timeouts | Temporarily disabled | No live upstreams |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| A: failure/retry tuning | 1,817.49 | 34.31% | 39,179 | 1,786.51 ms | 4,365.67 ms | 5,022.09 ms | 4,000 | 242,688 | 242,268 | 69,674 |
| B: A + keep-alive alignment | 1,791.35 | 35.30% | 45,272 | 1,873.18 ms | 4,391.05 ms | 5,045.76 ms | 4,000 | 253,214 | 252,802 | 67,090 |
| C: B + `least_conn` | 1,991.97 | 2.63% | 1,847 | 144.71 ms | 331.86 ms | 3,243.75 ms | 2,222 | 185 | 161 | 12,478 |

Profiles A and B are rejected. Making upstream exclusion shorter and retrying slow requests did not create capacity; it multiplied proxy work, produced long timeout queues, and exhausted every available k6 VU. Keep-alive alignment did not materially change that result.

Profile C was dramatically better under the same offered load. It reduced client failures by more than an order of magnitude, avoided the 4,000-VU ceiling, and distributed work based on outstanding connections. It was still not healthy at 2,000 RPS: 2.63% of requests failed and 1,847 iterations were dropped.

## Capacity check with profile C

| Target | Achieved RPS | Failures | Dropped | Avg | p95 | p99 | Peak VUs | API CPU avg/max | Pool waiters avg/max | Pool-acquire rolling p95 | Query rolling p95 |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 1,900 | 1,894.65 | 0.00% | 0 | 59.09 ms | 167.80 ms | 701.57 ms | 1,316 | 86.7% / 96.1% | 7.9 / 97 | 69-72 ms | 42-43 ms |
| 2,000 | 1,991.97 | 2.63% | 1,847 | 144.71 ms | 331.86 ms | 3,243.75 ms | 2,222 | 92.4% / 98.4% | 16.5 / 215 | 161-170 ms | 45-46 ms |
| 2,200 | 2,121.54 | 13.51% | 10,566 | 653.89 ms | 4,001.26 ms | 6,964.94 ms | 4,000 | 86.5% / 99.3% | 34.0 / 256 | 166-238 ms | 45-47 ms |

The pool columns summarize the three API instances over the steady Prometheus window. The latency numbers from Prometheus are rolling-window series, so the displayed ranges are the per-instance averages of the rolling p95 values, not percentiles recomputed from raw request events.

At 1,900 RPS, all 456,001 requests succeeded and Prometheus observed an even 33.1-33.6% traffic share. Nginx recorded zero upstream timeouts, disables, or `no live upstreams` events. Nevertheless, each Node process averaged about 86.7% CPU, all 20 pool connections were established, and pool waiters already peaked between 78 and 97. This is the highest healthy tested point, but it has limited headroom and elevated tail latency.

At 2,000 RPS, queueing increased before query execution became materially slower. Pool-acquisition rolling p95 rose to about 161-170 ms while query rolling p95 stayed near 45-46 ms. Nginx then recorded 185 timeouts, 161 passive disables, and 12,478 `no live upstreams` responses. This is the measured capacity knee.

At 2,200 RPS, k6 reached all 4,000 VUs and still dropped 10,566 scheduled starts. Nginx active connections reached 4,001; the steady intake/completion gap averaged about 273 RPS and peaked near 796 RPS. Nginx logged 42,126 upstream timeouts, 41,938 temporary disables, and 61,688 `no live upstreams` events. PostgreSQL query rolling p95 remained around 45-47 ms, but pool waiters peaked at 165, 178, and 256 and acquisition rolling p95 reached approximately 166-238 ms. All API Prometheus targets remained available throughout, proving the API processes were overloaded but alive.

The lower average API CPU at 2,200 than at 2,000 does not indicate spare capacity. Once Nginx is queueing or immediately rejecting requests during overlapping exclusion windows, fewer requests reach and complete in Node. Docker sampling also showed the shared-host cost: k6 averaged about 212% CPU, Nginx 107%, the three API containers about 95-101%, and PostgreSQL 81% during the 2,200 run.

## Conclusion

The primary capacity mechanism remains database-client queueing combined with high per-process CPU. Query execution itself does not show the same discontinuity. Nginx passive health is a secondary amplifier: it treats overloaded timeouts as upstream failures, concentrates traffic on the survivors, and eventually creates overlapping exclusion windows.

`least_conn` is the only tested Nginx change with strong positive evidence. The A/B timeout, retry, and passive-health combination should not be promoted as a general solution: it behaved much worse without `least_conn`, and profile C still collapses under sufficient overload. A larger proxy timeout would mostly allow queues to live longer; it would not create API or database capacity.

The final pre-cache baseline from this experiment is therefore:

- healthy tested operating point: 1,900 RPS, with little safety margin
- capacity knee: approximately 2,000 RPS
- clear overload: 2,200 RPS
- preferred experimental balancing policy: `least_conn`
- dominant warning signal: pool waiters and pool-acquisition latency rising while query latency stays comparatively stable
- failure amplifier: Nginx upstream timeout/ejection overlap producing `no live upstreams`

The next major experiment can add Redis for product reads and ask whether removing read queries moves the knee. Before treating profile C as a production recommendation, a single-variable test should compare the original upstream failure settings with and without only `least_conn`; profiles A-C deliberately accumulated changes.

## Evidence

Every run has a manifest, raw k6 summary, bounded Nginx log, three-second Prometheus export, Docker statistics, and normalized analysis under `docs/experiments/results/multi-instance/`.

- `nginx-3api-containers-nginx-a-2000rps-pool20-20261004-155007-*`
- `nginx-3api-containers-nginx-b-2000rps-pool20-20261004-155723-*`
- `nginx-3api-containers-nginx-c-2000rps-pool20-20261004-160417-*`
- `nginx-3api-containers-nginx-c-1900rps-pool20-20261004-161031-*`
- `nginx-3api-containers-nginx-c-2200rps-pool20-20261004-161701-*`

## Intentionally not implemented

No Redis, caching, rate limiting, additional replicas, Kubernetes, queue, database change, business-logic change, or pool-size change was introduced. The experiment configurations remain opt-in Compose overlays so the default topology is not silently replaced.
