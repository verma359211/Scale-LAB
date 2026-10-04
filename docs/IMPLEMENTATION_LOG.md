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

## Milestone 2 diagnostics — database waiting is separated from SQL execution

### Summary headline

Pool-acquisition latency, query latency, overload failures, client aborts, and scrape availability now identify where time is spent when the single API instance stops responding.

### Detailed body

The API now measures PostgreSQL pool acquisition and SQL execution independently. `scalelab_pg_pool_acquire_duration_seconds` records how long an operation waits for a client, while `scalelab_pg_query_duration_seconds` measures only execution after acquisition. Query operations use a bounded label such as `product.get` or `order.insert`; request IDs, user IDs, and product IDs are not metric labels.

Counters record pool-acquisition timeouts, SQL failures, and HTTP clients that disconnect before a response finishes. Unexpected request errors now log their error name, error code, stack, request metadata, and a snapshot of pool totals, idle connections, and waiters. The server also emits structured events for background pool errors, process warnings, fatal uncaught exceptions, and HTTP-server errors. These are exceptional-event logs rather than additional success-path logging, because synchronous terminal volume can itself distort a load test.

Grafana gained panels for API scrape availability, scrape duration, diagnostic failure rates, pool-acquisition average/p95/p99, query average/p95/p99, per-operation query p95, and HTTP 5xx versus client aborts. The `up` panel remains available when application metrics disappear, making an unreachable `/metrics` endpoint explicit.

All three k6 summaries now distinguish network errors, request timeouts, and received HTTP 5xx responses with custom counters. Existing thresholds and traffic shapes are unchanged.

Important files are `apps/api/src/observability/metrics.ts`, the product and order data-access modules, `apps/api/src/app.ts`, `apps/api/src/server.ts`, both aggressive load scripts, and `infrastructure/grafana/dashboards/scalelab-overview.json`. Run the system normally with `pnpm observability:up` and `pnpm dev`, then execute a load profile from a second terminal.

PostgreSQL server CPU and memory are intentionally not claimed here. The existing CPU panel measures the Node process only; reliable database host/container resource metrics require a PostgreSQL/container exporter, which remains postponed to avoid introducing another monitoring component during this focused diagnostic change. Logs are still terminal-only and are not a durable log platform.

Verification completed on 2026-09-30: workspace typechecking and production builds passed, all 10 PostgreSQL integration tests passed, the live API exposed every new metric family, and the provisioned Grafana dashboard loaded all 18 panels. All 29 dashboard PromQL expressions returned successfully. k6 parsed both updated aggressive profiles successfully without executing another high-load run.

## Metrics export — Grafana time ranges can be preserved as experiment evidence

### Summary headline

Every Prometheus query behind the ScaleLab dashboard can now be exported for an exact historical time range.

### Detailed body

The `scripts/export-grafana-range.mjs` utility reads the provisioned Grafana dashboard, discovers each panel target, and sends the same PromQL expressions to Prometheus through its range-query API. It stores panel names, query references, expressions, labels, and all returned timestamp/value samples in one JSON document. The three-second query step matches the configured Prometheus scrape interval, and missing samples are preserved as gaps rather than replaced with invented values.

Use `pnpm metrics:export -- <start-iso> <end-iso> <output-path>` while Prometheus is running. ISO timestamps should contain an explicit UTC offset so the requested browser-local Grafana range is unambiguous. The Prometheus URL defaults to `http://localhost:9090` and can be changed with `PROMETHEUS_URL`.

The first export covers 2026-09-30 20:15:00–20:22:00 Asia/Calcutta (`14:45:00–14:52:00Z`). It is stored at `docs/experiments/results/grafana-2026-09-30_20-15-00_to_20-22-00_IST.json` and contains 29 dashboard queries, 30 returned series, and 3,654 samples. The file was parsed after creation and its first and last samples match the requested endpoints exactly.

Verification on 2026-09-30 also confirmed workspace typechecking, all 10 API integration tests, and both production builds still pass.

This exports the data underlying the provisioned dashboard, not Grafana presentation details such as pixel resolution, tooltip state, or screenshots. Export availability is limited by Prometheus retention, currently configured as seven days.

## Dashboard resolution — Grafana now matches the three-second scrape interval

### Summary headline

Short-range dashboards can use Prometheus's full three-second resolution, while rolling calculations react over 30 seconds instead of one minute.

### Detailed body

The provisioned Prometheus datasource now declares `timeInterval: 3s`, matching `infrastructure/prometheus/prometheus.yml`. Previously this value was omitted, so Grafana used its 15-second Prometheus datasource default even though Prometheus retained samples every three seconds. Grafana may still select a larger query step for long time ranges or narrow panels because it limits results according to panel width and maximum data points.

Every dashboard rate and histogram calculation that previously used `[1m]` now uses `[30s]`. This includes request rate, average/p95/p99 response time, error rate, process CPU, diagnostic failure rates, pool-acquisition time, query execution time, per-operation query p95, 5xx responses, and client aborts. With a three-second scrape interval, a 30-second range normally provides about ten raw samples per calculation. The shorter window reacts faster to spike and recovery behavior but is intentionally less smooth than the former one-minute window.

