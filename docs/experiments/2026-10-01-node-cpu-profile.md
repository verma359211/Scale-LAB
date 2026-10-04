# Single-instance Node CPU profile — 2026-10-01

## Summary headline

Near the single-process capacity boundary, CPU is distributed mainly across Node HTTP/network output, PostgreSQL client/protocol work, Node runtime scheduling and Express; custom Prometheus instrumentation is the largest clearly optional application-controlled category at about 8% of active sampled time.

## Environment

- Git commit: `be2cd4044110253834d702a87786cc97493c648b`, with pre-existing uncommitted workspace changes.
- Node.js: `v26.3.0`.
- Runtime: freshly compiled JavaScript, not `tsx watch`, Vite or `pnpm dev`.
- API configuration: `NODE_ENV=production`, `DATABASE_POOL_MAX=10`, `INSTANCE_ID=api-1`, one process on port 3001.
- Successful request logging: disabled; exceptional/lifecycle logging remained enabled.
- Workload endpoint: `GET /api/products/:id`, one PostgreSQL query per request.
- Resolved packages visible in the profile: Express 5.2.1, `pg` 8.23.0, `prom-client` 15.1.3 and Zod 4.6.5.
- Infrastructure: PostgreSQL 16.15, Prometheus 3.5.0, Grafana 12.1.1 and k6 1.8.1 under Docker Desktop 4.76.0.
- No application behavior, middleware, metric, query, index, pool setting or infrastructure topology was changed.

## Profiling method

Node's built-in V8 CPU profiler recorded the compiled API. A generated sentinel file stopped the wrapper only after k6 and its metric export finished; `process.exit(0)` allowed Node to flush the profile reliably on Windows.

The primary command was equivalent to:

```powershell
node --cpu-prof `
  --cpu-prof-interval=10000 `
  --cpu-prof-dir=../../docs/experiments/results/cpu-profile `
  --cpu-prof-name=cpu-profile-925rps-pool10-10ms-20261001-190119.cpuprofile `
  -e "start the compiled server; exit when the experiment sentinel exists"
```

The 10 ms sampling interval was selected after a valid 1 ms profile proved too intrusive for this Windows/Docker workload. It retained 11,409 samples in the exact measured interval while reducing profiler overhead. The primary profile covers 200.513 seconds total; machine analysis slices only the k6 window from `2026-10-01T13:32:27.6589877Z` to `2026-10-01T13:34:30.1657600Z`, representing 122.508 seconds, about 92.87 seconds of non-idle sampled main-isolate time and 11,409 samples.

A separate 1 ms corroborating profile retained 77,855 samples inside its measured interval. Its category distribution is close to the primary profile, but its workload reached the k6 VU ceiling and is not used for capacity interpretation.

Profile wall-clock slicing uses the `.cpuprofile` modification time as the process-exit anchor because the built-in format stores monotonic timestamps rather than UTC timestamps. Self time is assigned to the sampled leaf frame. Inclusive time includes descendants and therefore overlaps across frames; inclusive percentages must not be added together.

## Workload and supporting metrics

The API received a 10-second, 200 RPS unmeasured warm-up, followed by the existing two-minute constant-arrival-rate scenario at 925 requested RPS. Each iteration made exactly one product-detail request without `sleep()`.

| Metric | Profiled 925 RPS run |
|---|---:|
| Achieved RPS | 916.46 |
| HTTP requests / iterations | 109,996 |
| Dropped iterations | 1,004 (0.905%) |
| HTTP errors | 0% |
| Average latency | 147.79 ms |
| p95 / p99 latency | 740.54 / 1,005.40 ms |
| API CPU average / maximum | 80.89% / 90.68% of one core |
| Event-loop lag average / p99 / maximum | 5.25 / 17.17 / 18.05 ms |
| Pool waiters average / maximum | 135.58 / 802 |
| Rolling pool-acquisition p95 average | 297.20 ms |
| Rolling query-execution p95 average | 14.87 ms |
| PostgreSQL container CPU average / maximum | 42.34% / 59.63% |
| Prometheus scrape availability | 100% |

The profiled run is deliberately not a replacement capacity result. The unprofiled 925 RPS baseline had no drops and much lower latency. Profiling overhead created pool-queue bursts and scheduling loss even with the 10 ms interval. The profile is used only for CPU distribution.

