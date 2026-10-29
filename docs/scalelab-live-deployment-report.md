# ScaleLab finalization deployment — 2026-10-29

## Visitor experience follow-up — deployed 2026-10-29

Release `visitor-v1-20261029-4b7d92c1` is now the web and lab-controller release;
the recovery CronJob uses the same controller image. The earlier sections below
remain the historical finalization rollout, not the current image references.

| Image | Published digest |
| --- | --- |
| `verma17/scalelab-web:visitor-v1-20261029-4b7d92c1` | `sha256:41596dd20e96627c5482875640011a3982691d4616dfd9d2f6fb59372c02109b` |
| `verma17/scalelab-lab-controller:visitor-v1-20261029-4b7d92c1` | `sha256:81f6e54bc6a266af5d84a87326637ddceda521e311c0ebcc977c80e39bd3f0ea` |

Both linux/amd64 builds/pushes passed. Server-dry-run specs were compared
structurally against live resources: only the Deployment/CronJob images differed;
Services and controller ConfigMap were unchanged. Windows kubectl diff lacked
a working external diff command, so structural equality was used instead.
Controller and web rollouts succeeded. A transient ingress 503 immediately after
the Recreate controller rollout cleared; subsequent public checks all returned 200.
VM generator stays on `finalization-v1-20261029-55889ae2`, API stays `civo-v2`.
No VM scripts, budgets, secrets, RBAC, HPA, ingress or database changes deployed.

Presets are now autoscaling 150s, spike 75s and 70/30 mixed throughput 90s,
all with 4,000 peak/target RPS. Default autoscaling remains selected. Browser
verification confirmed collapsed Advanced Options, unchecked warm/custom options,
warm-start leaving the preset selected and showing its warning, custom fields,
actual progress/results, retained collapsed console, and three Store products.
The warm-start smoke was started with the actual dashboard button, using a
custom static read workload; no order writes/reset were performed.

| Verification | Normal read smoke | Warm-start read smoke |
| --- | --- | --- |
| Run ID | `3cb3c401` | `5ebc10ad` |
| Offered rate / workload duration | 50 RPS / 30s | 50 RPS / 60s |
| Completed requests | 1,501 | 3,001 |
| Achieved RPS | 50.024711 | 50.011077 |
| HTTP failures | 0% | 0% |
| p95 / p99 | 6.46ms / 7.21ms | 6.83ms / 7.9ms |
| HPA | min2, no lease throughout | min2 -> min5 -> min2, lease cleared |

Warm workflow preparation: `07:56:10.180Z`; actual five-pod readiness confirmed
`07:56:21.604Z`; Starting k6 `07:56:21.619Z`; k6 exit `07:57:22.398Z`;
restoration began `07:57:22.883Z` and completed `07:57:22.899Z`, followed by
Test completed at the same final endedAt. The browser initially showed 2/5 Ready,
then Kubernetes inspection confirmed five Ready/available pods during the test.
The complete workflow lasted about 73s, including preparation and restoration.

Final checks: min2/max6, CPU target70%, current=desired=Ready=2; no lease,
active test, cleanup or orphaned k6 container. Recovery CronJob unsuspended,
latest Job Complete. Real 5/10-minute ranges return 101/201 replica points at 3s
steps and five historical per-pod CPU/RPS series. `/`, `/store`, `/scalelab`,
`/health` and `/api/products` return 200. Existing HTTPS/Store/API routing works.

Private rollback snapshot (outside Git):
`C:\Users\verma\Desktop\.scalelab-deployment-backups\visitor-v1-20261029-4b7d92c1\kubernetes-baseline.json`.
To roll back, drain a workflow/release its lease first, restore web/controller
image references to `finalization-v1-20261029-55889ae2` in web.yaml,
lab-controller.yaml and warmup-recovery.yaml, then apply those three files using
the explicit Civo kubeconfig/context/namespace and wait for both Deployments.
No VM rollback or storage/Secret deletion is required.

