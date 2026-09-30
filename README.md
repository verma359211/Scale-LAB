# ScaleLab

ScaleLab is a deliberately small flash-sale application that will be evolved through later system-design milestones. Milestone 2 measures the single Express instance with Prometheus, Grafana, and repeatable k6 workloads before any scaling technology is introduced.

## Requirements

- Node.js 20+
- pnpm 10+
- Docker with Docker Compose

## Run locally

```bash
pnpm install
pnpm observability:up
pnpm dev
```

The API waits briefly for PostgreSQL, applies pending migrations, seeds the initial products, and then starts accepting requests.

- Web: http://localhost:5174
- API: http://localhost:3001
- Health: http://localhost:3001/health
- Metrics: http://localhost:3001/metrics
- Prometheus: http://localhost:9090
- Grafana: http://localhost:3002 (`admin` / `admin`, local development only)

Stop the applications with `Ctrl+C`, then stop PostgreSQL with:

```bash
docker compose down
```

The named Docker volume keeps products, orders, and stock when the API or PostgreSQL container restarts. Use `docker compose down -v` only when you intentionally want to erase local database data.

## Commands

```bash
pnpm dev          # Start web and API development servers
pnpm db:up        # Start PostgreSQL and wait until it is healthy
pnpm db:down      # Stop PostgreSQL and preserve its volume
pnpm db:migrate   # Apply pending database migrations manually
pnpm observability:up    # Start PostgreSQL, Prometheus, and Grafana
pnpm observability:down  # Stop Prometheus and Grafana; preserve their data
pnpm load:baseline       # Run the light, read-only baseline workload
pnpm load:ramp           # Gradually increase read traffic
pnpm load:spike          # Run the flash-sale traffic spike
pnpm typecheck    # Type-check every workspace package
pnpm test         # Run tests (PostgreSQL must be running)
pnpm build        # Build every workspace package
```

## Environment

Defaults work with the included Compose service. Copy `.env.example` only when you need to customize them.

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `3001` | API HTTP port |
| `CLIENT_ORIGIN` | `http://localhost:5174` | Allowed browser origin |
| `DATABASE_URL` | `postgresql://scalelab:scalelab@localhost:5433/scalelab` | PostgreSQL connection string; port 5433 avoids common local PostgreSQL conflicts |
| `DATABASE_POOL_MAX` | `10` | Maximum connections in the API pool |
| `INSTANCE_ID` | `api-1` | Identity returned and logged by this API process |

## API

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `GET` | `/health` | Verify API, database, and instance identity |
| `GET` | `/metrics` | Prometheus-format application, process, and pool metrics |
| `GET` | `/api/products` | List flash-sale products and current stock |
| `GET` | `/api/products/:id` | Get one product |
| `POST` | `/api/orders` | Create an order and atomically reduce stock |
| `GET` | `/api/orders/:id` | Get one persisted order |

Every response includes `x-request-id` and `x-instance-id`. Every completed API request writes one JSON log record with the request ID, instance ID, status, path, and latency.

## Observability and load testing

Start the API with `pnpm dev` before running a load command. Grafana automatically provisions the **ScaleLab Milestone 2 Baseline** dashboard and Prometheus datasource. Its panels cover traffic, latency percentiles, errors, in-flight requests, Node.js CPU/memory/event-loop lag, and PostgreSQL pool state.

k6 runs in Docker, calls the host API at port 3001, and writes machine-readable summaries to `docs/experiments/results/`. All three workloads are read-only and can be repeated without consuming product stock. The baseline is intentionally light; ramp and spike are aggressive failure-seeking profiles that reach 2,000 requested iterations/second. Watch local CPU and memory while running them. Workload values can be adjusted with environment variables defined in each script.