The 1 ms profile achieved 867.63 RPS, dropped 6.19%, reached 1,500 VUs and produced much worse latency. It is retained only because its function/category shares independently corroborate the lower-overhead profile.

## Top CPU frames

Percentages use non-idle sampled main-isolate time from the primary 10 ms profile.

| Rank | Function/module | Self CPU | Total CPU | Source/file | Category |
|---:|---|---:|---:|---|---|
| 1 | `writev` | 13.84% | 13.84% | native HTTP-response write path | Node HTTP/network |
| 2 | `writev` | 11.21% | 11.21% | native PostgreSQL socket context | PostgreSQL/pg |
| 3 | `(program)` | 6.47% | 6.47% | native/V8 unattributed program frame | V8/runtime |
| 4 | `nextTick` | 4.28% | 4.58% | `node:internal/process/task_queues:113` | Node runtime |
| 5 | `addFields` | 2.86% | 3.10% | `pg/lib/result.js:82` | PostgreSQL/pg |
| 6 | histogram update closure | 2.19% | 2.65% | `prom-client/lib/histogram.js:232` | Prometheus |
| 7 | `handle` | 1.76% | 14.15% | `express/lib/application.js:152` | Express |
| 8 | `parseDate` | 1.56% | 1.72% | `postgres-date/index.js:8` | PostgreSQL/pg |
| 9 | `runMicrotasks` | 1.45% | 53.85% | native microtask execution | V8/runtime |
| 10 | histogram observe closure | 1.35% | 4.55% | `prom-client/lib/histogram.js:182` | Prometheus |
| 11 | `Hash` | 1.31% | 1.42% | `node:internal/crypto/hash:90` | ETag |
| 12 | `mapProduct` | 1.24% | 1.24% | `apps/api/dist/modules/products/product.repository.js:1` | Application |
| 13 | `checkInvalidHeaderChar` | 1.11% | 1.18% | `node:_http_common:281` | Node HTTP |
| 14 | `emit` | 1.09% | 30.22% | `node:events:456` | Node runtime |
| 15 | `setHeader` | 1.02% | 2.87% | `node:_http_outgoing:674` | Node HTTP |
| 16 | Express `stringify` | 0.99% | 0.99% | `express/lib/response.js:1029` | JSON serialization |
| 17 | `writevGeneric` | 0.87% | 16.73% | `node:internal/stream_base_commons:121` | Node HTTP/network |
| 18 | `utf8Slice` | 0.72% | 0.72% | native, PostgreSQL parsing context | PostgreSQL/pg |
| 19 | `routeLabel` | 0.69% | 0.71% | `apps/api/dist/observability/metrics.js:2` | Prometheus |
| 20 | `digest` | 0.69% | 0.69% | `node:internal/crypto/hash:152` | ETag |

`runMicrotasks`, `emit`, Express `handle`, route handlers and metric wrapper functions have large inclusive percentages because they contain downstream asynchronous work. Their self percentages—not their inclusive percentages—represent direct CPU cost.

## CPU by category

The categories are exclusive leaf-sample estimates, so each profile column sums to approximately 100% of active sampled time. Native frames are attributed using their nearest meaningful call-stack context—for example, separate native `writev` samples occur on the HTTP response and PostgreSQL socket paths.

| Category | Primary 10 ms | Corroborating 1 ms | Interpretation |
|---|---:|---:|---|
| Node HTTP/network | 26.53% | 26.91% | Parsing requests, headers, response/socket writes |
| PostgreSQL/pg | 24.82% | 22.99% | Socket writes, result construction, protocol/date parsing, pool/client work |
| Node runtime | 11.77% | 12.54% | Ticks, events, timers and task scheduling |
| Express/middleware | 10.68% | 10.07% | Application dispatch, router traversal, response helpers and content handling |
| V8/native runtime | 8.38% | 7.77% | Program/native frames and microtask machinery |
| Prometheus/prom-client | 7.92% | 8.31% | Histograms, counters, gauges, labels, timers and route-label work |
| ETag | 2.93% | 3.29% | SHA-1 response-body hashing performed by Express's ETag path |
| Application code | 2.42% | 2.50% | Repository/route work, including product mapping |
| Other dependencies | 1.77% | 2.10% | Small framework/client dependencies |
| JSON serialization | 0.99% | 1.18% | Express response stringify |
| UUID/request ID crypto | 0.86% | 0.88% | Request-context work and UUID generation |
| Garbage collection | 0.60% | 1.08% | V8 garbage collector |
| Zod | 0.32% | 0.37% | Product ID coercion and validation |