Point spacing and calculation range remain separate concepts: the datasource interval controls the finest useful Grafana query step, while `[30s]` determines how far each rate or percentile calculation looks backwards. Gauges such as memory, active requests, pool counts, and event-loop lag remain point-in-time samples and were not given an artificial rolling average.

Important files are `infrastructure/grafana/provisioning/datasources/prometheus.yml` and `infrastructure/grafana/dashboards/scalelab-overview.json`. Restart or recreate Grafana with `docker compose restart grafana` after changing datasource provisioning. The dashboard provider detects the dashboard JSON change automatically.

No API metric collection, Prometheus scrape configuration, load-test workload, or application behavior changed.

Verification on 2026-10-01 confirmed the restarted Grafana instance reports datasource interval `3s`, the live dashboard contains all 18 panels, all 18 rolling expressions use `[30s]`, no `[1m]` expression remains, and all 29 dashboard PromQL targets execute successfully. Workspace typechecking, all 10 API integration tests, and both production builds also passed.

## Load-test logging — successful requests no longer write to the terminal

### Summary headline

Normal request traffic is measured through Prometheus without performing a synchronous-looking console write for every completed response.

### Detailed body

The request-context middleware still validates or generates `x-request-id`, returns it to the caller, and adds `x-instance-id`, but it no longer attaches a `finish` listener that serializes and prints every successful request. During aggressive k6 tests, tens of thousands of success logs provided little diagnostic value and created substantial terminal/stdout I/O that could distort the single-instance baseline being measured.

Prometheus request count, status, latency, active-request, abort, pool, query, and process metrics remain unchanged and continue to observe every request. Unexpected application failures still produce the structured `request_failed` error log with request identity, error details, and a pool snapshot. Database pool errors, process warnings, uncaught exceptions, server errors, lifecycle events, and migrations also remain logged. Expected high-volume successes and routine client errors are intentionally silent.

The implementation change is limited to `apps/api/src/middleware/request-context.ts`; no endpoint behavior, response headers, metric, load-test profile, or infrastructure component changed.

Verification on 2026-10-01 confirmed all 10 API integration tests pass without emitting per-request success logs. Workspace typechecking and both production builds also passed.

## Pool experiment — per-instance PostgreSQL capacity increased to 20

### Summary headline

The API's default PostgreSQL connection-pool maximum is now 20 instead of 10 for the next controlled load-test comparison.

### Detailed body

`DATABASE_POOL_MAX` now defaults to `20`, and `.env.example` plus the README configuration table reflect that value. The `pg` pool still creates connections lazily, so starting the API does not immediately open 20 database sessions. It may grow up to 20 only when concurrent database work requires them, and connections that remain unused are still retired according to the existing 30-second idle timeout.

The change is intentionally limited to pool capacity. Connection acquisition timeout remains five seconds, SQL behavior is unchanged, and no application replica or database setting was added. Existing experiment documents retain their recorded pool maximum of 10 because those historical results must continue to describe the configuration that produced them.

Important files are `apps/api/src/config/env.ts`, `.env.example`, and `README.md`. Restart the API before comparing the same load profile against the former ten-connection baseline. During the experiment, compare achieved RPS, response latency, pool total/idle/waiting, acquisition latency, query latency, Node CPU, and PostgreSQL CPU; a larger pool can reduce application-side waiting while increasing database concurrency and resource use.

Verification on 2026-10-01 confirmed the built API resolves `databasePoolMax` to `20`, workspace typechecking passes, all 10 API integration tests pass, and both production builds succeed.

## Pool baseline decision — active configuration standardized on 10

### Summary headline

The active single-instance baseline now consistently uses a PostgreSQL pool maximum of 10.

### Detailed body

The comparison between pool sizes 10 and 20 showed no material throughput improvement from doubling the pool: both remained near 1,050 requests per second, while average and p95 latency were effectively unchanged. The source fallback was already 10; `.env.example` and the README now match it again, and a fresh API build regenerates the runtime output with the same value.

This keeps the lower connection count as the controlled baseline before any horizontal-scaling work. It avoids increasing PostgreSQL concurrency without evidence of a throughput benefit. The pool still creates connections lazily and retires connections after the existing 30-second idle timeout.

Historical experiment records and earlier implementation-log entries continue to mention pool size 20 where relevant because they describe the configuration that was actually tested; they are not active configuration. No endpoint, query, timeout, metric, or infrastructure component changed.

Verification on 2026-10-01 confirmed the freshly built API resolves `databasePoolMax` to `10`, workspace typechecking passes, all 10 API integration tests pass, and both production builds succeed.

## Capacity baseline — constant-arrival-rate boundary measured for one compiled Node process

### Summary headline

The current single-instance application is healthy through 925 RPS, reaches a noisy capacity edge near 950 RPS, and is saturated by 1000 RPS.

