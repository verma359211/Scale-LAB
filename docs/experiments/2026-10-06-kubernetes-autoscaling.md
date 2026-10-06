# Kubernetes autoscaling experiment

## Status

Environment deployed and baseline-verified on 2026-10-06. Two staged workloads were run. The first exposed connection-level stickiness through the Kubernetes Service. The second disabled k6 HTTP connection reuse and confirmed that HPA-created pods receive traffic when new TCP connections are created.

## Architecture

```text
k6 Job
   ↓
ingress-nginx (Layer 7)
   ↓
Kubernetes Service
   ↓
API Deployment (2–6 pods, CPU HPA)
   ↓
Redis
   ↓
PostgreSQL
```

## Fixed configuration

| Setting | Value |
| --- | --- |
| HPA replicas | min 2, max 6 |
| HPA target | 70% average CPU utilization |
| API CPU | request 250m, limit 500m |
| API memory | request 256Mi, limit 512Mi |
| PostgreSQL pool | 10 per API pod, 60 maximum at six pods |
| Redis cache | ON, 30-second product TTL |
| Distributed rate limiter | OFF for the isolated capacity experiment |
| Load balancer | ingress-nginx in front of the Kubernetes Service |
| HTTP connection reuse | ON for the production-like ingress run |
| Metrics scrape interval | 3 seconds |

## Workload

`pnpm k8s:load` runs one read-only `GET /api/products/:id` per iteration with a ramping arrival rate:

| Stage | Duration | Target at end |
| ---: | ---: | ---: |
| 1 | 2m | 300 RPS |
| 2 | 3m | 1,200 RPS |
| 3 | 3m | 2,200 RPS |
| 4 | 3m | 3,000 RPS |
| 5 | 3m | 300 RPS |
| 6 | 2m | 0 RPS |

## Results

| Observation | Measured value |
| --- | --- |
| Test window | 2026-10-06 00:36:06–00:52:11 UTC |
| Completed requests | 1,207,092 |
| Average / highest observed API RPS | 1,248.97 / 2,838.22 |
| Dropped iterations | 40,907 (42.61/s over the complete ramp) |
| HTTP latency | 58.16 ms average, 23.92 ms median, 237.50 ms p95, 446.72 ms p99, 2.29 s maximum |
| HTTP errors and timeouts | 0; all 1,207,092 checks passed |
| 429 rate | 0; rate limiting was intentionally disabled |
| First desired replica increase | 2 → 3 at 00:38:13 UTC, 2m07s after Job start |
| Maximum replica count | 6 at 00:39:44 UTC, 3m38s after Job start |
| Scale-down | Began at 00:52:00 UTC; returned to 2 by 00:55:00 UTC |
| Request distribution | All six pods served load; whole-run per-pod maxima were 470.83–480.13 RPS |
| API CPU | Per-pod whole-run averages 0.27–0.30 cores; maxima 0.47–0.48 cores |
| Redis product cache | ~99.98% hits: 1,208,991 hits, 247 misses and 247 writes (Prometheus extrapolated increases) |
| PostgreSQL product reads | Approximately 247; Redis prevented the read workload from reaching PostgreSQL |
| PostgreSQL pool | 23 aggregate connections maximum; zero pool waiters |
| k6 resources | 1.28 CPU cores average, 1.99 maximum against a 2-core limit; 364.6 MiB average and 660.3 MiB maximum memory |

## Baseline verification

- Kubernetes 1.34.3, one Docker Desktop kind node
- two API pods Ready with zero restarts
- HPA current replicas 2, desired replicas 2
- idle CPU approximately 4–5% of the 250m request
- both API pods healthy Prometheus targets
- Metrics Server, kube-state-metrics, cAdvisor, Prometheus, and Grafana healthy
- three seeded products returned through the public Service
- twelve independent health connections reached both API pods
- PostgreSQL and Redis healthy
- zero recent structured API error logs

Use the saved k6 summary and Kubernetes event file in `docs/experiments/results/` together with the Grafana window. Do not fill values from visual estimates when the corresponding metric can be queried directly.

## Connection-reuse discovery

The first live run kept normal k6 HTTP keep-alive. HPA created five Ready API pods, and the Service EndpointSlice contained all five addresses, but approximately 1,465 RPS remained split across the original two pods. Each new pod received only approximately 0.4 RPS from its Kubernetes liveness and readiness probes. The original pods consumed approximately 193% of their 250m CPU request, or about 483m each, while the new pods remained near idle.

This proves that the Service was healthy but existing k6 TCP connections remained mapped to their original pod endpoints. Kubernetes Services select an endpoint for a new connection; they do not move an established connection when the endpoint list changes. The complete Job and raw k6 summary were not retained, so these are diagnostic live observations rather than a complete benchmark result.