Local checks: workspace typecheck/build, 38 lab-controller, 15 load-generator
and 8 frontend tests pass. Full presets, heavy loads, forced live failures and
live mixed cleanup were not executed. They remain unverified in this release;
unit tests cover failure/cancel/expiry/cleanup. Public-control resource abuse and
in-memory workflow restart limitations remain. Raw smoke evidence and screenshot
are ignored in `docs/experiments/results/visitor-*`; no benchmark claim beyond
the actual small smoke measurements is made.

## Execution checklist

- [x] Read deployment guide, finalization plan and implementation log; preserve dirty tree.
- [x] Verify explicit Civo kubeconfig/context, namespace and healthy baseline.
- [x] Verify no active test, pending cleanup, warm-up lease or k6 container.
- [x] Docker daemon, Hub cached login, linux/amd64 builder and SSH access work.
- [x] Capture rollback snapshots/back up VM Compose, scripts and private `.env`.
- [x] Verify unused tag; build all three images; publish all three and record digests.
- [x] Deploy VM controller; verify image, private binding, limits, health and idle state.
- [x] Apply scoped RBAC and recovery CronJob, then lab-controller and web.
- [x] Verify routing, presets, Advanced Mode, console, real telemetry and per-pod metrics.
- [x] Exercise warm-up/readiness/restore; verify recovery Job health and scoped permissions.
- [x] Run approved read-only 50-RPS/30s smoke test, then a small stop test if needed.
- [x] Verify final HPA baseline, no lease/tests/orphans; update final results and rollback.

## Verified environment

Kubeconfig: `C:\Users\verma\Downloads\civo-scalelab-kubeconfig`.
Every kubectl call uses this explicit file and context `scalelab`.
Cluster endpoint: `https://212.2.251.184:6443`; namespace `scalelab`.
Docker Server 29.8.2; cached Docker Hub login `verma17` succeeded.
Buildx `desktop-linux` supports linux/amd64. Existing kubeconfig/SSH credentials
are used; no secrets are copied into this report or build arguments.

VM: `civo@212.2.253.119`, private controller `192.168.1.8:4100`.
Compose service `controller`, container `scalelab-loadgen-controller`.
VM has 8 logical CPUs and 30,598 MiB RAM; existing `.env` is owner civo, mode 600.
Verified directories `/home/civo/scalelab-loadgen` and `/home/civo/scalelab-loadtest`.

## Baseline and rollback

| Component | Baseline image | Deployment revision | Ready |
| --- | --- | --- | --- |
| scalelab-web | verma17/scalelab-web:civo-v8 | 8 | 1/1 |
| lab-controller | verma17/scalelab-lab-controller:civo-v6 | 6 | 1/1 |
| scalelab-api | verma17/scalelab-api:civo-v2 | 3 | 2/2 |
| VM controller | verma17/scalelab-loadgen-controller:civo-v4 | Compose | healthy |

PostgreSQL shards, Redis, both PostgreSQL exporters, Redis exporter, Prometheus,
Grafana and kube-state-metrics are Ready. `/health` reports `ok`, two healthy
database shards and Redis healthy; rate limiter is disabled as expected.
HPA min 2 / max 6 / CPU target 70%, current=desired=2; no warm-up lease.
Last run `28f3c7f4` completed with cleanup not required; no k6 containers remain.

Release source HEAD: `20381302ad040fca1b6e4a994e0be3e267cd28a6` plus preserved
uncommitted implementation. No commit is created by this deployment.

## Selected release

`finalization-v1-20261029-55889ae2` — absence verified in all three Docker Hub repositories.

Published images: `verma17/scalelab-web`,
`verma17/scalelab-lab-controller`, `verma17/scalelab-loadgen-controller` with that tag.
Public controls will remain enabled, per the reviewed manifest.

All three linux/amd64 builds and pushes exited successfully. Runtime checks
verified the recovery entry point, above-5,000 configuration parsing and Nginx
syntax. No secrets were provided as build arguments; runtime secrets are supplied
only by existing Kubernetes references and the private VM `.env`.

