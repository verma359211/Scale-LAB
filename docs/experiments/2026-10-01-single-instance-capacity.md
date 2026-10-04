# Single-instance constant-arrival-rate capacity — 2026-10-01

## Summary headline

The compiled single Node.js instance is clearly healthy through 925 RPS, operates at a noisy edge around 950 RPS, develops repeatable scheduling loss around 955 RPS, and is saturated by 1000 RPS.

## Environment

- Git commit: `be2cd4044110253834d702a87786cc97493c648b` with pre-existing uncommitted workspace changes.
- Runtime: Node.js `v26.3.0`, compiled JavaScript via `node apps/api/dist/server.js`; `tsx watch` was not used.
- API environment: `NODE_ENV=production`, `INSTANCE_ID=api-1`, one API process on port 3001.
- Database pool: `DATABASE_POOL_MAX=10` for every run.
- Successful per-request terminal logging: disabled. Lifecycle and exceptional error logs remained enabled.
- Host: Windows 11 Home Single Language, build 26200, 15.42 GiB visible RAM.
- Docker Desktop: 4.76.0, Docker Engine 29.5.2, WSL2 Linux backend, 12 CPUs and 7.468 GiB RAM available to Docker.
- PostgreSQL: 16.15 in `postgres:16-alpine`, host port 5433, no Compose CPU or memory limit.
- Prometheus: 3.5.0, three-second scrape interval, seven-day retention.
- Grafana: 12.1.1.
- k6: 1.8.1 in Docker, calling `http://host.docker.internal:3001`.
- Network path: k6 Linux container → Docker Desktop/WSL2 networking → Windows-hosted Node process → PostgreSQL Linux container.

The API was built immediately before the experiment and remained one continuously running process. PostgreSQL was not restarted between points. `/health` reported the API and database healthy before and after the suite, and Prometheus reported its API target up.

## Workload

The existing `load-tests/baseline.js` constant-arrival-rate scenario was used directly. Each iteration performs exactly one `GET /api/products/:id` request, without `sleep()`. Every measured point used:

- `timeUnit: 1s`
- two-minute duration
- 300 preallocated VUs
- 1,500 configured maximum VUs
- pool maximum 10
- compiled Node runtime
- a 200 RPS, 15-second unmeasured warm-up before the sweep
- a short idle interval between boundary runs

The CLI requested `avg`, `min`, `median`, `max`, p90, p95 and p99 trend fields in every raw k6 summary. The application behavior, middleware, metrics, SQL, indexes, timeouts and pool size were not changed during the experiment.

## Capacity results

Prometheus values below are calculated from the exact saved run window. Rate/histogram panels use 30-second rolling windows, so the first 30 seconds are excluded from their aggregate to prevent the leading idle period from contaminating the result. `Acquire p95` and `Query p95` are the mean values of the rolling p95 series. `Event-loop p99` is p99 across the saved point-in-time lag samples. API CPU is process CPU as a percentage of one logical core, not total-machine CPU.