### Detailed body

A controlled constant-arrival-rate suite measured the compiled API without changing application behavior. The API ran with `NODE_ENV=production`, `INSTANCE_ID=api-1`, one process, PostgreSQL pool maximum 10, Prometheus metrics enabled, and successful request logging disabled. k6 executed exactly one product-detail GET per iteration for two minutes at each offered rate.

The broad sweep covered 700, 800, 850, 900, 925, 950, 975 and 1000 RPS. Severe overload at 975–1000 made 1050 and 1100 unnecessary under the experiment's stop rule. Fine tests at 955 and 960 localized the transition, and 950 plus 955 were each run three times. The 950-RPS median had zero dropped iterations; the 955-RPS median dropped 115. At 1000 RPS, achieved throughput was about 990 RPS, average latency was 195 ms, p99 was 876 ms, and 745 iterations were dropped.

Saved Prometheus data shows pool acquisition waiting grows much faster than SQL execution time near overload. At 1000 RPS, pool waiters averaged about 207 and peaked at 718, while pool-acquisition p95 was about 555 ms and query p95 about 21 ms. API CPU averaged 92.5% of one core and peaked at 96.5%. PostgreSQL container CPU averaged about 50%, memory remained flat, event-loop lag remained bounded, and Prometheus did not miss a scrape.

`scripts/run-capacity-point.ps1` saves a unique raw k6 summary, manifest, exact-window dashboard export and PostgreSQL Docker-stats stream for one target. `scripts/summarize-capacity-results.mjs` normalizes all saved runs into `docs/experiments/results/capacity/capacity-summary.json`. The complete methodology, every measured point, repeatability results, limitations and bottleneck interpretation are in `docs/experiments/2026-10-01-single-instance-capacity.md`.

The helper scripts affect only experiment execution and result processing. No API source, endpoint, middleware, metric, query, timeout, pool configuration or infrastructure topology was optimized. The recommended next step is a controlled CPU profile at 925–950 RPS before any implementation change or horizontal scaling.

Verification on 2026-10-01 confirmed the compiled API build, API typechecking, all 10 API integration tests, live API/database health, PostgreSQL 16.15 health, Prometheus scrape availability, successful k6 checks, unique non-overwriting result filenames, and aggregation of all 14 measured runs. The suite used Node.js v26.3.0, k6 1.8.1, Docker Desktop 4.76.0, 12 Docker CPUs and 7.468 GiB Docker memory.

## CPU profiling — near-capacity Node work is now measured by function and category

### Summary headline

Built-in Node CPU profiles show that normal HTTP/network and PostgreSQL client work dominate, while custom Prometheus instrumentation is the largest clearly optional application-controlled CPU category at about 8%.

### Detailed body

The compiled single-instance API was profiled during the existing 925 RPS constant-arrival-rate workload with `NODE_ENV=production`, pool maximum 10, one Node process and successful request logging disabled. No application behavior or configuration was changed. A 10 ms sampling interval produced the primary profile with materially less profiler overhead; a separate 1 ms profile provides higher-resolution corroboration. Both were sliced to their exact k6 UTC windows so startup, warm-up and post-run idle samples do not influence the analysis.

The primary profile attributes about 26.5% of active sampled time to Node HTTP/network work, 24.8% to Node-side PostgreSQL client/protocol work, 11.8% to Node runtime scheduling, 10.7% to Express/middleware, 8.4% to V8/native runtime and 7.9% to custom Prometheus instrumentation. ETag hashing is about 2.9%, direct application code 2.4%, JSON serialization 1.0%, request ID/UUID work 0.9%, garbage collection 0.6% and Zod 0.3%. The 1 ms profile produces a closely matching ranking.

`scripts/analyze-cpu-profile.mjs` parses Chrome/Node `.cpuprofile` call trees, aligns samples with an exact capacity-run manifest, distinguishes self from inclusive time, assigns exclusive categories using call-stack context and writes machine-readable JSON. `scripts/summarize-capacity-results.mjs` now excludes manifests explicitly marked invalid. The profiles and analyses are stored under `docs/experiments/results/cpu-profile/`; the full methodology, frame table, category comparison, limitations and decision are in `docs/experiments/2026-10-01-node-cpu-profile.md`.

Profiling affected throughput and latency, as expected. The 10 ms run achieved about 916 RPS with 0% HTTP errors but dropped 0.9% of scheduled iterations; the 1 ms run was more intrusive and is not treated as capacity evidence. The pre-existing unprofiled capacity report remains authoritative for throughput.

The next recommended experiment is exactly one variable: current custom request/pool/query metrics versus benchmark-only no-op custom metrics, while retaining default Node process metrics and `/metrics`. ETag, UUID, Zod, SQL, mapping, middleware and pool size should stay unchanged. This recommendation is based on the profile's repeatable 8% instrumentation share, not merely on the presence of metrics code.

