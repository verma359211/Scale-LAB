# ScaleLab implementation log

## Milestone 2 — the single-instance baseline is observable and reproducible

### Summary headline

Prometheus metrics, a provisioned Grafana dashboard, and three safe k6 traffic profiles now measure the existing API without changing its business path.

### Detailed body

#### What was implemented and why

The Express API now exposes `GET /metrics` using `prom-client`. Dedicated observability middleware records completed request count and duration by HTTP method, normalized Express route, and status code. It also tracks in-flight requests. Request IDs and user IDs are deliberately excluded from labels because their unbounded values would create high-cardinality time series.

The same registry collects standard Node.js process metrics, including CPU, resident memory, garbage collection, and event-loop measurements. Three gauges read `pg.Pool`'s live `totalCount`, `idleCount`, and `waitingCount` each time Prometheus scrapes. The registry has `instance_id` and `service` default labels, so a later multi-instance milestone can split series without changing route handlers.

Prometheus and Grafana were added to the existing Compose project. Prometheus scrapes the host API every three seconds and retains local data for seven days. Grafana is provisioned from version-controlled files with a Prometheus datasource and a functional dashboard. PostgreSQL remains the only application dependency; Prometheus and Grafana observe the API rather than entering its request path.

Three k6 scripts establish different traffic shapes: a small constant-VU baseline, a gradual arrival-rate ramp, and a short flash-sale spike. They issue only product reads, so stock and order state remain deterministic. The root commands run k6 in a disposable Compose container and save JSON summaries under `docs/experiments/results/`.

The web app has a small architecture strip showing `Browser → API instance → PostgreSQL`. It uses response metadata already returned by the API and does not query Prometheus. Grafana remains the detailed monitoring surface; a separate observer service is intentionally postponed.

#### Architecture

```text
Browser / k6
     |
     v
Express API :3001  <--- Prometheus :9090 <--- Grafana :3002
     |
     v
PostgreSQL :5433 (host) / :5432 (container)
```

The production request path remains `React → Express → PostgreSQL`. Observability is a side path, and there is still exactly one API process.

#### Important files

- `apps/api/src/observability/metrics.ts` owns the registry, middleware, process collectors, and pool gauges.
- `apps/api/src/app.ts` mounts the middleware and `/metrics` endpoint.
- `infrastructure/prometheus/prometheus.yml` defines the three-second API scrape.
- `infrastructure/grafana/provisioning/` provisions the datasource and dashboard provider.
- `infrastructure/grafana/dashboards/scalelab-overview.json` defines the baseline dashboard.
- `load-tests/baseline.js`, `ramp.js`, and `spike.js` define the repeatable read workloads.
- `compose.yaml` runs PostgreSQL, Prometheus, Grafana, and the on-demand k6 tool container.
- `docs/experiments/` records configuration and only measured results.

#### Commands

```bash
pnpm observability:up
pnpm dev
pnpm load:baseline
pnpm load:ramp
pnpm load:spike
pnpm observability:down
```

Grafana is available at `http://localhost:3002` with local credentials `admin` / `admin`. Prometheus is at `http://localhost:9090`, and raw API metrics are at `http://localhost:3001/metrics`.

#### Verification

Verification on 2026-09-29 completed successfully: all 10 API integration tests passed, workspace typechecking passed, and both packages produced production builds. `/health` returned a healthy database and `api-1`; `/metrics` returned Prometheus text including HTTP, process, instance, and pool series. Prometheus reported `scalelab-api` as `up`, while Grafana reported its database and provisioned datasource healthy and loaded the baseline dashboard.

All three root k6 commands completed with 100% checks and zero HTTP failures. Prometheus observed distinct load peaks during each run, demonstrating that the dashboard datasource changes with traffic. Actual k6 latency/RPS values and Prometheus resource/pool samples are recorded in `docs/experiments/2026-09-29-single-instance-baseline.md` and the raw k6 summaries are retained under `docs/experiments/results/`.

#### Limitations and intentional omissions

This is a local baseline, not a production monitoring deployment. Grafana uses development credentials, Prometheus uses local persistent storage, and no CPU or memory limits are imposed on the host API. The API is not containerized, so Compose reaches it through `host.docker.internal`.

No Redis, reverse proxy, load balancer, additional API replica, Kubernetes, rate limiter, shard, queue, CDN, or observer service was added. The system has not been optimized in response to load; degradation is evidence for subsequent milestones.

## Milestone 2 follow-up — ramp and spike now seek the failure boundary

### Summary headline

The safe baseline remains unchanged, while ramp and spike now apply enough sustained traffic to reveal latency, scheduling, or resource limits on a typical development machine.

### Detailed body

The ramp profile now progresses from 50 toward 2,000 requested iterations per second across six 20-second stages. The spike profile warms at 50 iterations per second, jumps to 2,000 over three seconds, holds the peak for 20 seconds, then recovers. Both remain read-only and therefore do not consume stock.

Each request has a two-second timeout. In addition to the existing check and error-rate thresholds, the tests now fail when p95 exceeds 250 ms, p99 exceeds 500 ms, or k6 drops any scheduled iteration. A non-zero exit can therefore represent unacceptable latency or insufficient load-generator capacity even when every completed HTTP response returned 200.

The existing 2026-09-29 results remain labeled with the exact lighter workload that produced them. No result has been invented for the stronger profiles; running them is intentionally left as an observed experiment because they may heavily load the local computer and produce substantial structured request output.
