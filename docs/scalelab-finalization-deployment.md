# Finalization release and verification

The finalization release was deployed on 2026-10-29 as
`finalization-v1-20261029-55889ae2`. See `scalelab-live-deployment-report.md` for
observed results, digests, private backup paths and rollback instructions.
The baseline was web `civo-v8`, lab-controller `civo-v6`, and load-generator
`civo-v4`. The commands below remain the procedure for a future release: always
choose a NEW unused immutable tag. Heavy capacity benchmarks remain unexecuted.

## Changes and contracts

- `/` and `/scalelab` render the same dashboard; `/store` renders the Store.
  Existing SPA fallback, `/api`, `/lab-api`, production host and TLS are preserved.
- `GET /lab-api/config` returns the three authoritative presets, whether controls
  are enabled, and actual generator defaults/budgets (null if unavailable).
- `POST /lab-api/runs` accepts either `{ "preset": "autoscaling" }`,
  `{ "preset": "spike" }`, `{ "preset": "throughput" }`, or the existing custom
  request with optional `preAllocatedVUs` and `maxVUs`. Preset overrides are rejected.
- RPS is an integer >=50 within JavaScript's safe integer range. No 5,000-RPS
  ceiling remains. Duration stays 30s–10m. Mixed percentages must total 100.
- Generator defaults are 500 preallocated / 4,000 maximum VUs, independent of RPS.
  Advanced Mode may override VUs within the configured budget. Invalid or
  over-budget settings fail explicitly; rates or VUs are never silently clamped.
  Run state includes the effective VUs and Docker budgets.
- Five ramp plateaus at 25/40/60/80/100% of target, with four 1s transitions,
  exactly fill the selected duration. Autoscaling preset: 4,000 RPS peak, 10m.
  Spike preset: 400 → 4,000 → 400 RPS, 4m. Throughput: 4,000 RPS, 4m, 70/30 mixed.
  No specific achieved RPS, latency or replica count is promised.
- `GET /lab-api/metrics/timeseries?window=5` or `window=10` queries a complete
  Prometheus range at 3s steps. Frontend refreshes ranges every 6s and summary/run
  state every 3s. Server caches ranges for 5s and summary for 3s across visitors.
  Pod CPU uses `pod` and actual CPU requests; HTTP pod series use `api_instance`
  as defined by the existing discovery relabeling. Missing values remain absent.
- k6 live output is a bounded snapshot, separate from compact run-state polling.
  Raw output and Advanced Mode are initially collapsed. Existing 128KiB per-stream
  tail limits remain; collapsing does not delete any retained output. Final
  summaries, successful orders, read/write counts, cleanup errors and endedAt
  semantics remain supported.

## Required runtime configuration

Lab-controller ConfigMap additions:

| Variable | Civo value / purpose |
| --- | --- |
| `PUBLIC_CONTROLS_ENABLED` | `true`; set `false` when unattended |
| `PUBLIC_ORIGIN` | `https://scalelab.chandanverma.space` |
| `KUBERNETES_WARMUP_ENABLED` | `true` in Kubernetes, omitted/false locally |

Keep `LOADGEN_CONTROL_TOKEN` and `BENCHMARK_RESET_TOKEN` secret references
unchanged. No browser token or secret build argument is introduced. For a local
Vite operator session, set `PUBLIC_ORIGIN` to its exact origin, e.g.
`http://localhost:5173`; production must keep the HTTPS domain.

VM `.env` additions (defaults shown; choose budgets suitable for the actual VM):

```dotenv
LOAD_TESTS_HOST_DIR=/home/civo/scalelab-loadtest
K6_PREALLOCATED_VUS=500
K6_MAX_VUS=4000
K6_VU_BUDGET=4000
K6_CPUS=2
K6_MEMORY=2g
K6_PIDS_LIMIT=256
```

Keep the EXISTING `LOADGEN_CONTROL_TOKEN` privately in that file. Set
`LOADGEN_CONTROLLER_IMAGE` to the newly published controller image. The updated
Compose file resolves it without rebuilding on the VM. The controller still
binds only to 192.168.1.8:4100 and mounts tests read-only. Its child k6 container
receives CPU, memory and PID limits, never the Docker socket. A watchdog asks for
stop at duration+60s and force-removes that one named test container at +90s if
it is still present. If Docker is unavailable, the UI must not claim it stopped.
Resource limits change benchmark conditions: record them with new results.

## Warm-up behavior and permissions

The fixed warm-up target is min(5, current HPA max), never above six. The service
records the original HPA minimum, target and absolute 15-minute expiry in the
HPA annotation `scalelab.chandanverma.space/warmup-lease`, then changes only
`minReplicas`. It checks Deployment observed generation, ready, available and
updated replica counts. It does not manufacture readiness from desired replicas.

Repeated clicks reuse the existing lease without extending expiry. Failure to
reach readiness within 3 minutes restores the minimum. Explicit restore and
test completion also restore it. Rollback preserves an externally changed HPA
minimum. HPA scale-down still takes its normal stabilization time; restoring
the minimum does not instantly terminate pods.

`warmup-rbac.yaml` supplies separate ServiceAccounts. Both identities may get
and patch only HPA `scalelab-api` in namespace `scalelab`; only the main controller
may get Deployment `scalelab-api`. Neither may list or mutate arbitrary workloads.
Kubernetes RBAC restricts the object, not individual patch fields; the application
only exposes the fixed preparation/restore operations.

