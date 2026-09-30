# Single-instance baseline experiment

## Summary headline

Milestone 2 records the behavior of one unoptimized API instance under baseline, ramp, and spike traffic.

## Detailed body

### Environment

| Field | Value |
| --- | --- |
| Date | 2026-09-29 |
| Architecture | React/k6 → one Express API → PostgreSQL |
| API instance count | 1 (`api-1`) |
| API CPU limit | None |
| API memory limit | None |
| PostgreSQL host port | 5433 |
| Redis | OFF |
| Load balancer | OFF |
| Rate limiter | OFF |
| Cache / queue / sharding | OFF |

The API runs directly on the local host while PostgreSQL, Prometheus, Grafana, and on-demand k6 run in Docker. Results therefore describe this development computer and should not be compared as universal capacity numbers.

### Workloads

| Script | Default workload |
| --- | --- |
| `load-tests/baseline.js` | 3 constant VUs for 20 seconds; product list and detail reads |
| `load-tests/ramp.js` at measurement time | Arrival rate ramped through 5 → 10 → 25 → 50 → 5 iterations/s over 40 seconds |
| `load-tests/spike.js` at measurement time | Arrival rate moved from 10 to 100 iterations/s, held briefly, then returned to 10 over 35 seconds |

All workloads are read-only. Run them while `pnpm dev` and `pnpm observability:up` are active:

```bash
pnpm load:baseline
pnpm load:ramp
pnpm load:spike
```

The recorded values below describe the original safe profiles listed above. On 2026-09-30 the checked-in ramp and spike defaults were strengthened to seek failure at up to 2,000 iterations/second; their future results must be recorded as a separate experiment and must not be compared as though the workload were unchanged.

### Measured results

This section is populated only from actual k6 summaries and Prometheus samples. JSON summaries are saved under `docs/experiments/results/`.

| Workload | Actual RPS | Average latency | p95 | p99 | Error rate |
| --- | ---: | ---: | ---: | ---: | ---: |
| Baseline | 11.615 req/s | 7.147 ms | 11.099 ms | 48.772 ms | 0% |
| Ramp | 22.469 req/s | 4.422 ms | 5.270 ms | 6.333 ms | 0% |
| Spike | 54.973 req/s | 4.371 ms | 5.222 ms | 7.393 ms | 0% |

| Workload | Peak API CPU | Peak memory | Peak pool total | Peak pool idle | Peak pool waiters |
| --- | ---: | ---: | ---: | ---: | ---: |
| Baseline | 3.917% | 65.30 MiB | 3 | 3 | 0 |
| Ramp | 6.375% | 70.53 MiB | 2 | 2 | 0 |
| Spike | 13.026% | 73.18 MiB | 1 | 1 | 0 |

### Observations

All three checked-in scripts completed successfully with 100% checks and no HTTP errors. Prometheus observed peak request rates of approximately 12.001, 39.830, and 97.758 req/s for the baseline, ramp, and spike windows respectively, confirming that the monitoring path reflected each traffic shape. The arrival-rate tests' overall k6 RPS is lower than their peak stage because it is averaged across warm-up and recovery stages.

The tested read path stayed healthy at the modest local defaults. CPU and resident memory rose across the larger workloads, but PostgreSQL never had a waiter. Pool totals vary because `pg` creates clients on demand and retires idle clients; these fast sequential reads did not create meaningful pool pressure.

The three-second scrape interval can miss very short-lived in-flight requests. The baseline window sampled a peak of three active requests, the ramp sampled one, and the spike samples happened between its roughly 4 ms requests and reported zero. This is an expected sampling limitation, not proof that no request was in flight. A later deliberately slow or heavier experiment will make concurrency and pool pressure easier to see.

The baseline p99 is higher than the ramp and spike p99 despite lighter load. The 20-second sample contains only 234 requests and includes connection/setup outliers, so it should not be interpreted as capacity degradation. Longer repeated trials are needed for statistically stable comparisons.

### Limitations

There are no explicit CPU or memory constraints, and local Docker/host scheduling affects results. The modest defaults validate the experiment path; later manual runs should raise arrival rates until degradation is visible without changing application code during the experiment.
