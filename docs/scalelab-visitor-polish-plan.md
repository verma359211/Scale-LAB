# Visitor polish execution plan — 2026-10-29

## Baseline and design

Branch `main`, remote `https://github.com/verma359211/Scale-LAB.git`. Preserve the
existing uncommitted dashboard/controller implementation; include its required
source dependencies in the final reviewed commit. No secrets or private backups.
Read the previous finalization plan, deployment guide, live report and log.

Current flow: browser POST runs -> TestControls idle guard -> RunCoordinator ->
private authenticated generator -> k6. Separate warm-up endpoints lease the HPA
minimum and inspect Deployment readiness. RunCoordinator performs benchmark cleanup
and invokes HPA restoration. The server will integrate preparation before dispatch,
expose preparation/cancellation progress and defer final completion until restore.
Reuse PodWarmup, its nonrenewable persisted lease, scoped RBAC and recovery CronJob.
Do not modify the ecommerce API, monitoring, ingress, databases or generator budgets.

## Ordered checklist

- [x] A: `apps/lab-controller/src/{app,test-controls,run-schema,run-coordinator}.ts`:
  optional execution-only warmStart flag, asynchronous preparation, readiness gate,
  cancellation/single operation guard, restoration before final completion.
- [x] B: web LoadTestPanel, ScaleLabPage, shared types: collapsed Advanced Options,
  independent custom-workload toggle and off-by-default warm-start checkbox;
  remove standalone preparation control. Preserve custom fields and recovery.
- [x] C: authoritative `presets.ts`: autoscaling 150s, spike 75s, mixed 90s;
  retain 4,000 peak RPS and 70/30 mixed. Show truthful phase/elapsed/traffic/replicas.
- [x] D: tests for preparation ordering, cancellation/failure/races, restore and
  cleanup ordering, UI defaults, preset stage sums and custom >5,000 RPS;
  relevant suites, workspace typecheck/build, diff check. No heavy tests.
- [x] E: verify idle/no lease/min2/max6; snapshot current Deployments/CronJob
  outside repository. Build/push only changed services under a new immutable tag.
  Update controller/recovery image together, then web. Explicit Civo kubeconfig.
- [x] F: HTTPS routes and telemetry; small 50-RPS/30s read-only normal run and
  dashboard-started 50-RPS/60s warm-start run; confirm Ready before k6, completion after restore, no lease and
  baseline min2/max6 afterward. Record actual outcomes and unverified conditions.
- [ ] G: update implementation log/report, review staged files for secrets and
  scope, commit and push main without force. Record actual hash and remote result.

## Acceptance and rollback

Preset and custom warmStart default false. Normal start never raises HPA minimum.
Warm start never dispatches k6 until Ready; failure/cancel restores without dispatch.
One active workflow includes preparation, test, cleanup and restoration. Final
endedAt includes all required work. Preserve expiry/restart recovery and errors.
Preset stages must sum exactly to displayed duration; raw console stays collapsed.

Before rollout record previous images and private snapshots. On release failure,
drain/stop any verification run, restore through the lease-aware endpoint, verify
no lease, and restore captured controller/web/recovery resources. Never delete
PVCs or Secrets, alter production ingress, or overwrite manual HPA edits.

## Results

Local checks: 38 lab-controller, 15 generator and 8 frontend tests pass (61 total),
workspace typecheck and production builds pass. Initial collapsed Advanced Options
and unchecked warm/custom controls verified in the local browser; backing services
are deliberately unavailable there, so interactive preset verification awaits live.
Preflight: production idle, no cleanup, no k6 container, no lease, two Ready API
pods, HPA min2/max6. Release `visitor-v1-20261029-4b7d92c1` will update only web,
lab-controller and its recovery image. Generator runtime/scripts stay unchanged.

Rollout succeeded for controller and web; recovery image matches controller.
The server-dry-run structural comparison verified image-only changes and unchanged
ConfigMap/Services. Windows kubectl diff could not launch its external diff tool;
structural comparison was the verified alternative. A brief ingress 503 occurred
immediately after the Recreate controller rollout, then all routes returned 200.

Live normal run `3cb3c401`: 1,501 requests, 50.024711 achieved RPS, zero HTTP
failures, p95 6.46ms/p99 7.21ms; min2/no lease throughout. Dashboard warm run
`5ebc10ad`: five actual Ready pods before k6, 3,001 requests, 50.011077 RPS,
zero HTTP failures, p95 6.83ms/p99 7.9ms. Preparation started 07:56:10.180Z;
readiness confirmed 07:56:21.604Z; k6 dispatched 07:56:21.619Z; restore confirmed
07:57:22.899Z, then Test completed with the same endedAt. HPA min2/max6 and no
lease confirmed; physical scale-down follows existing stabilization/policies.
Raw evidence is ignored under docs/experiments/results/visitor-{normal,warm}-20261029.json.
Subsequent checks confirmed physical scale-down to two Ready/desired pods,
70% CPU target, healthy recovery Job and genuine 5/10-minute per-pod telemetry.

Rollback snapshot:
`C:\Users\verma\Desktop\.scalelab-deployment-backups\visitor-v1-20261029-4b7d92c1\kubernetes-baseline.json`.
Prior web/controller/recovery images use `finalization-v1-20261029-55889ae2`.
After draining any workflow and releasing a lease, restore those image references
in the three manifests and apply with the explicit Civo kubeconfig/context;
wait for controller/web rollout and verify routes/HPA. VM needs no rollback.

The pre-existing uncommitted controller/dashboard/benchmark-reset dependencies
must be included with this first reviewed commit so a fresh checkout builds.
They are not additional API/ingress changes deployed by this visitor update.
Staged diff found one existing trailing blank line in generator config; removed
as whitespace only, with no generator runtime/image change required.

A 10,000 target RPS anecdote is not
an achieved-capacity claim. Public controls remain an intentional resource-abuse
tradeoff; existing guards are not visitor authentication. In-memory workflow
recovery remains limited; the persisted lease/recovery worker bounds HPA changes.