The next run sets k6 `noConnectionReuse: true`. This is a one-variable diagnostic comparison intended to confirm that new connections reach newly Ready pods. Its connection setup overhead means it must not be treated as the final application-capacity baseline.

## No-reuse diagnostic result

The second run confirmed the connection-stickiness diagnosis. Once k6 opened a new TCP connection per request, all six Ready pods received application requests. During the ramp toward 3,000 RPS, the six pods each averaged approximately 389–394 RPS. Their maximum observed rates were also tightly grouped at approximately 457–475 RPS. This is fundamentally different from the keep-alive run, where new pods received only health-probe traffic.

The HPA behavior was therefore correct, and the Kubernetes Service was correctly distributing new connections. The original problem was the interaction between connection-level Service routing and a small set of long-lived client connections, not stale EndpointSlices or unready pods.

This run is not a production-like capacity baseline. Disabling reuse forced a TCP handshake for every request. The k6 container reached 1.99 of its 2 permitted CPU cores and dropped 40,907 scheduled iterations while the API returned zero errors. That strongly indicates that the load generator and artificial connection churn constrained the offered load near the top of the ramp. API pods also approached their 500m CPU limits, but PostgreSQL was not limiting this read-heavy cached test: pool waiters stayed at zero and only approximately 247 product reads reached PostgreSQL.

The runner saved the Kubernetes event file at `docs/experiments/results/kubernetes-autoscale-no-reuse-20261006-060605-events.txt`. Its attempt to copy the raw JSON summary failed because `kubectl cp` relies on executing `tar` in the container, and Kubernetes cannot exec into a completed container. The terminal summary and Prometheus history were used for the values above. Result capture should be corrected before the next formal experiment.

The next production-like experiment should put a Layer 7 ingress controller in front of the API and restore HTTP connection reuse. This retains efficient client keep-alive while decoupling each HTTP request from the original API pod connection.

## Ingress comparison run

The next run targets `ingress-nginx-controller.ingress-nginx.svc.cluster.local` from the in-cluster k6 Job. Normal k6 HTTP connection reuse is restored. Prometheus scrapes ingress-nginx, and Grafana shows ingress request rate, p95/p99 latency and response status. Result filenames use `kubernetes-autoscale-ingress-*` so they remain separate from the no-reuse diagnostic.

The expected comparison is not that ingress makes individual requests free. The experiment asks whether new Ready pods begin receiving traffic while k6 keeps its efficient persistent client connections. Record the result before changing HPA targets, pod resources or workload stages.

### Measured ingress result

The ingress comparison ran from 2026-10-06 02:11:07 to 02:27:15 UTC. k6 completed 1,247,004 requests with 100% successful checks and zero HTTP failures. It dropped 995 of approximately 1,247,999 scheduled iterations, or about 0.08%.

| Metric | Measured value |
| --- | --- |
| k6 whole-ramp average | 1,299.06 RPS |
| Highest observed API / ingress rate | 2,953.77 / 2,959.40 RPS |
| HTTP latency | 10.94 ms average, 2.74 ms median, 43.26 ms p95, 138.15 ms p99, 5 s maximum |
| k6 VUs | 582 maximum active; 684 maximum allocated |
| API pod count | 2 → 3 → 4 → 6, then back to 2 |
| Per-pod maximum rate | 491.83–492.92 RPS across all six pods |
| API CPU | Each pod reached approximately 0.49–0.50 cores against its 0.50-core limit |
| ingress-nginx CPU | 0.87 cores average, 2.00 maximum |
| k6 CPU | 0.83 cores average, 1.58 maximum against its 2-core limit |
| Redis cache | ~1,248,255 hits, 459 misses and 459 writes |
| PostgreSQL product reads | ~459 |
| PostgreSQL pool waiters | 0.09 aggregate average, brief maximum of 23 |
| HTTP response status | Approximately 1,248,410 status-200 responses in Prometheus; no error series |

HPA increased from two to three pods at 02:12:37, four at 02:14:23, and six at 02:14:53. Scale-down began at 02:26:54 and returned to two pods at 02:29:55. Most importantly, every HPA-created pod received real application traffic. Their maximum request rates differed by less than 1.1 RPS, confirming that Layer 7 ingress removed the client-connection pinning seen with the direct Service test.

Compared with the no-reuse diagnostic, average latency fell from 58.16 ms to 10.94 ms, p95 from 237.50 ms to 43.26 ms, p99 from 446.72 ms to 138.15 ms, and dropped iterations from 40,907 to 995. Persistent connections through ingress therefore achieved the desired routing behavior without per-request TCP connection churn.

The first ingress run did not retain its raw summary JSON because `kubectl cp` interpreted both the Kubernetes source and the absolute Windows `C:\...` destination as remote paths. The runner now copies to a repository-relative destination and checks the native command exit code before telling the result-reader sidecar to exit. The pasted terminal summary and the retained Prometheus history are the sources for the measurements above.