Verification on 2026-10-01 confirmed both profile files parse, the analysis windows match saved run manifests, the two sampling intervals agree on major categories, the primary k6 run completed with 100% checks and no HTTP errors, Prometheus remained available, API typechecking and a fresh build passed, all 10 integration tests passed, and no profiled API process remained running. No optimization, cache, worker, replica or load balancer was introduced.

## Three-instance launch foundation — explicit processes on ports 3101–3103

Added a deliberately transparent way to run three copies of the compiled API before introducing a load balancer. Root commands `api:start:1`, `api:start:2`, and `api:start:3` invoke `scripts/start-api-instance.mjs`, which sets a unique `INSTANCE_ID` and `PORT` before importing the compiled server. The processes use `api-1:3101`, `api-2:3102`, and `api-3:3103`; port 3001 remains reserved for the future public load-balancer endpoint.

Each process retains an independent PostgreSQL pool explicitly capped at 10 by its standard launch command, producing a possible aggregate of 30 application connections. This prevents a stale shell environment value from changing the control unexpectedly. All instances share the same PostgreSQL database. Existing startup migration behavior is safe across concurrent processes because `migration-runner.ts` holds a PostgreSQL advisory lock while inspecting and applying migrations.

Prometheus now has an explicit scrape target for each API port with a low-cardinality `api_instance` target label. Grafana's scrape-availability and scrape-duration legends use that label so individual targets can be distinguished. No load balancer, clustering, containerized API replica, caching, or application behavior change was introduced. The original single-instance `pnpm dev` path remains available for ordinary development, while this Prometheus configuration is now intentionally aligned with the three-instance experiment.

Static configuration validation, API and web typechecking, API and web production builds, and all 10 API integration tests passed. The instance start commands were intentionally not executed; the operator retains control over starting each foreground process.

## Nginx load balancing — one public endpoint fronts three Node processes

### Summary headline

Nginx now listens on port 3001 and distributes requests across `api-1:3101`, `api-2:3102`, and `api-3:3103` using round-robin balancing.

### Detailed body

The new `infrastructure/nginx/nginx.conf` defines the three host-run Node processes as an upstream group. Nginx itself runs as a Compose service because this keeps the proxy configuration reproducible while leaving the Node instances as explicit foreground processes for the scaling experiment. Docker Desktop's `host.docker.internal` address allows the container to reach those processes on Windows.

Upstream HTTP/1.1 connections are retained in a keepalive pool so a new TCP connection is not required for every API request. Nginx forwards host, real-IP, forwarded-for and forwarded-protocol headers. It can retry safe requests after connection failures, timeouts and common gateway failures. Already-sent non-idempotent requests are not opted into retries, avoiding accidental duplicate order creation.

Live dashboard validation exposed that Docker Desktop could resolve `host.docker.internal` to an IPv6 address even though the container network could not route that address, producing intermittent Nginx 502 responses while every Node listener remained healthy. The upstream now uses Docker's `127.0.0.11` resolver with `ipv6=off`, dynamic `resolve` parameters and a shared upstream zone. This makes host routing consistently select the reachable IPv4 gateway.

Port 3001 is the single client-facing endpoint, so the existing Vite proxy and k6 base URL require no change. Prometheus deliberately continues to scrape the three Node metric endpoints directly; routing metric scrapes through Nginx would hide or unevenly sample individual process state. `/nginx-health` verifies the proxy itself, while the existing `/health` route verifies whichever API instance receives the request.

Successful Nginx access logging is disabled to avoid introducing high-volume stdout I/O into benchmarks. Warning and error logs remain enabled. No cache, TLS termination, rate limiting, sticky session, Nginx metrics exporter, containerized API replica, or Kubernetes resource was added.

Root commands now start, stop, validate, reload and verify the load balancer. `scripts/verify-load-balancing.mjs` sends a small deterministic set of health requests through port 3001 and counts the returned `x-instance-id` values, failing unless all three instances respond.

Verification on 2026-10-01 confirmed the Compose model and Nginx syntax are valid, the Nginx container becomes healthy, and 12 sequential requests through port 3001 are distributed 4/4/4 across the three instances. A product-list request through Nginx returned HTTP 200 with both `x-instance-id` and `x-request-id`. After Prometheus reloaded its configuration, all three direct API scrape targets reported `up = 1`.

## Multi-instance dashboard — aggregate capacity and per-process behavior are separated

### Summary headline

Grafana now provides a dedicated multi-instance view that makes Nginx traffic distribution and differences between the three Node processes visible.

### Detailed body

The new provisioned dashboard `infrastructure/grafana/dashboards/scalelab-multi-instance.json` complements rather than replaces the original single-instance baseline dashboard. Its `API instance` variable supports all instances or any selected subset. System-wide stat panels retain total request rate and active work, while per-instance panels group on the existing bounded `instance_id` label.

Traffic panels show requests per second, percentage share, average latency, p95/p99 latency and HTTP error rate for each process. Runtime panels compare CPU, resident memory, event-loop lag and active requests. Database-client panels compare total and idle pool connections, pool waiters, pool-acquisition p95/p99 and query p95/p99. Diagnostic and scrape panels distinguish client aborts, pool timeouts, query failures, target availability and scrape duration by instance.