| Published repository | Release digest |
| --- | --- |
| verma17/scalelab-web | sha256:6e7136910e5174b435a6b8bb13b8652f5fcba1e222956cab14c94dc292f76bd4 |
| verma17/scalelab-lab-controller | sha256:158926ca231f70f7a6c5312b0fc4f2ae2897f2476b920c8b5d77217eae83f6f6 |
| verma17/scalelab-loadgen-controller | sha256:846ee820bb85185db70b8b3994ba6e22d8adae6007105756af3e7f9aa75d39c5 |

## Results and remaining work

VM controller now runs the new release, `/live` is healthy, authenticated `/limits`
reports 500 preallocated / 4,000 max/budget VUs, 2 CPUs, 2g memory and 256 PIDs.
Fixed target is the production HTTPS domain; port remains bound only to
192.168.1.8:4100. Existing token was preserved, `.env` remains mode 600, all five
copied script hashes match locally, and no k6 container started. Recent logs
contain only the startup lifecycle event.

Kubernetes rollouts succeeded: lab-controller revision 7 and frontend revision 9,
both 1/1 Ready on the new tag. API remains unchanged on civo-v2, revision 3, 2/2
Ready. Controller config returns three authoritative presets, publicly enabled
controls and the real VM limits. Warm-up status reads actual ready/desired=2.

Scoped permissions verified: both identities can get/patch only the intended HPA;
patching another HPA and reading Secrets are denied. The recovery CronJob has
already produced a successful 1/1 completed Job. A transient initial readiness
connection-refused event occurred before the new controller began listening;
rollout completed and its startup log has no ongoing errors.

HTTPS `/`, `/store`, `/scalelab`, `/api/products` and `/health` return 200.
Browser verified dashboard at root, Store with three rendered products, legacy
alias/refresh, three scenarios, collapsed Advanced Mode and Detailed k6 Output.
Advanced input accepted 10,000 unchanged with no max attribute and enabled Start;
it was NOT launched. Last 10 min selection works.

Real five-minute history returns 101 samples for most aggregate metrics and real
ten-minute history 201, both with 3s steps. All 15 aggregate keys have actual
samples, both API pods appear in CPU/RPS series, and CPU source gaps are retained.
HTTP 5xx, pool waiters and successful orders/sec have genuine zero samples at
idle; cache ratio has samples only around real cache traffic, not fabricated
idle zeroes. No requested metric family is wholly missing.

Only the explicitly approved small read-only smoke/stop runs are authorized;
high-load/sustained capacity benchmarks are excluded. Public-control cost/abuse
and in-memory run tracking remain known limitations described in the release guide.

## Approved functional verification

Warm-up passed: HPA minimum changed from 2 to 5, desired replicas progressed to 5,
and all five API pods were observed 1/1 Ready with no restarts. Restore returned
minimum to 2 and removed the lease. Subsequent checks already show current and
desired replicas back at 2, maximum 6. The CronJob's normal no-lease job succeeded;
forced controller-crash/expired-lease recovery was intentionally not exercised.

Read-only smoke run `8e35bda1` passed: 50 target RPS for 30s, 20 preallocated /
100 max VUs. k6 completed 1,501 requests at 50.02176 RPS, zero HTTP failures,
100% checks, 5.42ms average, 6.75ms p95 and 7.64ms p99. Exit code 0. Live metrics
changed during the run; cache hit ratio reached 99.78%, pool waiters and HTTP
5xx stayed zero. This is functional evidence, not a capacity benchmark.

Raw result saved at `docs/experiments/results/finalization-20261029-8e35bda1-smoke.json`.
Browser verified Start disabled / Stop enabled during the run, expandable output,
final real summary and output retention after collapsing/reopening. No k6
container remained afterward.