| Target | Run | Achieved RPS | Dropped | Avg ms | p95 ms | p99 ms | Errors | API CPU avg/max | Pool wait avg/max | Acquire p95 ms | Query p95 ms | Event-loop p99 ms |
|---:|:---|---:|---:|---:|---:|---:|---:|:---|:---|---:|---:|---:|
| 700 | broad | 700.04 | 0 | 6.19 | 7.68 | 101.25 | 0% | 68.1 / 71.7 | 0.0 / 0 | 2.40 | 5.00 | 5.63 |
| 800 | broad | 800.04 | 0 | 8.56 | 27.32 | 134.07 | 0% | 67.4 / 72.7 | 3.7 / 86 | 3.89 | 6.53 | 7.35 |
| 850 | broad | 850.02 | 0 | 6.63 | 21.23 | 74.15 | 0% | 73.5 / 75.8 | 1.8 / 56 | 5.23 | 8.43 | 3.90 |
| 900 | broad | 900.05 | 0 | 10.79 | 50.33 | 113.19 | 0% | 79.3 / 84.1 | 5.3 / 92 | 23.70 | 13.36 | 11.74 |
| 925 | broad | 925.05 | 0 | 13.73 | 60.91 | 156.73 | 0% | 80.2 / 82.0 | 4.5 / 138 | 18.83 | 13.40 | 6.26 |
| 950 | broad | 949.05 | 0 | 22.58 | 113.00 | 237.63 | 0% | 84.6 / 86.4 | 6.0 / 57 | 98.98 | 17.33 | 14.00 |
| 950 | repeat 2 | 950.09 | 0 | 11.30 | 45.21 | 134.05 | 0% | 75.1 / 78.4 | 4.3 / 57 | 19.77 | 11.37 | 8.02 |
| 950 | repeat 3 | 949.88 | 24 (0.021%) | 24.05 | 123.73 | 218.15 | 0% | 83.0 / 85.9 | 14.3 / 157 | 114.95 | 17.62 | 15.44 |
| 955 | fine | 953.50 | 182 (0.159%) | 27.25 | 105.67 | 421.84 | 0% | 79.0 / 83.3 | 23.6 / 362 | 133.70 | 17.40 | 10.96 |
| 955 | repeat 2 | 954.09 | 115 (0.100%) | 38.45 | 226.29 | 349.63 | 0% | 83.0 / 86.2 | 34.7 / 258 | 182.17 | 17.25 | 12.40 |
| 955 | repeat 3 | 955.08 | 0 | 16.75 | 78.86 | 157.29 | 0% | 83.3 / 86.2 | 10.9 / 128 | 65.64 | 15.55 | 16.43 |
| 960 | fine | 953.16 | 841 (0.730%) | 91.34 | 562.30 | 820.31 | 0% | 80.8 / 91.2 | 8.8 / 87 | 215.19 | 16.73 | 10.84 |
| 975 | broad | 971.97 | 371 (0.317%) | 61.04 | 451.05 | 575.40 | 0% | 86.9 / 89.9 | 59.7 / 463 | 319.34 | 18.69 | 15.81 |
| 1000 | broad | 989.93 | 745 (0.621%) | 195.21 | 588.74 | 876.26 | 0% | 92.5 / 96.5 | 206.7 / 718 | 555.44 | 21.48 | 14.08 |
| 1050 | not run | — | — | — | — | — | — | — | — | — | — | — |
| 1100 | not run | — | — | — | — | — | — | — | — | — | — | — |

The plan explicitly allowed stopping after severe overload. Because 975 and 1000 RPS already dropped work and latency had expanded sharply, 1050 and 1100 RPS were intentionally not run.

### k6 detail

| Target | Run | Requests | Checks | Median ms | p90 ms | Max ms | Iteration avg/p95/p99 ms | Observed VUs min–max | Allocated VUs max / configured max |
|---:|:---|---:|---:|---:|---:|---:|:---|:---|:---|
| 700 | broad | 84,000 | 100% | 3.84 | 5.58 | 255.88 | 6.50 / 8.07 / 102.72 | 2–133 | 300 / 1500 |
| 800 | broad | 96,001 | 100% | 3.48 | 7.20 | 223.46 | 8.85 / 27.65 / 134.70 | 1–140 | 300 / 1500 |
| 850 | broad | 102,001 | 100% | 3.61 | 9.98 | 102.89 | 6.93 / 21.61 / 77.53 | 2–81 | 300 / 1500 |
| 900 | broad | 108,001 | 100% | 3.85 | 26.15 | 173.11 | 11.09 / 50.66 / 114.15 | 2–111 | 300 / 1500 |
| 925 | broad | 111,001 | 100% | 3.93 | 33.22 | 186.18 | 14.05 / 61.21 / 158.46 | 2–158 | 300 / 1500 |
| 950 | broad | 114,001 | 100% | 4.29 | 68.22 | 305.05 | 22.89 / 113.52 / 238.04 | 3–253 | 300 / 1500 |
| 955 | fine | 114,419 | 100% | 4.00 | 63.40 | 514.21 | 27.56 / 106.36 / 422.45 | 2–433 | 436 / 1500 |
| 960 | fine | 114,360 | 100% | 4.32 | 437.80 | 1,070.29 | 91.73 / 562.65 / 822.32 | 2–723 | 782 / 1500 |
| 975 | broad | 116,629 | 100% | 5.07 | 182.64 | 670.81 | 61.38 / 451.55 / 575.65 | 3–552 | 574 / 1500 |
| 1000 | broad | 119,256 | 100% | 83.37 | 506.57 | 989.53 | 195.60 / 589.60 / 877.69 | 3–851 | 860 / 1500 |