The two sampling intervals agree closely on every major category. This reduces the likelihood that the main conclusion is a sampling artifact.

## Specific hot-path findings

### Prometheus instrumentation

Custom observability accounts for about 7.9% of active sampled time in the primary profile. The largest direct frames are:

- histogram bucket/update closures: 2.19% and 1.35% self;
- `routeLabel`: 0.69%;
- metric value updates (`setValueDelta`): about 0.46%;
- high-resolution timer reads: about 0.46%;
- label hashing: about 0.29%;
- counter updates: about 0.25%;
- label validation: about 0.23%;
- `observePoolAcquire`: about 0.22% self;
- `observeQuery`: about 0.19% self.

The request path starts three custom timers/measurements for this endpoint: HTTP duration, pool acquisition and SQL execution. It also updates the active gauge and completed-request counter. The profile supports a meaningful aggregate cost, but no single metric helper alone dominates the process.

### Express and HTTP

Express/middleware consumes about 10.7% directly, while Node HTTP/network work consumes about 26.5%. Router matching and dispatch are visible, as are header parsing/validation, response helpers and native writes. Express `handle` has 1.76% self CPU; its 14.15% inclusive value includes downstream middleware and must not be interpreted as Express overhead alone.

The largest single sampled frame is the native HTTP-context `writev` at 13.84%. This is normal response/network machinery rather than an application helper that can simply be removed.

### PostgreSQL client

The `pg` path accounts for about 24.8%:

- PostgreSQL-context native `writev`: 11.21%;
- `Result.addFields`: 2.86%;
- date parsing: 1.56%;
- UTF-8 slicing: 0.72%;
- remaining pool, client, protocol parser, buffer and callback work is spread across smaller frames.

This is client-side CPU for one query and one result per request, not PostgreSQL server CPU. Existing metrics show SQL execution p95 remained about 15 ms while pool acquisition was far larger under profiler-induced pressure. Waiting for a pool client consumes wall time but is not itself the dominant CPU frame.

### Application-specific work

Direct ScaleLab application code is only about 2.4%. `mapProduct` is the largest application helper at 1.24%, mainly converting the numeric price and PostgreSQL date into API fields. The repository and route functions have large inclusive time because they await database and response work, but low self time.

Request-context/UUID work is about 0.86%. `serializeUUID` itself is about 0.2%; the rest includes request ID checking and response-header setup. Zod validation is only about 0.32%.

### Response generation

JSON serialization is about 0.99%, so response size/stringification is not the current dominant cost. Express ETag generation is more visible at about 2.93%, primarily `Hash`, `digest`, `update` and `createHash`. This is a real secondary candidate, but it is smaller than custom metrics instrumentation.

### Runtime and allocation

Garbage collection is 0.60% in the primary profile and 1.08% in the higher-resolution profile. Memory allocation/GC pressure is therefore not a primary explanation for the CPU ceiling. Node ticks/events and V8/native machinery are collectively significant but distributed across normal runtime work.

No `tsx`, Vite, TypeScript execution, source-map support or other development runtime frame appears in either analyzed profile.

## Request hot-path interpretation

```text
k6 / Docker Desktop network
→ Node HTTP parser and header processing                 (~26.5% HTTP/network category overall)
→ request ID middleware                                 (~0.9% UUID/request-ID category)
→ Prometheus HTTP middleware and timer start
→ CORS + Express JSON/content checks + router dispatch  (~10.7% Express category)
→ Zod product-ID parsing                                (~0.3%)
→ repository getById
→ pool acquisition instrumentation
→ pg pool/client + PostgreSQL protocol/socket path      (~24.8%)
→ row/result construction + date parsing
→ mapProduct                                             (~1.2% self)
→ Express response.json
→ JSON stringify                                         (~1.0%)
→ ETag body hashing                                      (~2.9%)
→ HTTP header serialization and socket write
→ response finish metrics: counter, histogram, gauge
```

Percentages describe exclusive sampled CPU categories, not sequential wall-clock proportions. Pool waits and network waits can greatly increase latency without consuming equivalent CPU.

## Important negative findings