Stop verification also passed: separate run `8f2db0ce` used the same 50-RPS,
30-second read-only configuration and was stopped through the actual dashboard
button after about 19 seconds of k6 execution. It retained 964 successful
requests, 0% HTTP failures, `stopped=true`, and the confirmed `Test stopped`
event. Exit 105 and the terminated-signal stderr line are the expected result
of this intentional stop, not a capacity failure. Raw result:
`docs/experiments/results/finalization-20261029-8f2db0ce-stop.json`.
The selected ten-minute telemetry window survived the run/state changes.

## Final health and safety

All three live components use `finalization-v1-20261029-55889ae2`. Kubernetes
image IDs exactly match the published web/lab-controller digests above; the VM
RepoDigest matches the published loadgen-controller digest. Frontend pod
`scalelab-web-758b7f8775-mjvzj` and lab-controller pod
`lab-controller-7b66bc66c5-96rqk` are Ready with zero restarts.

| Component | Observed result |
| --- | --- |
| Frontend | HTTPS routes, static assets, Store catalog and dashboard work |
| Ecommerce API | civo-v2 unchanged; 2/2 Ready; health status ok |
| Lab-controller | New release; 1/1 Ready; presets, generator auth and Kubernetes reads work |
| VM controller | New release; private-only binding; healthy; no k6 containers |
| PostgreSQL | Both StatefulSets 1/1; API reports two healthy shards |
| Redis | 1/1 Ready; API health healthy; real cache hits observed |
| Prometheus | Internal readiness HTTP 200; current API scrape targets up=1 |
| Grafana | Internal `/api/health` HTTP 200, database ok, version 12.1.1 |

Final observed HPA: min=2, max=6, target=70%, current=desired=ready=2;
CPU about 2% at the safety check. Warm-up state idle, no lease. No active test,
pending cleanup or orphaned k6 container remains. Recovery CronJob is unsuspended
on its one-minute schedule and produces successful Jobs (last checked success
2026-10-29T04:36:05Z). Recent controller logs contain only startup and no ongoing
errors; no recent namespace warnings were returned at the final check.

Public controls remain ENABLED, as authorized. Existing internal tokens, fixed
HTTPS target, private VM binding and resource budgets remain enforced. No image
or manifest for API, Redis, PostgreSQL, Prometheus, Grafana or ingress was changed.
No rollback was necessary. No high-load, full preset or write workload was run.

## Limitations / pending verification

- Forced controller-crash and expired-lease recovery were not intentionally
  exercised, per the deployment instructions. Scheduled recovery health/RBAC and
  ordinary warm-up/restore are verified; failure scenarios retain local test coverage.
- Full CPU-triggered HPA ramp/spike and sustained capacity/write benchmarks require
  separate approval. No throughput-limit claim is based on these smoke tests.
- Mixed-write automatic cleanup and successful-order accounting were not exercised
  live by these read-only runs; their existing automated lifecycle tests are retained.
- Two very short-lived warm-up pods produced only one cAdvisor CPU sample before
  scale-down. Prometheus `rate` requires at least two; no CPU line was fabricated
  for them. Direct source inspection confirmed the sampling gap, not a label error.
  Per-pod RPS history included all five pods; active pods have real CPU series.
- Public controls have no visitor identity/ownership; cost/abuse/interruption risk
  and in-memory run/cleanup restart limitations remain as documented.

## Exact rollback commands — recorded, NOT executed

First ensure no active test or cleanup, and use the current lease-aware restore
endpoint if a warm-up is active. Never overwrite an active visitor test. Keep the
current release available for recovery until the lease is clear.