The controller polls recovery every 10s. `warmup-recovery.yaml` adds a separate
CronJob every minute, using the same NEW lab-controller image and recovery entry
point. It restores expired/unready leases if the controller has stopped. Deploy
this worker before enabling warm-up. Recovery depends on Kubernetes scheduling
and API availability, so an API/cluster outage can delay restoration.

## Release sequence — run only after approval

First confirm no test or benchmark cleanup is active. Existing in-memory run
coordination does not resume an interrupted cleanup after controller replacement;
drain the run and verify no orphaned `scalelab.role=load-test` container on the VM.

From the repository root in PowerShell, choose an UNUSED tag:

```powershell
$ReleaseTag = Read-Host 'Enter a new immutable release tag'
docker build --platform linux/amd64 -t "verma17/scalelab-web:$ReleaseTag" -f apps/web/Dockerfile .
docker build --platform linux/amd64 -t "verma17/scalelab-lab-controller:$ReleaseTag" -f apps/lab-controller/Dockerfile .
docker build --platform linux/amd64 -t "verma17/scalelab-loadgen-controller:$ReleaseTag" -f apps/loadgen-controller/Dockerfile .
docker push "verma17/scalelab-web:$ReleaseTag"
docker push "verma17/scalelab-lab-controller:$ReleaseTag"
docker push "verma17/scalelab-loadgen-controller:$ReleaseTag"
```

API, Redis, PostgreSQL, ingress, Prometheus and Grafana images do not need changes.
Copy the updated VM files; this does not require a repository checkout there:

```powershell
scp infrastructure/load-generator/compose.yaml civo@212.2.253.119:/home/civo/scalelab-loadgen/compose.yaml
scp load-tests/static-capacity.js load-tests/autoscaling-ramp.js load-tests/spike.js load-tests/mixed-load.js civo@212.2.253.119:/home/civo/scalelab-loadtest/
scp load-tests/lib/product-read.js civo@212.2.253.119:/home/civo/scalelab-loadtest/lib/product-read.js
```

On the VM, edit the existing `.env` privately: retain its token, add the budgets
above, and set `LOADGEN_CONTROLLER_IMAGE=verma17/scalelab-loadgen-controller:`
followed by the chosen tag. Do not print the `.env` or container environment.

```bash
cd /home/civo/scalelab-loadgen
docker compose config --quiet
docker compose pull controller
docker compose up -d controller
docker compose ps
curl --fail http://192.168.1.8:4100/live
```

In the repository, change ONLY the image references in these release manifests
to the chosen tags before applying:

- `civo/lab-controller.yaml`: `verma17/scalelab-lab-controller:` + chosen tag.
- `civo/warmup-recovery.yaml`: same lab-controller image (must include recovery command).
- `civo/web.yaml`: `verma17/scalelab-web:` + chosen tag.

Use an explicitly selected Civo context; do not accidentally apply to Docker Desktop:

```powershell
$CivoContext = Read-Host 'Enter your existing Civo kubectl context name'
kubectl --context $CivoContext apply -f infrastructure/kubernetes/civo/warmup-rbac.yaml
kubectl --context $CivoContext apply -f infrastructure/kubernetes/civo/warmup-recovery.yaml
kubectl --context $CivoContext apply -f infrastructure/kubernetes/civo/lab-controller.yaml
kubectl --context $CivoContext -n scalelab rollout status deployment/lab-controller --timeout=180s
kubectl --context $CivoContext -n scalelab get cronjob warmup-recovery
kubectl --context $CivoContext apply -f infrastructure/kubernetes/civo/web.yaml
kubectl --context $CivoContext -n scalelab rollout status deployment/scalelab-web --timeout=180s
```

The existing HPA manifest remains unchanged. Check that it is present with the
expected 2/6 baseline before testing. This release does not reapply it during an
active warm-up, which would interfere with the persisted lease.

Verify browser root, Store, alias, `/api/products`, `/health`, `/lab-api/config`,
five/ten-minute history and per-pod series. Then, with approval, exercise warm-up,
readiness, restore, expiry/recovery, and one small test including a stop. Only then
approve heavier capacity tests. Check `kubectl -n scalelab get pods,hpa` and
`kubectl -n scalelab get jobs` with your explicit context during live verification.

## Public-access risk and limitations

There is no visitor identity or ownership. Anyone reaching public controls can
start an allowed test, stop a run, reset benchmark data or request the bounded
warm-up. Origin checks prevent unrelated browser origins; they are not
authentication and non-browser clients can bypass them. Repeated allowed runs
can still consume VM, Kubernetes, database, network and cloud budget.

Safeguards are fixed HTTPS target/scripts, one active generator run, serial
controller mutations, 30s run/reset cooldowns, 60s preparation cooldown, bounded
duration, explicit VU/container budgets, automatic benchmark cleanup, HPA max,
and expiring preparation. Public-control disable blocks new starts/resets/warm-up
but allows stop and restore. Restrict public access or add visitor authorization
before operating this unattended for a broader audience.

Console buffers and run/cleanup coordination remain in memory. Controller restart
can lose run ownership/cleanup tracking; inspect and stop orphaned k6 containers
before replacing it, then perform the fixed benchmark reset if needed. Warm-up
lease recovery is persistent and independent, but is not a general run-recovery
system. No new performance numbers were measured during implementation.
