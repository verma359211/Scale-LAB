# ScaleLab

**Send real traffic. Watch a real system respond.**

ScaleLab is a small ecommerce app and an interactive system-design lab. Run a controlled experiment and watch traffic, latency, CPU and Kubernetes replica counts change together.

[Live demo](https://scalelab.chandanverma.space) · [Store](https://scalelab.chandanverma.space/store) · [Architecture and experiments](docs/ROADMAP.md)

## What you can explore

- Kubernetes autoscaling from 2 to 6 API pods.
- Redis product caching and distributed rate limiting.
- PostgreSQL transactions, stock contention and two-shard routing.
- Read-only and mixed read/write k6 workloads, with real Prometheus measurements.
- A dashboard that coordinates experiments through a private load-generator controller.

The live site uses a separate Civo load-generator VM. Local performance depends on your laptop and Docker allocation; it is not a cloud capacity benchmark.

## Run the app on your own machine

### Requirements

- Git and Docker Desktop running with Linux containers.
- Node.js 22.12+ and pnpm 10.15.1 for workspace commands/checks. Container builds use the versions in the Dockerfiles.
- PowerShell for the provided experiment/Kubernetes runner scripts. Basic Docker Compose commands also work on Linux/macOS.

Install pnpm if needed:

```sh
npm install --global pnpm@10.15.1
```

### Quick start: local Store and monitoring

```sh
git clone --depth 1 https://github.com/verma359211/Scale-LAB.git system-design-lab
cd system-design-lab
pnpm install
pnpm stack:up
```

The shallow clone skips old raw-capture history; omit `--depth 1` if you need the full history.

This builds the web/API images and starts **three fixed API containers**, Nginx, Redis, one PostgreSQL database, Prometheus and Grafana. Migrations and product seeds run automatically. No cloud credentials or `.env` file are required for this local development setup.

| Open | Address |
| --- | --- |
| Store | http://localhost:5174/store |
| Products API | http://localhost:3001/api/products |
| API/database health | http://localhost:3001/health |
| Grafana | http://localhost:3002 |
| Prometheus | http://localhost:9090 |

Grafana's **local-only** login is `admin` / `admin`; PostgreSQL's **local-only** database/user/password are `scalelab`, published on localhost port `5433`. These are public demo defaults, not deployment secrets. Published Compose ports bind to loopback. Never reuse these credentials for an exposed deployment.

**The full live experiment dashboard is not a turnkey part of this Compose stack.** The web image contains it at `/`, but its `/lab-api` controller and external generator are not started by Compose. Use `/store` for this quick start and Grafana for local monitoring. Missing dashboard telemetry/control services are not a failed Store installation. Do not point a local controller at the public load generator.

```sh
pnpm stack:logs
pnpm stack:down
```

Stopping Compose preserves named database/monitoring volumes. `docker compose down -v` deletes them; use it only when intentionally resetting local data.

### Optional: local Kubernetes and HPA

Enable Kubernetes in Docker Desktop, install `kubectl`, and run from PowerShell:

```powershell
kubectl config use-context docker-desktop
kubectl config current-context  # Must be docker-desktop, not Civo
pnpm stack:down                # Avoid competing ports/resources
pnpm k8s:build
pnpm k8s:up
kubectl wait --for=condition=Ready pods --all -n scalelab --timeout=5m
pnpm k8s:status
kubectl top pods -n scalelab
```

Open http://localhost/store (ingress), http://localhost:3002 (Grafana) and http://localhost:9090 (Prometheus). The first start downloads ingress-nginx and supporting images. Kubernetes has **two PostgreSQL shards**, Redis and a 2–6 replica CPU-based HPA. Local Adminer is at http://localhost:8081; use server `postgres` or `postgres-shard-1` with the local database credentials above.

The local Kubernetes manifests deploy the Store/API/monitoring stack and Kubernetes k6 Jobs. The cloud dashboard controllers/private VM require the separate configuration described below. CPU requests/limits and HPA targets are experimental inputs, not recommended production defaults.

`pnpm k8s:down` removes local Kubernetes namespaces and can delete database volumes. Confirm the context first and back up any data you need.

## Tests and development

```sh
pnpm typecheck
pnpm build
pnpm --filter @system-design/web test
pnpm --filter @system-design/lab-controller test
pnpm --filter @system-design/loadgen-controller test
```

The API integration tests need a reachable local PostgreSQL database. With the Compose database running, its default localhost connection works:

```sh
pnpm --filter @system-design/api test
# Or run every workspace test:
pnpm test
```

Tests create isolated schemas. Do not set their `DATABASE_URL` to a production database.

For frontend editing, run `pnpm --filter @system-design/web dev`. Vite proxies `/api` to localhost:3001 and `/lab-api` to localhost:4000. The latter needs a separately configured lab controller. The API uses `tsx watch` during development; benchmark compiled JavaScript/container images instead.

## Run a small local workload

With Compose running, from PowerShell:

```powershell
pnpm load:test -- -TargetRps 20 -Duration 30s -PreAllocatedVUs 20 -MaxVUs 100
```

This read-only test targets Nginx inside Docker. Rate limiting is enabled by default in Compose, so high single-client traffic may intentionally receive 429 responses. `pnpm load:rate-limit` tests that policy separately. `pnpm load:suite` is a heavier repeatability experiment; inspect its configured rates before using it.

For the local Kubernetes topology:

```powershell
pnpm k8s:watch
# In another terminal:
pnpm k8s:load
# Stop its traffic explicitly; Ctrl+C only detaches the log stream:
pnpm k8s:load:stop
```

Read the workload before running it: the default Kubernetes experiment is substantially larger than the small Compose smoke test. Never run tests against someone else's system.

Other scripts in `load-tests/` cover static capacity, autoscaling ramps, spikes, mixed traffic and rate limiting. `BASE_URL`, RPS/duration and VU settings are configurable; inspect each script for its exact inputs. Writes use benchmark products **10001–10100**. Kubernetes write runners reset those products before a run; `pnpm k8s:write:reset` resets benchmark data afterwards. That command acts on the current Kubernetes context and also clears disposable Redis cache state.

Generated results go to `docs/experiments/results/`, which is intentionally ignored. Historical reports remain in [docs/experiments](docs/experiments); old raw captures remain only on the original operator's disk or in Git history.

## How it works

```text
Browser / k6 → ingress / Nginx → Node.js + Express API
                                      ├── Redis: product cache and shared quotas
                                      └── PostgreSQL: products, orders and stock

Prometheus → API/Kubernetes/exporter measurements → Grafana + ScaleLab dashboard
Dashboard → lab-controller → private loadgen-controller → isolated k6 container
```

- **Reads:** cache-aside product lookup; a miss queries PostgreSQL and fills Redis.
- **Writes:** stock reservation and order creation commit in one database transaction. A committed order invalidates product/list caches.
- **Sharding:** Kubernetes routes a product by `productId % 2`; lists and UUID-only order lookups scatter across shards. Compose deliberately uses one database as an earlier baseline.
- **Scaling:** HPA watches CPU relative to a 250m request, with a 70% target and 2–6 replicas. A pod must become Ready before receiving traffic. For the demo, scale-down uses a 30-second stabilization window and removes at most one pod per 15 seconds; actual timing depends on CPU recommendations and metric updates. Each Kubernetes API pool allows 10 connections.
- **Observability:** bounded-label request/latency metrics, process/event-loop metrics, pool acquisition/waiting and query diagnostics. Request IDs remain in headers/logs, not metric labels.
- **Experiment controls:** fixed target, a script allowlist, one active run, resource/duration validation, private generator authentication and benchmark cleanup. Public controls are intentionally shared; disable them with `PUBLIC_CONTROLS_ENABLED=false` when unattended.

The cloud dashboard's status light indicates fresh Ready-pod telemetry, not a complete cluster health check. History gaps and unavailable metrics are shown explicitly.

### API

| Method | Endpoint | Purpose |
| --- | --- | --- |
| GET | `/api/products` | Customer product list |
| GET | `/api/products/:id` | Product detail |
| POST | `/api/orders` | `{ "userId": "demo-user", "productId": 1, "quantity": 1 }` |
| GET | `/api/orders/:id` | Order detail |
| GET | `/health` | API, database/shard and Redis health |
| GET | `/live`, `/ready` | Process liveness / traffic readiness |
| GET | `/metrics` | Prometheus exposition (internal in cloud) |

Responses include `x-request-id` and `x-instance-id`. Routine successful request logs are suppressed to avoid terminal overhead during benchmarks; errors and lifecycle events remain.

### Repository map

```text
apps/api/                  Express API, migrations, caching, sharding, metrics
apps/web/                  React/Vite Store and experiment dashboard
apps/lab-controller/       Public dashboard API, metrics queries and run lifecycle
apps/loadgen-controller/   Private VM controller that launches k6 containers
infrastructure/kubernetes/ Local manifests; civo/ contains cloud-specific resources
infrastructure/load-generator/ Private VM Compose setup and environment template
infrastructure/{nginx,prometheus,grafana}/ Fixed-instance local monitoring
load-tests/                k6 workloads and benchmark reset SQL
scripts/                   Current local/experiment PowerShell runners
docs/                      Design decisions, release reports and experiments
```

Local Kubernetes and Civo manifests are intentionally separate: localhost exposure/development credentials differ from cloud ClusterIP, TLS and storage. They are not interchangeable profiles.

## Deploying your own cloud dashboard

Start with [the deployment guide](docs/scalelab-finalization-deployment.md), [load-generator setup](infrastructure/load-generator/README.md) and [release report](docs/scalelab-live-deployment-report.md). Use your own registry tags, domain, cluster, private VM and credentials. Those guides describe ScaleLab's deployment, not a one-command installer for a new provider.

The Civo database manifest now **references an existing private `postgres` Secret** instead of creating credentials in Git. Required keys and the pre-push checklist are in [Repository hygiene](docs/REPOSITORY_HYGIENE.md). Never copy a Civo kubeconfig, production environment file or token into this repository. Do not apply Civo manifests to Docker Desktop or local manifests to Civo.

## Common pitfalls

| Symptom | Check / fix |
| --- | --- |
| Docker pipe/daemon error | Start Docker Desktop, wait for its Linux engine, then retry. |
| Port already allocated | Check 3001, 3002, 5174, 5433 and 9090. Stop the competing local stack; don't change PostgreSQL's internal port. |
| Missing `esbuild` / `rollup` | Run `pnpm install --frozen-lockfile`; if the install is damaged, `pnpm install --force`. Keep the lockfile and use a supported Node version. |
| Dashboard cannot reach `/lab-api` locally | Compose/local Kubernetes do not install the cloud controller workflow. Use `/store` and Grafana, or configure your own controllers. |
| Some local metrics are unavailable | Kubernetes-specific queries require Kubernetes/exporters. Idle cache ratios/quantiles may have no samples; missing is not zero. |
| HPA shows `<unknown>` | Confirm `kubectl top pods` works and Metrics Server is Ready. Scaling waits for metrics and pod readiness. |
| New local image doesn't appear | Rebuild with `pnpm k8s:build`, then restart the local web/API Deployment using the docker-desktop context. |
| 429s during load | Check rate-limit policy before treating intentional rejection as a server failure. |
| k6 still runs after Ctrl+C | Delete the relevant Job with `pnpm k8s:load:stop` or `pnpm k8s:write:stop`. |
| Cloud Postgres mount has `lost+found` | The Civo manifest sets `PGDATA` to a subdirectory. Preserve PVCs and inspect logs before deleting anything. |
| `git status` reports dubious ownership | Verify the directory owner; trust only this exact checkout if appropriate, never every repository globally. |

Before pushing, use the [cleanup/security checklist](docs/REPOSITORY_HYGIENE.md). Removing a file in a new commit does not remove it from old Git history or revoke credentials.