The architecture panel explains that clients enter through Nginx on port 3001 while Prometheus scrapes ports 3101–3103 directly. This direct scrape topology is required for trustworthy per-process metrics. Traffic share is derived from each API's completed-request counter, so it demonstrates the result of Nginx balancing without adding an Nginx exporter.

No new collector or runtime instrumentation was added. Nginx connection-level metrics remain intentionally unavailable until `stub_status` and an exporter are justified by a separate proxy-focused experiment. The dashboard adds PromQL and presentation only, so API behavior and measurement overhead are unchanged.

Verification on 2026-10-01 confirmed that the dashboard JSON contains 20 panels and one target-derived instance variable, all 25 PromQL expressions execute successfully, Grafana provisions the dashboard under UID `scalelab-multi-instance`, and all three live API scrape targets report `up = 1`. A 12-request round-robin check produced a 4/4/4 split, followed by 300 successful product requests through Nginx. The live check also identified and corrected Docker Desktop's unroutable IPv6 host resolution before completion.

## Multi-instance benchmark routing — k6 now reaches Nginx inside Compose

The first attempted multi-instance capacity rerun showed that a k6 container could not reliably leave Docker through `host.docker.internal:3001` and re-enter Nginx through its published Windows host port. It received immediate connection-refused errors even while the same Nginx endpoint worked from Windows. That interrupted attempt is explicitly marked invalid and is excluded from capacity conclusions.

The k6 service now targets `http://nginx:80`, the Nginx service address on the shared Compose network, and waits for the Nginx health check. This removes the Docker Desktop host-port hairpin while preserving the intended measured path: k6 client, Nginx proxy, one of three host-run API processes, and PostgreSQL. Browser and host-side clients continue using `http://localhost:3001`.

## Multi-instance capacity rerun — 1,000 RPS is healthy and 2,000 RPS collapses

A controlled two-minute constant-arrival-rate comparison used the same three compiled API instances, Nginx configuration, PostgreSQL database and pool maximum of 20 per instance. At 1,000 RPS, k6 completed exactly 120,000 successful requests with no drops, 7.84 ms average latency, 17.21 ms p95 and even 33.3% traffic distribution. Per-instance CPU averaged approximately 38–40%, pool waiters remained effectively zero and query p95 stayed near 7 ms.

At 2,000 offered RPS, k6 completed about 1,803 requests per second but only about 883 successful responses per second. It dropped 23,248 scheduled iterations, reached 3,000 VUs and reported a 51.12% failure rate. Per-instance pool waiters grew into the hundreds with peaks from 931 to 1,720, pool-acquisition rolling p95 averaged 2.07–2.92 seconds and query rolling p95 rose to 74–132 ms. Node CPU stayed below 83% per process and all Prometheus targets remained reachable, ruling out a simple Node CPU crash.

Nginx logged 4,060 upstream connection timeouts, 8,016 temporary upstream-disable events and 110,814 `no live upstreams` responses. That final count exactly matches the k6 failures. The evidence therefore identifies the database/pool path as the primary queueing bottleneck and Nginx's one-second connect timeout plus upstream ejection as an overload amplifier. Full methodology, tables, interpretation and evidence links are in `docs/experiments/2026-10-03-multi-instance-1000-vs-2000.md`.

`scripts/run-multi-instance-point.ps1` now preserves one run's raw k6, Docker and Grafana/Prometheus evidence without overwriting prior results. `scripts/analyze-multi-instance-run.mjs` normalizes it and separates the steady dashboard window from rolling-window warm-up. No application optimization or load-balancer tuning was performed during the comparison.

## Nginx observability and restored aggregate diagnostics

### Summary headline

Grafana now shows Nginx request/connection pressure alongside the per-instance APIs and the aggregate latency, CPU, memory, pool and query panels from the original baseline dashboard.

### Detailed body

Nginx now exposes its lightweight `stub_status` page on an internal-only Compose-network listener at port 8080. The official `nginx/nginx-prometheus-exporter:1.5.1` service translates that page into Prometheus metrics, and Prometheus scrapes it every three seconds under the `scalelab-nginx` job. Neither the status listener nor the exporter is published to the host. Successful access logging remains disabled, so measuring the proxy does not add one stdout write for every benchmark request.

The multi-instance Grafana dashboard adds Nginx exporter/scrape health, requests per second, active connections, reading/writing/keep-alive connection states, accepted-versus-handled connection rates, and a comparison of Nginx intake with requests completed by all API processes. A growing intake/completion gap makes proxy rejection or unfinished downstream work visible during overload, although it is diagnostic rather than an exact error counter because the two independently scraped rolling rates include small health/metrics traffic and requests can cross window boundaries. Open-source Nginx `stub_status` deliberately exposes only aggregate state: it does not report per-upstream health, retry, timeout or temporary-ejection counters. Exact `upstream timed out`, `upstream server temporarily disabled`, and `no live upstreams` evidence therefore remains derived from Nginx warning/error logs for the test's saved UTC window. The multi-instance runner now saves that bounded log as a timestamped result artifact, and its analyzer adds the three event counts to `nginxLogEvents`. Nginx Plus or a separate log-to-metrics pipeline would be required for those events as live dashboard series; neither was introduced here.

