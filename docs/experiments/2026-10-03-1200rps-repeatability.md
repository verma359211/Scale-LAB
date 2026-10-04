# 1,200 RPS repeatability study

## Summary

Six user-run, four-minute, 1,200-RPS tests using the same k6 script produced failure rates from 0% to 35.27%. The repeated runs prove that the current Docker Desktop / Windows-host topology does not have a stable, deterministic 1,200-RPS outcome. Every client-visible failure that can be correlated with Nginx logs equals a `no live upstreams` event. The immediate failure mechanism is overlapping Nginx passive upstream-disable windows; transient upstream connection failures decide whether a run remains degraded-but-successful or collapses.

## Workload held constant

- `constant-arrival-rate`: 1,200 iterations per second
- Duration: four minutes
- Exactly one `GET /api/products/:id` per iteration
- 500 preallocated VUs
- 3,000 maximum VUs
- Three compiled Node API instances
- PostgreSQL pool maximum 20 per API
- Dockerized k6 and Nginx
- Node processes on the Windows host, reached through `host.docker.internal`

Three runs used `scripts/run-multi-instance-point.ps1`, which adds `--quiet`, unique result files, Docker-stat sampling and exact-window Prometheus/Nginx export. Three used `pnpm load:baseline`, which shows k6's progress UI and overwrites `baseline.json`. Both commands use the same application request path and scenario settings.

## Results

| Run | Harness | Achieved | Failures | Dropped | Avg | p95 | p99 | Peak active VUs | Upstream timeouts | Disable log events | `no live upstreams` |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| W1 | wrapper/quiet | 1,188.93 RPS | 0 / 0% | 2,702 | 88.56 ms | 293.28 ms | 1,936.63 ms | 1,449 | 41 | 27 | 0 |
| W2 | wrapper/quiet | 1,198.26 RPS | 0 / 0% | 461 | 14.73 ms | 46.80 ms | 159.05 ms | 399 | 26 | 15 | 0 |
| W3 | wrapper/quiet | 1,191.38 RPS | 41,549 / 14.53% | 2,094 | 107.49 ms | 885.09 ms | 1,745.31 ms | 1,644 | 71 | 1,553 | 41,549 |
| P1 | pnpm/progress | 1,189.56 RPS | 91,837 / 32.17% | 2,540 | 104.29 ms | 821.85 ms | not exported | 1,758 | 201 | 3,346 | 91,837 |
| P2 | pnpm/progress | 1,192.82 RPS | 7,680 / 2.68% | 1,738 | 38.25 ms | 110.54 ms | not exported | 1,227 | 49 | 30 | 7,680 |
| P3 | pnpm/progress | 1,189.14 RPS | 100,645 / 35.27% | 2,645 | 148.48 ms | 1,010 ms | not exported | 1,979 | 1,761 | 3,957 | 100,645 |

The six runs issued 1,715,825 HTTP requests and produced 241,711 failures, but aggregating them into one average would hide the key behavior: outcomes are bimodal. A run either retains at least one eligible upstream and retries succeed, or upstream unavailability windows overlap and a large burst fails immediately.

Even W1 is not healthy despite zero response failures. It drops 2,702 scheduled iterations, reaches 1,449 active VUs, and has a 1.94-second p99. W2 is the cleanest run but still drops 461 iterations. Therefore, response failure rate alone is not a sufficient health criterion.

## Exact Nginx correlation

For every failed run with a recoverable exact log window:

```text
k6 failed checks == Nginx "no live upstreams"
```

- W3: 41,549 == 41,549
- P1: 91,837 == 91,837
- P2: 7,680 == 7,680
- P3: 100,645 == 100,645

The three plain runs were recovered from distinct retained Nginx log blocks after the final timestamped wrapper run:

- P1: 15:53–15:57 UTC
- P2: 16:03–16:07 UTC
- P3: 16:12–16:16 UTC

The `temporarily disabled` figures are log-event counts, not guaranteed unique server-state transitions. Nginx can emit repeated messages while requests and retries encounter an unavailable upstream.