```powershell
$KubePath = 'C:\Users\verma\Downloads\civo-scalelab-kubeconfig'
$Base = 'https://scalelab.chandanverma.space'
$Run = Invoke-RestMethod "$Base/lab-api/runs/current"
if ($Run.status -in @('starting','running','stopping','resetting') -or $Run.cleanup.status -in @('pending','running')) { throw 'Active test/cleanup: abort rollback' }
$Warmup = Invoke-RestMethod "$Base/lab-api/warmup"
if ($Warmup.status -in @('warming','ready')) {
  Invoke-RestMethod -Method Post -ContentType application/json -Body '{}' "$Base/lab-api/warmup/restore"
}
$Hpa = kubectl --kubeconfig $KubePath --context scalelab -n scalelab get hpa scalelab-api -o json | ConvertFrom-Json
if ($Hpa.metadata.annotations.'scalelab.chandanverma.space/warmup-lease') { throw 'Lease still active: abort rollback' }
kubectl --kubeconfig $KubePath --context scalelab -n scalelab patch cronjob warmup-recovery --type merge -p 'spec: {suspend: true}'
$Baseline = Get-Content -Raw 'C:\Users\verma\Desktop\.scalelab-deployment-backups\finalization-v1-20261029-55889ae2\kubernetes-baseline.json' | ConvertFrom-Json
# The HPA snapshot is evidence, not something to apply over a lease or operator edit.
$Baseline.items = @($Baseline.items | Where-Object { $_.kind -ne 'HorizontalPodAutoscaler' })
$Baseline | ConvertTo-Json -Depth 100 | kubectl --kubeconfig $KubePath --context scalelab -n scalelab apply -f -
kubectl --kubeconfig $KubePath --context scalelab -n scalelab rollout status deployment/lab-controller --timeout=180s
kubectl --kubeconfig $KubePath --context scalelab -n scalelab rollout status deployment/scalelab-web --timeout=180s
```

The suspension syntax was verified using a server dry run; the live CronJob
remains unsuspended. Baseline snapshots restore controller image civo-v6,
ConfigMap/ServiceAccount/strategy settings and frontend image civo-v8. Leave the
now-unused scoped RBAC in place rather than deleting unrelated resources during
an emergency rollback. The API image stays civo-v2 throughout.

On the VM, after confirming no test container is active:

```bash
cd /home/civo/scalelab-loadgen
backup=/home/civo/scalelab-backups/finalization-v1-20261029-55889ae2
cp -p "$backup/compose.yaml" compose.yaml
cp -p "$backup/controller.env" .env
cp -a "$backup/load-tests/." /home/civo/scalelab-loadtest/
docker compose config --quiet
docker compose up -d controller
docker compose ps
curl --fail http://192.168.1.8:4100/live
```

Then verify production `/health`, product reads, controller status, HPA min/max,
cleared lease and no active containers. No database, Redis, volume or Secret
deletion is part of rollback.

## Rollback procedure

Use explicit kubeconfig/context and restore the captured lab-controller ConfigMap
and Deployment plus web Deployment from private snapshots. Baseline image/revision
values are recorded above. Suspend the newly added recovery CronJob during rollback
only after ensuring no warm-up lease remains; restore the original HPA minimum
through the lease-aware restore operation first if necessary. Do not delete data,
volumes, Secrets or unrelated resources. On the VM, restore the private backup
Compose, `.env` and scripts, then `docker compose up -d controller` and verify `/live`.
Exact backup locations and tested rollback details will be recorded before rollout.

Rollback snapshots are stored outside tracked source at
`C:\Users\verma\Desktop\.scalelab-deployment-backups\finalization-v1-20261029-55889ae2\kubernetes-baseline.json`.
VM Compose, environment and scripts are backed up at
`/home/civo/scalelab-backups/finalization-v1-20261029-55889ae2` (directory mode 700,
private environment copy mode 600). Its token and unrelated settings were
preserved when adding the new release/resource configuration.

## Repository verification

After deployment, workspace typecheck and all 51 relevant tests passed again
(29 lab-controller, 14 load-generator, 8 frontend). All three Docker builds had
successful production compilation. `git diff --check` passed with existing
LF/CRLF warnings. No application code was changed during this rollout; only
release image references and execution documentation were updated. The existing
dirty/untracked implementation is preserved and no Git commit was created.