The dashboard also restores cross-instance response-time average/p95/p99, total Node CPU and resident memory, aggregate PostgreSQL pool state, aggregate pool-acquisition average/p95/p99, aggregate query average/p95/p99, query p95 by operation, and total 5xx/client-abort/pool-timeout/query-error rates. The existing API selector applies to these totals so all three processes or a chosen subset can be examined consistently.

Important files are `infrastructure/nginx/nginx.conf`, `compose.yaml`, `infrastructure/prometheus/prometheus.yml`, and `infrastructure/grafana/dashboards/scalelab-multi-instance.json`. `pnpm observability:up` starts PostgreSQL, Prometheus and Grafana; `pnpm load-balancer:up` starts or refreshes Nginx and its exporter. The implementation intentionally does not add access-log ingestion, Nginx Plus, caching, rate limiting, or load-balancer policy changes.

Verification on 2026-10-03 confirmed valid Compose, Nginx and dashboard configuration; a healthy exporter and Prometheus target; live `nginx_up`, request, accepted/handled, active and connection-state series; all 56 dashboard PromQL targets executing successfully; and Grafana provisioning all 37 panels. A 120-request proxy check completed successfully and changed the Nginx counters. API/web typechecking, all 10 API integration tests, the API build and the Vite production build passed. The root pnpm wrapper could not be used because its bundled pnpm 11 wanted to purge dependencies installed by the repository's pnpm 10 in a non-interactive shell, so the same package-local TypeScript, tsx and Vite binaries were executed directly without reinstalling dependencies.

## Multi-instance 1,100/1,200 RPS capacity check — sustainable with first warnings at 1,200

Two controlled two-minute constant-arrival-rate experiments used the unchanged three-instance compiled runtime, Nginx proxy, pool maximum 20 per instance and one product-detail query per iteration. Both rates were fully achieved with zero dropped iterations and zero client-visible errors. At 1,100 RPS, average/p95/p99 latency was 8.18/18.16/78.41 ms. At 1,200 RPS, it rose to 10.92/25.01/135.13 ms and the maximum reached 1.01 seconds.

The 1,100-RPS Nginx log contains no upstream failures. At 1,200, Nginx recorded three one-second connection timeouts—two to api-3 and one to api-2—but successfully retried every request. No instance reached the three-failure threshold for temporary exclusion, and there were no `no live upstreams` responses. Per-instance CPU remained below 52%, traffic stayed evenly split, pool waiters showed no sustained queue and all monitoring targets remained healthy. Query and pool-acquisition tails nevertheless rose, so 1,200 RPS is classified as a sustainable warning point rather than a break point.

The full environment, result tables, exact timeout events, metric correlation, interpretation and raw-artifact inventory are recorded in `docs/experiments/2026-10-03-multi-instance-1100-vs-1200.md`. The measured failure boundary is now above 1,200 and at or below the already-observed 2,000-RPS collapse. No runtime, query, pool, timeout or load-balancer policy was changed during these tests.

## Four-minute duration test — upstream variability defeats a simple RPS boundary

The same 1,100 and 1,200 RPS constant-arrival-rate points were repeated for four minutes without changing the application, pool, proxy or workload configuration. Contrary to a monotonic capacity model, 1,100 RPS suffered 2,009 Nginx failures and 1,129 dropped iterations while the subsequent 1,200-RPS run completed all 288,000 requests successfully.

Exact-window logs and three-second metrics establish the order of failure at 1,100 RPS. Initial upstream connection timeouts occurred while all Node CPUs, pool waiters and acquisition times were healthy. A concentrated timeout cluster caused Nginx to temporarily exclude api-1, shifting traffic to the remaining servers. Api-3 then reached 539 pool waiters and 559 active requests, leading to additional timeout/ejection decisions. All three unavailability windows overlapped for about 11 seconds, producing exactly 2,009 `no live upstreams` responses—the same as k6's failed-check count.

The 1,200-RPS run still logged 24 upstream connection timeouts and 11 temporary-disable events, but they were spread across upstreams and time; all retries succeeded and no all-upstreams-down window formed. The non-monotonic outcome identifies local connection-path variability and Nginx passive-ejection amplification rather than a deterministic 1,100-RPS capacity limit. The full comparison and raw evidence inventory are in `docs/experiments/2026-10-03-multi-instance-four-minute-duration.md`. No runtime configuration or policy was modified during either measured run.

## Six-run 1,200-RPS repeatability study — outcomes are bimodal and unstable

