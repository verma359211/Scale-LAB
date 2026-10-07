# PostgreSQL write baseline

Date: 2026-10-07

## Purpose

Measure the current order transaction before changing its SQL or introducing database scaling technology.

## Architecture

```text
k6 Job -> ingress-nginx -> HPA API pods -> Redis + one PostgreSQL primary
```

- API replicas: HPA, 2 minimum and 6 maximum
- PostgreSQL: one writable primary
- API pool: 10 connections per pod
- Redis: enabled; order commits invalidate the affected product cache
- Rate limiter: disabled for Kubernetes capacity experiments
- Order transaction: `BEGIN -> SELECT ... FOR UPDATE -> UPDATE stock -> INSERT order -> COMMIT`

## Experiments

1. Hot row: every order targets benchmark product 10001.
2. Distributed rows: orders are spread across benchmark products 10001–10100.

Run the same target RPS and duration for both modes so the effect of row contention is visible. Start at 200 RPS and increase in broad steps; local Docker Desktop noise means tiny RPS increments are not useful.

```powershell
pnpm k8s:write:hot -- -TargetRps 200 -Duration 4m
pnpm k8s:write:distributed -- -TargetRps 200 -Duration 4m
```

## Results

Not run yet. Record only measured values:

| Mode | Target RPS | Achieved RPS | Dropped | Avg latency | p95 | p99 | Errors | DB CPU avg/max | Pool wait max | Lock observation |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| hot | 200 | 194.57 total / ~159 successful | 685 (1.43% of 48,001 scheduled) | 3.40 s | 5.33 s | 5.83 s | 18.18% | 0.803 / 0.989 cores | 956 | One product row serialized transactions; `order.lock_product` rolling p95 averaged 0.794 s and reached 0.939 s |
| distributed | 200 | 198.96 | 253 (0.53% of 48,001 scheduled) | 58.89 ms | 57.33 ms | 2.33 s | 0% | 0.314 / 0.432 cores | 374 transient, 7.4 average | Row-lock rolling p95 averaged 3.84 ms and peaked at 30.78 ms |

Also record API pod count/CPU, PostgreSQL commits and rollbacks, database connections, query-operation p95, pool acquire p95, and whether Prometheus remained healthy.

### Hot-row observations

Result file: `kubernetes-write-hot-200rps-20261007-002841.json`

- 38,716 of 47,316 completed requests created an order; 8,600 failed.
- The API produced approximately 8,656 PostgreSQL pool-acquisition timeouts over the matching Prometheus window. The small difference comes from range-window extrapolation and scrape timing.
- Aggregate pool waiters averaged 635 and peaked at 956. Pool acquisition rolling p95 averaged 4.43 seconds and peaked at 4.82 seconds, immediately before the configured five-second connection acquisition timeout.
- PostgreSQL CPU averaged 0.803 cores and peaked at 0.989 of its one-core container limit. API CPU across the active pods averaged 0.546 cores and peaked at 0.912 cores.
- PostgreSQL commits averaged approximately 171/sec. The HPA increased the API Deployment from two to four pods, but more API pods cannot parallelize updates to the same locked product row.
- Readiness checks occasionally timed out because they share the saturated application pools. This temporarily removed pods from Service traffic and amplified the overload, but it followed the database lock/pool queue rather than causing it.
- k6 used at most 984 VUs against a configured maximum of 1,500, so the load generator's VU ceiling was not the primary limitation.
- Exit code 99 means the intentionally strict k6 thresholds detected the measured errors; it does not mean the runner failed to save its results.

### Distributed-row observations

Result file: `kubernetes-write-distributed-200rps-20261007-004214.json`

