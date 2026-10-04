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
        +----> api-2 ----+----> PostgreSQL
        +----> api-3 ----+

Prometheus :9090 ---> API and Nginx metrics
Grafana    :3002 ---> Prometheus
k6                  ---> Nginx
```

All runtime services run in Docker. The three APIs use the same compiled image and differ only by `INSTANCE_ID`. Nginx uses `least_conn`, and each API has a PostgreSQL pool maximum of 20 connections.

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
pnpm typecheck
pnpm test
pnpm build
```

The load-test command runs the single read-only capacity workload and writes a timestamped k6 summary under `docs/experiments/results/`. Change only the four command parameters when testing another load level. Grafana retains the detailed API, Nginx, process, query, and pool metrics.

## Important files

```text
compose.yaml                         complete runtime topology
infrastructure/nginx/nginx.conf      only Nginx configuration
infrastructure/prometheus/           only Prometheus configuration
infrastructure/grafana/              one provisioned dashboard
load-tests/capacity.js               only k6 workload
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
