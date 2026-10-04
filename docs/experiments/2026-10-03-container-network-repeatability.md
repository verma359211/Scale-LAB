# Container-network 1,200-RPS repeatability study

## Summary

Three four-minute constant-arrival-rate runs sustained the complete 1,200-RPS target after moving Nginx and the three compiled Node API instances onto the same Docker network. Every run completed approximately 288,000 requests with zero dropped iterations and zero client-visible failures. The timeout/ejection/`no live upstreams` cascade seen when Nginx crossed Docker Desktop's Windows gateway did not recur.

This strongly supports the previous conclusion that the container-to-Windows-host path was the instability trigger at 1,200 RPS. It does not isolate networking alone because the experiment also moves Node from Windows into Linux containers.

## Configuration

- k6 `constant-arrival-rate`: 1,200 iterations per second
- Duration: four minutes
- One `GET /api/products/:id` per iteration
- 500 preallocated VUs and 3,000 maximum VUs
- Nginx, k6, three APIs and PostgreSQL on the same Compose network
- Node 26.3.0 Alpine, compiled `dist/server.js`, `NODE_ENV=production`
- Three API instances with pool maximum 20 each
- Nginx round-robin, upstream keepalive and passive-health settings unchanged
- PostgreSQL data and queries unchanged

## k6 results

| Run | Achieved RPS | Requests | Dropped | Errors | Average | p95 | p99 | Maximum | Peak active VUs |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| C1 | 1,200.14 | 288,001 | 0 | 0% | 5.92 ms | 17.74 ms | 71.39 ms | 1,276.39 ms | 206 |
| C2 | 1,199.99 | 288,005 | 0 | 0% | 7.86 ms | 19.59 ms | 116.61 ms | 1,223.87 ms | 456 |
| C3 | 1,200.07 | 288,001 | 0 | 0% | 4.74 ms | 13.23 ms | 53.07 ms | 726.78 ms | 165 |
| Median | 1,200.07 | 288,001 | 0 | 0% | 5.92 ms | 17.74 ms | 71.39 ms | 1,223.87 ms | 206 |

The requested arrival rate was fully maintained. The second run briefly needed 456 active VUs but remained below the 500 preallocated workers and far below the 3,000 maximum. No result is being hidden by response failures or dropped scheduling work.

Run C1 reports an impossible minimum HTTP duration of approximately -1.57 ms. This is one invalid load-generator timing sample, likely caused by a virtualized clock/timer correction. It does not change the average or upper percentiles materially, but minimum duration from that run must not be used.

## Prometheus and Grafana correlation

| Metric | C1 | C2 | C3 |
|---|---:|---:|---:|
| API RPS per instance | 399.46–399.67 avg | 399.88–400.26 avg | 398.80–399.51 avg |
| Node CPU per instance | 51.31–52.02% avg | 47.88–48.50% avg | 47.81–51.19% avg |
| Event-loop lag per instance | 2.9–3.2 ms avg | 2.7–3.6 ms avg | 2.8–3.3 ms avg |
| Active requests per instance | 0.35–0.55 avg | 0.71–1.01 avg | 0.34–0.69 avg |
| Pool waiters | 0 | 0 | 0 |
| Pool-acquisition rolling p95 | 1 ms avg | 1.0–1.4 ms avg | 1 ms avg |
| Query rolling p95 | 6.1–6.6 ms avg | 8.0–8.7 ms avg | 4.6–5.6 ms avg |
| API scrape availability | 100% | 100% | 100% |

Traffic distribution is effectively even, with each API completing approximately 400 requests per second. Node CPU has substantial headroom, event-loop lag remains low, and there is no PostgreSQL pool queue. Each pool grew to roughly 15–16 connections on average but almost all were idle at scrape time; the connection count therefore does not indicate saturation.

Docker-stat data is complete for C1 and C2. Nginx averaged 47.86% and 51.98% of one CPU core, while PostgreSQL averaged 43.12% and 47.24%. The three API containers averaged approximately 55–59% of one core each. Values over 100% in an individual Docker sample indicate short multi-core bursts, not sustained single-core saturation.

C3's Prometheus export is complete, but its Docker-stat records are empty. Nginx was stopped before the run and was started automatically as the k6 dependency; the original collector had already captured container identifiers and then returned empty samples. The runner now refuses to start unless every measured service is running and samples stable Compose container names. A subsequent smoke test confirmed all five containers are recorded.

## Nginx evidence

| Event | C1 | C2 | C3 |
|---|---:|---:|---:|
| Upstream timeout | 0 | 0 | 0 |
| Temporarily disabled | 0 | 0 | 0 |
| No live upstreams | 0 | 0 | 0 |

C1 contains four upstream `connection reset by peer` messages during its opening seconds, spread across all three APIs. Nginx retries succeeded, so k6 observed no error and no upstream was passively disabled. C2 has an empty Nginx warning/error log. C3 contains only Nginx startup messages and no request failure.

Nginx reported approximately 501 active connections because k6 preallocated 500 VUs and reused keep-alive connections. This is expected and is not evidence of 501 simultaneously executing API requests; API active-request averages remained close to one per instance.

## Comparison with the Windows-host API topology

The earlier six-run study at the same rate and duration produced 0–35.27% failures, 461–2,702 dropped iterations in the three instrumented runs, p95 latency from 46.80 ms to 885.09 ms, and up to 100,645 `no live upstreams` responses. Even its cleanest run was not fully sustainable because it dropped scheduled work.

The container-network runs instead produced:

- three of three runs with the full target rate;
- zero dropped iterations across 864,007 requests;
- zero client errors;
- median p95 of 17.74 ms;
- no upstream timeout, passive-ejection or no-live-upstream event;
- zero pool waiters and complete monitoring availability.

The result is strong evidence that 1,200 RPS was not the capacity boundary of the three Node processes or PostgreSQL. The unstable Windows-host route was causing transient upstream failures; Nginx passive health handling then amplified those failures by redistributing traffic and occasionally excluding every upstream.

## Next experiment

Treat 1,200 RPS as a healthy point for the container-network topology. Find the new knee with controlled four-minute points at 1,400, 1,600, 1,800 and 2,000 RPS, stopping once latency, drops, errors or queues grow sharply. Keep the topology, pool size, runtime, test script and collection method unchanged. Repeat the highest healthy point and first degraded point three times before declaring a capacity boundary.

## Evidence

- `docs/experiments/results/multi-instance/nginx-3api-containers-1200rps-pool20-20261003-223524-*`
- `docs/experiments/results/multi-instance/nginx-3api-containers-1200rps-pool20-20261003-225043-*`
- `docs/experiments/results/multi-instance/nginx-3api-containers-1200rps-pool20-20261003-231024-*`

