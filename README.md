# ScaleLab

ScaleLab is a small flash-sale system used to observe how an application behaves under load.

The current milestone runs the application in local Kubernetes:

```text
Browser / k6
     |
     v
ingress-nginx (Layer 7)
     |
     v
Kubernetes Service
     |
     +----> API pod 1 ----+
     +----> API pod 2 ----+----> Redis ----> PostgreSQL
     +----> API pod 3...   |
              ^            |
              +--- HPA ----+

Prometheus :9090 ---> API pods, Kubernetes and HPA metrics
Grafana    :3002 ---> Prometheus
```

The HPA starts with two API pods and can scale to six based on average CPU utilization. The earlier fixed three-instance Docker Compose topology remains in `compose.yaml` as the pre-Kubernetes baseline.

## Requirements

- Docker Desktop with Kubernetes enabled
- `kubectl` using the `docker-desktop` context
- Internet access on the first `k8s:up` so the pinned ingress-nginx controller can be installed
- Node.js 20+ and pnpm 10+ for repository checks

## Run the Kubernetes system

```powershell
pnpm install
pnpm stack:down
kubectl config use-context docker-desktop
pnpm k8s:build
pnpm k8s:up
kubectl wait --for=condition=Ready pods --all -n scalelab --timeout=5m
```

`stack:down` prevents the earlier Compose services from competing for ports 3001, 3002, 5174, and 9090. The first Kubernetes start downloads the container images and may take several minutes.

Open:

- Application through ingress-nginx: http://localhost
- API through ingress-nginx: http://localhost/api/products
- Health through ingress-nginx: http://localhost/health
- Direct web Service for debugging: http://localhost:5174
- Direct API Service for debugging: http://localhost:3001
- Database viewer: http://localhost:8081
- Prometheus: http://localhost:9090
- Grafana: http://localhost:3002 (`admin` / `admin`)

Docker Desktop exposes `LoadBalancer` services on localhost. The API pods apply pending migrations and seed products during startup. PostgreSQL uses a Kubernetes persistent volume, and its migration advisory lock makes simultaneous pod startup safe.

Adminer is a local development tool and is deliberately kept outside the public application Ingress. Sign in with PostgreSQL server `postgres`, username `scalelab`, password `scalelab`, and database `scalelab`. It provides a convenient view of the `products`, `orders`, and `schema_migrations` tables. Do not expose this development configuration publicly.

Confirm that resource metrics and the HPA are working:

```powershell
kubectl top pods -n scalelab
kubectl get hpa -n scalelab
pnpm k8s:status
```

## Commands

```powershell
pnpm k8s:build      # Build the local API and web images
pnpm k8s:up         # Apply the complete local Kubernetes stack
pnpm k8s:status     # Show pods, services and the HPA
pnpm k8s:watch      # Watch pods appear/disappear and HPA decisions
pnpm k8s:load       # Run the staged autoscaling workload
pnpm k8s:load:stop  # Stop the in-cluster k6 Job
pnpm k8s:down       # Remove the namespace and its local Kubernetes data
pnpm typecheck
pnpm test
pnpm build
```

Run `pnpm k8s:watch` in one terminal and `pnpm k8s:load` in another. The read-only workload enters through ingress-nginx with normal HTTP keep-alive, then gradually moves through 300, 1,200, 2,200 and 3,000 RPS before cooling down. Its k6 summary and Kubernetes event list are saved under `docs/experiments/results/`. Grafana retains API, HPA, PostgreSQL, Redis and ingress time series.

`Ctrl+C` only detaches the local log stream because k6 runs as a Kubernetes Job. Use `pnpm k8s:load:stop` to terminate the Job and stop its traffic early.

The Kubernetes profile uses `DATABASE_POOL_MAX=10`, so six API pods can create at most 60 application connections. It starts with 250m CPU requested, 500m limited, 256 MiB memory requested, 512 MiB limited, and a 70% HPA CPU target. These are experiment inputs, not production recommendations.

Rate limiting is deliberately disabled in the Kubernetes capacity profile so one k6 pod can drive enough accepted traffic to exercise the HPA. Redis caching remains enabled. Distributed rate limiting should be tested separately with multiple client pods; otherwise one source IP receives only one shared quota.

## Previous fixed-instance baseline

The Compose stack is preserved for reproducing the earlier three-instance/Nginx experiments:

```powershell
pnpm stack:up
pnpm stack:down
```

Do not run Compose and Kubernetes simultaneously because both publish the same local ports.

`pnpm k8s:down` is a full local teardown: deleting the `scalelab` namespace also deletes its Kubernetes PostgreSQL volume. Ordinary pod restarts and HPA scaling preserve database data.

## Important files

```text
compose.yaml                         previous fixed-instance baseline
infrastructure/kubernetes/           local Kubernetes topology and HPA
infrastructure/kubernetes/ingress.yaml HTTP routes into the web and API Services
infrastructure/kubernetes/adminer.yaml local PostgreSQL browser on port 8081
infrastructure/nginx/nginx.conf      only Nginx configuration
infrastructure/prometheus/           only Prometheus configuration
infrastructure/grafana/              one provisioned dashboard
scripts/run-kubernetes-load-test.ps1 Kubernetes k6 runner and result copy
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
| `GET` | `/live` | Kubernetes process liveness |
| `GET` | `/ready` | Kubernetes traffic readiness |
| `GET` | `/metrics` | Prometheus application, process, and pool metrics |
| `GET` | `/api/products` | List products and current stock |
| `GET` | `/api/products/:id` | Get one product |
| `POST` | `/api/orders` | Create an order and atomically reduce stock |
| `GET` | `/api/orders/:id` | Get one order |

Every response includes `x-request-id` and `x-instance-id`. Successful `/metrics` and ordinary 2xx requests are not written to the terminal during load tests. Errors and important lifecycle events remain logged.

## Configuration decisions

- ingress-nginx is the Layer 7 entry point. It keeps client connections independent from its changing set of Ready API backends.
- The ScaleLab `Ingress` sends `/api` and `/health` to the API Service and `/` to the web Service.
- Prometheus discovers and scrapes every API pod instead of relying on fixed instance names.
- The k6 Job calls the ingress-nginx controller Service entirely inside the cluster and keeps HTTP connections open.
- PostgreSQL and Redis are cluster-internal Services and expose no Windows ports.
- Every pod receives its own pod name as `INSTANCE_ID` through the Downward API.
- The API Deployment starts at two replicas and the CPU HPA may select two through six.
- Each API requests 250m CPU; the 70% target therefore represents 175m average CPU per pod.
- Kubernetes API pools are limited to 10 connections per pod.
- Product reads use a 30-second cache-aside Redis entry.
- A committed order invalidates the affected product and product-list cache keys.
- Redis is disposable cache state and deliberately has no persistent volume.
- Rate limiting is off only for this single-client capacity experiment; the Compose baseline retains the reviewed distributed policy.
- Metrics Server uses insecure kubelet TLS only because this is a local Docker Desktop cluster.