Six additional four-minute 1,200-RPS runs produced failure rates from zero to 35.27%, peak active concurrency from 399 to 1,979 VUs and p95 latency from 46.8 ms to 1.01 seconds. Three runs used the timestamped quiet wrapper and three used the standard visible-progress root command. The wrapper artifacts were normalized with the existing analyzer; retained Nginx logs were grouped into exact failure blocks for the plain runs.

For all four failed runs, the number of Nginx `no live upstreams` log entries exactly matches k6's failed checks: 41,549, 91,837, 7,680 and 100,645. The cleanest quiet run records only 26 upstream timeouts and 15 disable messages, maintains low pool-acquisition latency and never loses all upstreams. The failed quiet run proves that terminal rendering is not required for the cascade, although the three visible-progress runs being worse warrants a controlled one-variable quiet/TTY A/B test.

The consolidated methodology, all six k6 outcomes, exact Nginx correlations, wrapper infrastructure metrics and interpretation are documented in `docs/experiments/2026-10-03-1200rps-repeatability.md`. This evidence supersedes any conclusion based on a single 1,200-RPS run: the current local topology is not repeatable enough to declare a trustworthy capacity boundary.

## Container-network API topology — alternate deployment removes the Windows gateway hop

### Summary headline

An alternate Compose topology now runs all three compiled API instances inside Docker and routes Nginx to them through Docker service discovery.

### Detailed body

The existing host-process topology remains intact for A/B comparison. `compose.containerized-apis.yaml` adds `api-1`, `api-2`, and `api-3`, each listening on container-internal port 3000 with a pool maximum of 20 and its existing instance identity. The API ports are deliberately not published to Windows because Nginx and Prometheus reach them by the Docker DNS names `api-1`, `api-2`, and `api-3`. Each API connects to PostgreSQL at `postgres:5432`; the Windows-only PostgreSQL mapping remains `localhost:5433`.

`apps/api/Dockerfile` builds TypeScript in a pinned Node 26.3.0 Alpine image and runs compiled `dist/server.js` with production dependencies and `NODE_ENV=production`. The database migrations are included in the runtime image. Existing advisory locking makes simultaneous migration startup safe. `.dockerignore` excludes dependency, build, Git, environment, log and benchmark-result data from the image build context.

The alternate Nginx configuration replaces `host.docker.internal:3101-3103` with `api-1:3000`, `api-2:3000`, and `api-3:3000`, while retaining the same round-robin, keepalive, timeout, retry and passive-health behavior. The alternate Prometheus configuration likewise scrapes each API over the Compose network. Grafana queries and instance labels do not change.

Root commands `pnpm topology:containers:up`, `pnpm topology:containers:down`, and `pnpm topology:host:restore` switch between the experimental container topology and the original host topology without deleting persistent database, Prometheus or Grafana volumes. `scripts/run-containerized-multi-instance-point.ps1` runs the same constant-arrival-rate workload while collecting k6 output, bounded Nginx logs, Prometheus data and Docker CPU/memory statistics for Nginx, PostgreSQL and all three API containers.

The two visible Nginx-named containers are intentional: `system-design-lab-nginx-1` is the reverse proxy, while `system-design-lab-nginx-exporter-1` only translates the internal Nginx `stub_status` page into Prometheus metrics. It does not accept application traffic or load balance requests.

This experiment changes both the network path and the API runtime from Windows to a Linux container. A performance difference therefore measures the combined placement/runtime effect; it cannot by itself attribute every change exclusively to `host.docker.internal`. No application behavior, database query, pool size, load-balancing policy, caching or horizontal orchestration technology was changed.

Verification on 2026-10-03 confirmed that the merged Compose model is valid, the pinned Node 26.3.0 image builds successfully, all three API containers become healthy, and Nginx configuration validation succeeds. Twelve health requests through port 3001 were distributed 4/4/4. Prometheus reported the three active container targets healthy. A five-second 20-RPS runner smoke test completed 101 requests with no errors and saved k6, Nginx, Prometheus and per-container Docker-stat artifacts. API/web typechecking and production builds passed, as did all 10 API integration tests. The root pnpm wrapper still cannot run under Codex's non-interactive bundled-pnpm environment without attempting a dependency purge, so package-local binaries were used without modifying installed dependencies.

After the first three full container-network runs, the runner was hardened against stopped or recreated containers. It now refuses to begin unless all five measured services are already running and samples Docker statistics by stable Compose container name rather than an initial container ID. This prevents an Nginx stop/start or recreation from silently producing an empty Docker-stat file. The third 1,200-RPS run retained complete Prometheus data but has no usable Docker-stat samples because it exposed this collector limitation.

Three user-run four-minute 1,200-RPS experiments then established a repeatable healthy result: all sustained the full offered rate with zero drops and errors, median average/p95/p99 latency of 5.92/17.74/71.39 ms, even 400-RPS distribution per API, zero pool waiters and 100% scrape availability. No upstream timeout, passive disable or `no live upstreams` event occurred. The full measurements, limitations and comparison with the unstable Windows-host route are recorded in `docs/experiments/2026-10-03-container-network-repeatability.md`.

## Nginx overload stabilization — `least_conn` helps, but does not remove the capacity knee