- No single ScaleLab business function dominates CPU.
- Zod is insignificant at about 0.3%; removing correctness checks is unsupported.
- JSON serialization is about 1%; payload serialization is not the primary bottleneck.
- UUID/request ID work is below 1%; requiring caller IDs is not justified by this profile.
- GC is around 0.6–1.1%; there is no evidence of a GC-bound server.
- `mapProduct` is measurable at about 1.2%, but too small to explain the current ceiling by itself.
- PostgreSQL server CPU remains unsaturated; the substantial `pg` share is Node-side protocol/socket/result processing.
- Development tooling does not contaminate the runtime profile.
- ETag hashing is non-trivial at roughly 3%, but still below custom metrics overhead.

## Primary optimization candidate

The strongest avoidable candidate is custom per-request and per-query Prometheus instrumentation. It consistently consumes about 8% of active sampled time across both profiles, and the current endpoint performs multiple histogram, counter, gauge, label and timer operations for every request.

This does not mean metrics should simply be removed. It means instrumentation is large enough to justify one controlled measurement before touching Express, SQL, validation or business code.

## Exactly one next A/B experiment

Run **current custom metrics versus a benchmark-only no-op implementation of custom hot-path metrics**, while retaining Node's default process metrics and a working `/metrics` endpoint in both variants.

Keep every other variable fixed:

- compiled Node, one process;
- pool maximum 10;
- 925 RPS constant-arrival-rate for two minutes;
- same PostgreSQL/container topology;
- same middleware, ETag, UUID, Zod, query, mapping and response behavior;
- three runs per variant, alternating A/B order to reduce local-host drift.

In variant B, only custom request/pool/query counters, gauges and histograms become no-ops; `observePoolAcquire` and `observeQuery` still call the same supplied functions, and default process metrics remain available for CPU comparison.

Compare median API CPU, achieved RPS, dropped percentage, p95/p99 latency, event-loop lag, pool waiters and query latency across repetitions. The hypothesis is confirmed only if the no-op variant reduces CPU and scheduling loss beyond the existing run-to-run noise. Do not infer an 8% throughput gain directly from the profile percentage.

No ETag, UUID, Zod, SQL or framework change should be combined with this experiment.

## Saved evidence

### Primary profile

- `docs/experiments/results/cpu-profile/cpu-profile-925rps-pool10-10ms-20261001-190119.cpuprofile`
- SHA-256: `4B2A182A7E1B4AC163E36848ED611C7DEC6249E7CBBF6D6156B047B50A9865D1`
- `docs/experiments/results/cpu-profile/cpu-profile-925rps-pool10-10ms-20261001-190119-analysis.json`
- SHA-256: `7C03810C7E2808CB2FF62E70EB2EBA97E9E39D38C380E41A008C49458BFD1ACB`
- Supporting k6/Prometheus/Docker artifacts use the prefix `capacity-925rps-pool10-node-dist-cpu-profile-10ms-valid-20261001-190227`.

### Corroborating high-resolution profile

- `docs/experiments/results/cpu-profile/cpu-profile-925rps-pool10-20261001-185008.cpuprofile`
- SHA-256: `EF4DD4B2845C9D4B716C2D561C10AAB0F5D11EAEFF41F4E490431A4DE36F5DD6`
- `docs/experiments/results/cpu-profile/cpu-profile-925rps-pool10-20261001-185008-analysis.json`
- Supporting k6/Prometheus/Docker artifacts use the prefix `capacity-925rps-pool10-node-dist-cpu-profile-valid-20261001-185117`.

The earlier timed-shutdown load attempt is preserved but explicitly marked `valid: false` in its manifest because the API stopped before k6 completed. It has no `.cpuprofile` and contributes to no conclusion or aggregate.

## Verification

- Both `.cpuprofile` files parse as valid JSON and contain sampled call trees.
- Analysis was limited to each exact k6 UTC window rather than startup/warm-up/idle time.
- Category shares sum to approximately 100% of active sampled main-isolate time.
- Independent 1 ms and 10 ms profiles produce similar category rankings and percentages.
- The primary k6 run completed its full two-minute schedule with 100% successful checks and 0% HTTP errors.
- Prometheus remained available throughout the primary run.
- The API process exited after profile flush; no profiled API instance remains running.
- API typechecking, a fresh compiled build and all 10 integration tests passed after profiling.

No application optimization or scaling change was implemented.