k6's summary export provides observed VU minimum, maximum and final values but not a time-weighted average VU value. No run reached the configured 1,500-VU ceiling. The largest number k6 allocated was 860 at 1000 RPS, so `maxVUs` did not invalidate any result.

## Repeatability

| Target | Runs | Median achieved RPS | Median dropped | Median avg ms | Median p95 ms | Median p99 ms | Median API CPU | Median pool wait avg | Median acquire p95 ms |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 950 | 3 | 949.88 | 0 | 22.58 | 113.00 | 218.15 | 83.0% | 6.0 | 98.98 |
| 955 | 3 | 954.09 | 115 (0.100%) | 27.25 | 105.67 | 349.63 | 83.0% | 23.6 | 133.70 |

The environment is noisy near the boundary. At 950 RPS, p95 ranged from 45 to 124 ms and one run dropped 0.021% of scheduled iterations. At 955 RPS, one of three runs was clean while two dropped work. The five-RPS difference is not a permanent universal limit; it marks a narrow, burst-sensitive transition on this machine and topology.

## Healthy maximum

The clearly healthy operating region is 700–925 RPS: every scheduled iteration completed, errors stayed at zero, and latency increased without sustained loss.

950 RPS is the highest measured edge-sustainable rate. Its three-run median drop count is zero and achieved throughput remains about 950 RPS, but tail latency is variable and one run had 24 drops. For a conservative operating target with repeatable headroom, use 925 RPS; for the measured maximum before consistent degradation, use approximately 950 RPS.

## Capacity knee

The knee begins around 950–955 offered RPS. The evidence is:

- median dropped work changes from 0 at 950 to 115 at 955;
- median pool waiters rise from 6.0 to 23.6;
- rolling pool-acquisition p95 rises from about 99 ms to 134 ms;
- end-to-end p99 median rises from about 218 ms to 350 ms;
- query p95 remains near 15–18 ms rather than growing proportionally;
- API CPU is already about 83% on average in both repeat sets, leaving little burst headroom.

This is a queueing knee: a small offered-load increase produces a much larger change in waiting and tail latency, with variable drops depending on local scheduling noise.

## Saturation and overload behavior

960 RPS and above are overloaded in the measured suite. At 960 RPS, the server completed only 953.16 RPS and dropped 0.73% of scheduled iterations. At 1000 RPS, achieved throughput was 989.93 RPS, 0.621% was dropped, median latency rose to 83 ms, average latency to 195 ms, and p99 to 876 ms.

HTTP error rate remained zero because accepted requests eventually completed and the script uses k6's default request timeout. Dropped iterations represent work k6 could not start on schedule; they are capacity failures even though no HTTP request existed to return an error.

## Bottleneck correlation

### Primary bottleneck: PostgreSQL pool queueing on the request path

The immediate latency amplification is pool acquisition, not SQL execution:

- pool waiters move from zero at 700 RPS to an average of 206.7 and maximum of 718 at 1000 RPS;
- average idle clients fall to 2.81 at 1000 RPS;
- rolling acquisition p95 grows from 2.4 ms at 700 RPS to 555 ms at 1000 RPS;
- rolling query p95 grows much less, from 5.0 ms to 21.5 ms;
- PostgreSQL container CPU is 49.8% average and 59.6% maximum at 1000 RPS, far from consuming the Docker VM's available CPU allocation;
- PostgreSQL memory stays essentially flat near 41 MiB.

This identifies the ten-client pool queue as the immediate waiting location. It does not by itself prove that increasing the pool is the correct optimization; the earlier pool-10 versus pool-20 experiment did not improve throughput, and a larger pool can simply move contention elsewhere. A controlled pool-size experiment under this same arrival-rate methodology would be needed to revisit that question.

### Secondary bottleneck: single-process Node CPU headroom