### Summary headline

Three isolated Nginx profiles and a 1,900/2,000/2,200-RPS sweep show that load-aware balancing improves resilience, while aggressive timeout/retry tuning only creates longer overload queues.

### Detailed body

The API server now accepts explicit `SERVER_KEEP_ALIVE_TIMEOUT_MS` and `SERVER_HEADERS_TIMEOUT_MS` settings. Three opt-in Compose overlays mount experiment-specific Nginx configurations: profile A changes passive-failure and retry behavior, profile B additionally aligns Nginx and Node connection lifetimes, and profile C additionally uses `least_conn`. The containerized point runner accepts an experiment name, records it in filenames and manifests, and discovers the one-off k6 container so generator CPU and memory are captured alongside Nginx, PostgreSQL, and the APIs.

At 2,000 RPS, profiles A and B failed 34.31% and 35.30% of requests, dropped 39,179 and 45,272 scheduled iterations, and exhausted 4,000 VUs. Profile C reduced failures to 2.63%, dropped 1,847 iterations, and peaked at 2,222 VUs. Keep-alive alignment alone did not explain the change; `least_conn` is the tested feature most strongly associated with the improvement.

Profile C completed 1,900 RPS with zero errors or drops, but Node CPU averaged about 86.7% per process and pool waiters already peaked at 97. At 2,000 RPS, failures began and pool-acquisition rolling p95 reached roughly 161-170 ms while query rolling p95 stayed near 45-46 ms. At 2,200 RPS, failures reached 13.51%, 10,566 iterations were dropped, p95 latency exceeded four seconds, and k6 exhausted all 4,000 VUs. Nginx recorded 42,126 upstream timeouts, 41,938 temporary disables and 61,688 `no live upstreams` events, even though every API remained scrapeable.

The experiment identifies 1,900 RPS as the highest healthy tested rate, approximately 2,000 RPS as the knee, and 2,200 RPS as clear overload. Database-pool acquisition is the primary queueing signal; Nginx's passive-health behavior remains a secondary failure amplifier. The full methodology, tables, limitations, interpretation, and artifact prefixes are in `docs/experiments/2026-10-04-nginx-overload-stabilization.md`. No Redis, cache, pool-size, business-logic, or horizontal-topology change was made.

## Repository cleanup — one Docker topology and one load-test path

### Summary headline

ScaleLab now has one supported Compose stack, one Nginx configuration, one Prometheus configuration, one Grafana dashboard, and one capacity workload.

### Detailed body

The earlier repository deliberately retained host-run APIs, containerized APIs, Nginx experiment overlays, three load-test styles, and several collection/analysis scripts while the architecture was being explored. Those alternatives made the selected design difficult to explain. The supported topology is now encoded directly in `compose.yaml`: a containerized React build, Nginx, three compiled API containers, PostgreSQL, Prometheus, Grafana, the Nginx exporter, and an opt-in k6 tool container.

The chosen `least_conn` policy, passive-health settings, upstream keep-alive settings, and Docker service names now live in the sole `infrastructure/nginx/nginx.conf`. Prometheus uses the sole `infrastructure/prometheus/prometheus.yml` and scrapes all three API service names directly. The old host-process topology, Compose overlays, experimental Nginx profiles, host-target Prometheus configuration, and single-instance Grafana dashboard were removed from the active repository.

The web application now has a small multi-stage Dockerfile. Vite builds the static assets with the public API URL, and BusyBox serves them without introducing a second custom web-server configuration. API ports remain internal; browser and k6 traffic enter through Nginx on port 3001.

Load testing now uses only `load-tests/capacity.js`, the constant-arrival-rate product-detail workload used for current capacity work. `scripts/run-load-test.ps1` only validates that the five required services are running, passes four understandable parameters to k6, and saves a timestamped summary. Earlier profiling, export, topology-switching, and analysis helpers were removed. Historical reports and raw evidence remain under `docs/experiments/` because they explain why the selected configuration exists, but they are not runtime choices.

Root commands were reduced to `pnpm stack:up`, `pnpm stack:down`, `pnpm stack:logs`, `pnpm load:test`, `pnpm typecheck`, `pnpm test`, and `pnpm build`. `README.md` now documents only this path. No Redis or other future-milestone technology was added during the cleanup.

Verification rebuilt the complete Docker stack from the single Compose file. The web container returned HTTP 200, nine health requests were distributed 3/3/3 across the APIs, all three Prometheus API targets reported up, and Nginx configuration validation succeeded. A three-second 5-RPS smoke test completed 15/15 requests without errors and verified the simplified wrapper; its temporary result was removed afterward. Both TypeScript applications passed typechecking, all 10 API integration tests passed, and the API plus Vite production builds succeeded inside their Docker build stages. Codex's bundled pnpm 11 could not run the root pnpm wrappers without trying to replace the repository's pnpm 10 installation in a non-interactive shell, so verification used the project-local binaries and the pinned pnpm 10 Docker builds without modifying dependencies.