## Wrapper-run infrastructure correlation

| Metric | W1 degraded/no errors | W2 cleanest | W3 failed |
|---|---:|---:|---:|
| Node CPU steady-average range | 40.37–49.16% | 44.08–47.28% | 38.08–38.80% |
| Node CPU maximum range | 54.24–64.30% | 57.31–63.09% | 55.92–61.68% |
| Pool-waiter average range | 0.87–77.06 | 0–2.41 | 7.93–87.90 |
| Pool-waiter maximum range | 27–1,382 | 0–105 | 267–1,490 |
| Acquire rolling p95 average | 28.86–602.80 ms | 1.43–8.89 ms | 320.32–674.55 ms |
| Acquire rolling p95 maximum | 123–3,886 ms | 8–360 ms | 1,634–3,504 ms |
| Query rolling p95 average | 33.40–43.12 ms | 15.75–19.44 ms | 35.75–38.00 ms |
| Traffic-share average range | 29.53–35.48% | 32.05–34.90% | 32.13–34.39% |
| Nginx CPU avg/max | 73.93% / 165.11% | 76.75% / 110.27% | 66.98% / 160.97% |
| PostgreSQL CPU avg/max | 79.57% / 258.92% | 80.45% / 128.25% | 64.48% / 126.35% |

Node CPU is not saturated in any of these outcomes. The failed run actually has lower average Node and database CPU because Nginx rejects a significant fraction of offered work before it reaches the application. Large pool waits appear after traffic redistribution and slow requests increase concurrency.

## Does terminal rendering cause the failures?

The three progress-display runs are all worse than the three quiet wrapper runs in this small sample, so a contribution cannot be ruled out. However, terminal output is not the direct error mechanism:

- k6 runs inside a container; the Windows terminal displays periodic progress rather than one line per request.
- W3 uses `--quiet` and still fails 14.53% with 41,549 `no live upstreams` responses.
- The wrapper performs extra `docker stats` sampling, yet its outcomes are generally better.
- Every observed response failure is an Nginx upstream-availability rejection, not a k6 console or client error.

The progress renderer may be a small host/Docker perturbation that tips an already unstable system into a different timing pattern. It cannot by itself explain the failure cascade. A valid terminal-output A/B test must keep the same wrapper, collectors, run order and settling policy and vary only `--quiet`/TTY behavior across repeated runs.

## Interpretation

The current architecture is sensitive to timing:

```text
transient Nginx -> Windows-host API connect failures
                    ↓
passive max_fails/fail_timeout decisions
                    ↓
traffic redistribution
                    ↓
pool and in-flight request growth on remaining APIs
                    ↓
more upstream failures
                    ↓
overlapping unavailable windows
                    ↓
no live upstreams
```

Constant-arrival-rate then requires more VUs as requests stay in flight. Dynamic VU demand ranges from 399 to 1,979 across these nominally identical tests, and k6 drops iterations while attempting to maintain the schedule. VU growth is primarily a symptom and amplifier of latency, not proof that k6 initiated the upstream failures.

The strongest next step is not a higher rate. First repeat the same 1,200-RPS point with one standardized wrapper and a fixed reset/settling procedure. Then perform a one-variable topology comparison by moving the three APIs onto Nginx's Docker network. If timeout/ejection variance disappears, the Docker Desktop container-to-Windows-host path is confirmed as the trigger.

## Preserved wrapper evidence

- `docs/experiments/results/multi-instance/nginx-3api-1200rps-pool20-20261003-205440-*`
- `docs/experiments/results/multi-instance/nginx-3api-1200rps-pool20-20261003-210215-*`
- `docs/experiments/results/multi-instance/nginx-3api-1200rps-pool20-20261003-211242-*`

The plain runs preserve their terminal summaries in the supplied transcript, but only the last run's `baseline.json` remains because `pnpm load:baseline` uses a fixed output path. Their Nginx failure blocks remain in Docker's retained container logs.