Node process CPU rises from about 68% at 700 RPS to 92.5% average and 96.5% maximum at 1000 RPS. That is close to one logical core of process CPU, while event-loop lag p99 remains roughly 14 ms and memory remains stable. Node CPU is therefore a strong secondary/co-limiting resource at full overload, but it is not the first metric to explode at the 950–955 knee; pool acquisition and waiter bursts change more sharply there.

### Not supported as primary bottlenecks

- PostgreSQL engine CPU: container CPU remains around half of one core on average.
- Memory/GC exhaustion: API resident memory is roughly 115–160 MiB and does not trend toward exhaustion.
- Prometheus failure: scrape availability is 1.0 for every saved run; scrape duration stays low, with the largest observed scrape-duration sample about 57 ms.
- k6 VU ceiling: no run approached the configured 1,500-VU maximum.

## Observability health and measurement limits

Prometheus successfully scraped the API throughout every measured window. At 1000 RPS, scrape duration averaged about 15 ms and peaked around 29 ms. The 975 RPS run contained the largest scrape sample, about 57 ms, but no scrape was missed.

Prometheus histograms do not store an exact maximum observation. Therefore exact maximum pool-acquisition and SQL-query time cannot be reconstructed from the current metric families. The saved aggregate contains rolling averages and rolling p95/p99 values plus their maximum sampled values. Exact end-to-end request maximum is available from k6 and is reported above.

Docker CPU sampling used `docker stats --no-stream` repeatedly during each run. It is lower resolution than the three-second Prometheus API data and should be treated as supporting evidence, not a replacement for a container exporter.

## Benchmark contamination

- The Docker Desktop/WSL2/Windows cross-boundary network path is part of these numbers.
- The API runs on Windows while PostgreSQL and k6 run in Linux containers, so these results are a local-system baseline, not a Linux production-host capacity claim.
- The 800/850 ordering and repeat variability at 950/955 show measurable host scheduling noise.
- Compiled Node and quiet k6 output remove the known `tsx watch` and high-volume terminal logging distortions.
- No Compose CPU/memory limits isolate the stack from unrelated host work.

## Recommended next experiment

Do not introduce horizontal scaling yet. The next experiment should be a controlled CPU profile of the compiled single process at a repeatable near-knee point (925 or 950 RPS), without changing code. Capture a Node CPU profile for one run and identify which request-path functions consume CPU.

After profiling, run one-variable A/B experiments from the earlier audit in this order:

1. metrics enabled versus a benchmark-only metrics-disabled configuration, if profiling shows substantial `prom-client` cost;
2. current explicit pool acquisition path versus a behavior-equivalent `pool.query()` path, if profiling/allocation data supports it;
3. pool 10 versus pool 20 using this same constant-arrival-rate suite, only if the acquisition queue remains the dominant signal.

The decision to optimize must follow the profile. These results do not justify Redis, clustering, replicas, a load balancer or Kubernetes yet.

## Saved evidence

- `docs/experiments/results/capacity/capacity-summary.json` contains normalized per-run k6, API, pool, query, scrape and PostgreSQL container statistics.
- Every run also has a uniquely named raw k6 summary, manifest, Prometheus/Grafana export and PostgreSQL Docker-stats NDJSON file in `docs/experiments/results/capacity/`.
- Filenames contain target RPS, pool size, runtime mode, run label and timestamp; no previous result file was overwritten.
- `scripts/run-capacity-point.ps1` is the reproducible single-point runner.
- `scripts/summarize-capacity-results.mjs` builds the normalized aggregate from raw evidence.

## Verification

- The API stayed healthy and returned `instanceId: api-1` after the suite.
- PostgreSQL remained healthy at version 16.15.
- Prometheus target health remained `up` throughout every saved window.
- All k6 checks passed and all received HTTP responses succeeded.
- No k6 process or container remained after a run.
- The compiled API build completed before testing.
- API typechecking and all 10 integration tests passed after the suite.
- The aggregation script parsed all 14 measured runs into one summary without overwriting raw evidence.

No application optimization, middleware change, pool-size change, cache, replica, worker, load balancer or other scaling technology was introduced.
