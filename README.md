# ScaleLab

ScaleLab is a small flash-sale system used to observe how an application behaves under load.

The repository intentionally supports one runtime topology:

```text
React web app :5174
        |
        v
Nginx :3001
        |
        +----> api-1 ----+
        +----> api-2 ----+----> Shared Redis
        +----> api-3 ----+       |           |
                         rate-limit       product cache
                          counters            |
                                             miss
                                               v
                                          PostgreSQL

Prometheus :9090 ---> API and Nginx metrics
Grafana    :3002 ---> Prometheus
k6                  ---> Nginx
```

All runtime services run in Docker. The three APIs use the same compiled image and differ only by `INSTANCE_ID`. Nginx uses `least_conn`, each API has a PostgreSQL pool maximum of 20 connections, and every API uses the same Redis service for caching and distributed rate-limit state.

## Requirements

- Docker Desktop with Docker Compose
- Node.js 20+ and pnpm 10+ for repository checks

## Run the system

```powershell
pnpm install
pnpm stack:up
```

Open:

- Web: http://localhost:5174
- API through Nginx: http://localhost:3001
- Health: http://localhost:3001/health
- Prometheus: http://localhost:9090
- Grafana: http://localhost:3002 (`admin` / `admin`)

The API containers apply pending migrations and seed products during startup. PostgreSQL, Prometheus, and Grafana use named volumes, so `pnpm stack:down` does not erase their data.

## Commands

```powershell
pnpm stack:up       # Build and start the complete Docker stack
pnpm stack:down     # Stop the stack and preserve named volumes
pnpm stack:logs     # Follow container logs
pnpm load:test -- -TargetRps 1900 -Duration 4m -PreAllocatedVUs 1500 -MaxVUs 4000
pnpm load:suite     # Run 2500, 3000, and 3500 RPS with 60-second recovery intervals
pnpm load:rate-limit # Verify allowed traffic and intentional HTTP 429 responses
pnpm typecheck
pnpm test
pnpm build
```

The load-test command runs the single read-only capacity workload and writes a timestamped k6 summary under `docs/experiments/results/`. Change only the four command parameters when testing another load level. Grafana retains the detailed API, Nginx, process, query, and pool metrics.

The load-suite command calls that same workload three times using a four-minute duration, 2,000 preallocated VUs, and a 6,000 VU maximum. It continues after a failed run so all three points are attempted, then prints a pass/fail table and returns a failing exit code if any point failed.

Rate limiting is enabled by default. The dedicated rate-limit workload sends 1,000 RPS for 30 seconds and treats both HTTP 200 and intentional HTTP 429 responses as expected. To measure unthrottled application capacity, recreate the API containers with the limiter disabled:

```powershell
$env:RATE_LIMIT_ENABLED = "false"
pnpm stack:up
pnpm load:test -- -TargetRps 3000 -Duration 4m -PreAllocatedVUs 2000 -MaxVUs 6000

# Restore normal protection afterward.
Remove-Item Env:RATE_LIMIT_ENABLED
pnpm stack:up
```

## Important files

```text
compose.yaml                         complete runtime topology
infrastructure/nginx/nginx.conf      only Nginx configuration
infrastructure/prometheus/           only Prometheus configuration
infrastructure/grafana/              one provisioned dashboard
load-tests/capacity.js               unthrottled capacity workload
load-tests/rate-limit.js             distributed limiter verification workload
scripts/run-load-test.ps1            small load-test command wrapper
apps/api/                             Express application
apps/web/                             React application
docs/experiments/                     historical experiment reports
```

Historical reports remain because they explain how the current topology was selected. Their alternative runtime configurations and helper scripts are intentionally not retained as supported paths.

## API

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `GET` | `/health` | Verify API, database, and instance identity |
| `GET` | `/metrics` | Prometheus application, process, and pool metrics |
| `GET` | `/api/products` | List products and current stock |
| `GET` | `/api/products/:id` | Get one product |
| `POST` | `/api/orders` | Create an order and atomically reduce stock |
| `GET` | `/api/orders/:id` | Get one order |

Every response includes `x-request-id` and `x-instance-id`. Successful `/metrics` and ordinary 2xx requests are not written to the terminal during load tests. Errors and important lifecycle events remain logged.

## Configuration decisions

- Nginx is the only public API entry point.
- API container ports are not published to Windows.
- Prometheus scrapes each API directly on the Docker network for per-instance metrics.
- k6 calls `http://nginx:80` inside Docker.
- PostgreSQL port `5433` is published only for local database inspection and integration tests.
- The React build calls the public Nginx endpoint at `http://localhost:3001/api`.
- Nginx access logs are disabled so successful-request I/O does not contaminate benchmarks.
- Product reads use a 30-second cache-aside Redis entry.
- A committed order invalidates the affected product and product-list cache keys.
- Redis is disposable cache state and deliberately has no persistent volume.
- The shared API quota is 500 requests per second per client IP.
- `POST /api/orders` additionally allows 5 attempts per 10 seconds per client IP.
- `/health`, `/metrics`, and CORS preflight traffic do not consume quota.
- Limiter store failures fail open and are exposed through logs, metrics, and health state.
- Nginx overwrites `X-Forwarded-For`; Express trusts exactly that one proxy hop.