- All 47,748 completed requests created an order. There were no HTTP errors and no PostgreSQL pool-acquisition timeouts.
- Median latency fell from 3.92 seconds in the hot-row run to 6.54 milliseconds. Average latency fell from 3.40 seconds to 58.89 milliseconds.
- Row-lock rolling p95 averaged 3.84 milliseconds instead of 794 milliseconds. This is the strongest evidence that serialization on one product row was the hot test's primary bottleneck.
- Aggregate pool waiters averaged 7.4 instead of 635. A transient peak of 374 and pool-acquisition p95 peak of 3.46 seconds explain the 2.33-second k6 p99 tail, but the queue recovered without failed requests.
- PostgreSQL CPU averaged 0.314 cores and peaked at 0.432 cores, substantially below the hot-row run's 0.803/0.989 cores despite more successful transactions.
- PostgreSQL commits averaged approximately 206/sec. The HPA reached five API pods because the write path also consumes API CPU.
- k6 dropped 253 scheduled starts while dynamically growing beyond the 300 preallocated VUs. This was 0.53% of the intended 48,001 starts and did not represent an HTTP failure. Future higher-rate tests should preallocate more VUs, but this local-generator detail does not change the hot-versus-distributed conclusion.

### Baseline conclusion

At the same offered rate, distributing writes removed all application errors and reduced ordinary response time by orders of magnitude. The current flash-sale failure mode is therefore primarily the pessimistic `SELECT ... FOR UPDATE` transaction serializing every order for one product, with pool exhaustion and readiness instability as downstream effects. The next controlled implementation should replace the separate lock/read and stock update with one conditional atomic `UPDATE ... WHERE stock >= quantity RETURNING ...`, while retaining the surrounding transaction for order insertion.

## Atomic-update experiment

The conditional atomic stock update was deployed as `scalelab-api:atomic-stock`. Business behavior is unchanged, and a concurrent final-unit integration test verifies that it cannot oversell. The optimized hot-row run used the same 200 RPS target, four-minute duration, pool size and pod resources as the original baseline.

Result file: `kubernetes-write-hot-200rps-20261007-021318.json`

| Metric | Original locking read | Atomic update | Change |
| --- | ---: | ---: | ---: |
| Successful orders | 38,716 | 44,004 | +13.7% |
| Error rate | 18.18% | 7.01% | -61.4% relative |
| Average latency | 3.40 s | 1.76 s | -48.2% |
| Median latency | 3.92 s | 1.39 s | -64.5% |
| p95 latency | 5.33 s | 5.00 s | -6.2% |
| Pool waiters average | 635 | 325 | -48.8% |
| Pool waiters maximum | 956 | 985 | still saturated |
| Pool acquire p95 average | 4.43 s | 3.49 s | -21.2% |
| Hot stock operation p95 average | 794 ms | 407 ms | -48.7% |
| PostgreSQL CPU average | 0.803 cores | 0.743 cores | -7.5% |
| PostgreSQL CPU maximum | 0.989 cores | 0.993 cores | unchanged saturation |

Prometheus recorded approximately 2.8k ingress `500` responses, matching the roughly 2.7k extrapolated pool-acquisition timeouts, plus about 445 ingress `503` responses while database-backed readiness probes timed out and temporarily removed pods from Service traffic. The HPA reached three pods, but additional API pods cannot make one PostgreSQL row update concurrently.

The atomic update is a worthwhile permanent improvement, but it cannot remove the physical serialization required to decrement one inventory row safely. At 200 hot-product RPS, the shared PostgreSQL primary remains at its CPU ceiling, the pool queue still saturates, and readiness behavior magnifies the failure rate. Increasing pool size or timeouts would enlarge the queue rather than eliminate this bottleneck.

## Decision after measurement

- If hot is much worse while distributed remains healthy, row-lock serialization is primary; test an atomic conditional stock update next.
- If both fail with high PostgreSQL CPU/query latency, profile and tune the primary database before adding replicas or sharding.
- If pool waiting rises while PostgreSQL has headroom, run a controlled pool-size experiment.
- If API CPU saturates first, optimize/profile the API write path rather than changing database topology.
