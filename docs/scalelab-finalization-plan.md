# ScaleLab finalization plan

## Verified architecture and audit — pre-implementation baseline, 2026-10-28

React 19 / Vite / Tailwind in `apps/web` uses pathname routing in `src/App.tsx`.
The Store currently owns `/`; dashboard lives at `/scalelab`. Frontend Nginx
(`apps/web/nginx.conf`) has SPA fallback. API proxying is in Vite development
configuration and production ingress, not the frontend container itself.
Civo `ingress-api.yaml` routes those prefixes separately under HTTPS with
`scalelab-tls` and `letsencrypt-prod`. Preserve those routes and TLS settings.

`apps/lab-controller/src/app.ts` exposes metrics, bounded run start/current/stop,
result and benchmark-reset operations. `run-coordinator.ts` finishes write runs
only after benchmark cleanup. `load-generator.ts` authenticates to the private
VM using `LOADGEN_CONTROL_TOKEN`; `benchmark-reset.ts` uses a separate API token.
Neither secret belongs in the frontend. The existing working tree contains many
uncommitted/untracked features; preserve them and do not commit.

`apps/loadgen-controller` spawns fixed Docker/k6 scripts with `shell: false`.
Target is exactly `https://scalelab.chandanverma.space`; one active run, a 30s
cooldown and 10-minute duration limit already exist. Both schemas and frontend
cap RPS at 5,000. The launcher silently clamps preallocated VUs to 1,500 and
maximum VUs to 4,000. Scripts already accept RPS and VU environment parameters;
there is no script-level 5,000-RPS clamp. CLI scripts use configurable rates.

Prometheus range queries use a 3s step; the dashboard hydrates 15 minutes then
appends summary snapshots. Only the first returned series is currently read.
Metrics exist for per-pod CPU (cAdvisor), per-pod HTTP traffic (API discovery),
pool waiters and successful POST orders (HTTP 201 counter). No fake data needed.

Civo HPA `hpa.yaml`: min 2, max 6, 70% CPU, 120s scale-down stabilization.
API requests 250m CPU / 256Mi and limits 500m / 512Mi (`api.yaml`). Redis and two
PostgreSQL StatefulSets are deployed separately. Lab controller has one replica
and currently no Kubernetes API RBAC. VM Compose binds private 192.168.1.8:4100,
mounts tests read-only, and uses the Docker socket for fixed k6 containers.

## File-by-file change map

- `apps/web/src/App.tsx`, `lib/routes.ts`, `components/AppShell.tsx`: root routing.
- `components/K6ResultPanel.tsx`, page polling, both controllers' result handling:
  collapsed detailed console, bounded live output, concise terminal summaries.
- `apps/lab-controller/src/prometheus.ts`, `app.ts`, frontend `lab-types.ts`,
  `lib/lab-api.ts`, `TimeSeriesChart.tsx`, new telemetry component: real 5/10 minute
  range refresh, per-pod lines, shared axes, autoscaling and backend health.
- Lab controller preset module and endpoint; `LoadTestPanel.tsx`: authoritative
  server presets, three scenario cards, collapsed Advanced Mode.
- Both run schemas, loadgen configuration/launcher/runner, Compose/.env example:
  uncapped positive-safe RPS, explicit bounded VUs, Docker CPU/memory/PID limits,
  workload watchdog, actionable limit errors, public-control safeguards.
- New lab controller Kubernetes client/warm-up service and tests: fixed HPA only,
  persisted lease, real Deployment readiness, restore on failure/expiry/restart.
- New scoped RBAC and recovery CronJob manifests in `infrastructure/kubernetes/civo`;
  existing lab-controller Deployment: service account and configuration references.
- Focused backend/frontend unit tests; this plan, deployment guide, implementation
  log and load-generator README: verification, configuration and rollout sequence.

## Phases and seven requirements

- [x] Phase 0 — Completed and verified: audit and plan; baseline workspace
  typecheck/build and four web tests passed. Controller HTTP tests initially
  blocked by sandbox loopback EACCES; rerun with local-process permission passed.
- [x] Phase 1 / R1 — Completed and verified: collapsed live console, bounded
  snapshots, errors retained. Web build and controller capture tests pass.
- [x] Phase 1 / R2 — Completed and verified: route tests and production build;
  Nginx SPA fallback source and local browser routes/refresh verified.
- [x] Phase 2 / R3 — Completed and verified locally: shared real 5/10 minute range, per-pod CPU/RPS,
  ready/desired replicas, latency/errors, pool waiters and successful orders/sec.
- [x] Phase 3 / R4 — Completed and verified locally: server-defined autoscaling/spike/throughput presets; mapping tests pass.
- [x] Phase 3 / R5 — Completed and verified locally: collapsed Advanced Mode, shared lifecycle controls; build passes.
- [x] Phase 4 / R6 — Completed and verified locally: remove 5,000 RPS cap; explicit generator budgets,
  meaningful resource rejections, unchanged duration/target/auth/cleanup boundaries.
- [x] Phase 4 / R7 — Completed and verified for ordinary live warm-up/restore on
  2026-10-29: HPA min 2→5→2, five actual Ready API pods, lease cleared, normal
  replicas settled back to two. Scoped RBAC and scheduled recovery Jobs pass.
  Forced crash/expired-lease recovery was intentionally not exercised live;
  nine fake-provider lifecycle tests cover those paths locally.
- [x] Phase 5 — Completed and verified locally: desktop/tablet/mobile preview,
  relevant tests, workspace typecheck/build, offline YAML and k6 syntax checks,
  docs and release guide. Live acceptance items below remain explicitly pending.

## Risks and safeguards

Public test and warm-up controls permit strangers to spend cloud resources. Use
global cooldowns, bounded duration/VUs/container resources, same-origin browser
mutation checks, fixed target and workload allowlists, one-run lock, and a bounded
warm-up lease. These are resource safeguards, not visitor authentication. Disable
public controls with runtime configuration when unattended. Never log tokens.

HPA state must survive controller failure: persist original min plus lease expiry
in HPA annotations, update using resourceVersion, restore conditionally, and run
an independently scheduled recovery command with name-scoped permissions. If an
operator changes minReplicas externally, do not overwrite that change. Readiness
is real ready replicas, not a requested count. Do not extend leases on repeated
clicks. Prevent warm-up/start/reset races with a controller operation guard.

Do not claim uncapped RPS is sustainable. Expose effective VUs and Docker budgets;
reject a request exceeding configured VU budget instead of silently clamping it.
Retain bounded output (128KiB per stream); collapsing never clears it. Existing
in-memory run/cleanup coordination does not survive a controller restart; do not
claim warm-up recovery also solves all existing run recovery limitations.

## Verification checklist

- [x] Baseline typecheck, controller/web tests and builds recorded.
- [x] Route resolution and SPA preview refresh checks.
- [x] Console collapsed initially; live snapshot and existing summary tests.
- [x] 5/10 range query start/end, per-pod labels, gaps and unavailable data tested.
- [x] Server preset mapping matches real k6 stages and durations.
- [x] 10,000 RPS reaches k6 invocation unchanged; invalid/over-budget inputs rejected.
- [x] Internal authentication, one-run lock, cooldown and cleanup regression tests.
- [x] Warm-up readiness, expiry, failure, restore, concurrency and restart tests.
- [x] Production build, workspace typecheck, relevant suites and diff check.
- [x] Browser preview inspected at desktop, 768px and 390px; root, Store,
  alias/refresh, Advanced Mode, detailed output and 10-minute selection checked.
  No horizontal overflow at 390px. No fake telemetry; local backing services were
  unavailable and their error/empty states were checked. No test was started.
- [x] Live verification completed 2026-10-29: Civo RBAC, ordinary warm-up/restore,
  scheduled recovery Job health, real 5/10-minute and per-pod series, VM budgets,
  live console/results, approved small read-only smoke and dashboard Stop control.
- [x] Three linux/amd64 release images built, runtime-checked, pushed and deployed;
  Docker is available during the deployment execution phase.
- [ ] Not executed: forced live failure/expired-lease recovery and mixed/write
  cleanup tests, following the read-only verification scope. API DB integration
  tests were not repeated during deployment; API image/source were not changed.

## Deployment sequence (executed 2026-10-29)

1. Build new immutable web/lab-controller/loadgen images after local checks; tags
   must be supplied at release time (do not overwrite existing immutable tags).
2. Copy updated k6 scripts/helpers to existing VM test directory; update Compose
   and `.env` budgets, keep service token/private binding, pull/recreate controller.
3. Apply dedicated warm-up ServiceAccounts, name-scoped Role/RoleBindings and
   recovery CronJob; its image must match the new lab-controller image.
4. Apply lab-controller config/Deployment with new image; verify rollout/live,
   controller limits, telemetry and warm-up status before allowing tests.
5. Apply web image; verify `/`, `/store`, alias and unchanged API/HTTPS routing.
6. With explicit approval, validate warm-up/restore and a bounded smoke workload;
   record live verification separately, then approve heavier tests.

Release `finalization-v1-20261029-55889ae2` was deployed with explicit authorization.
See `docs/scalelab-live-deployment-report.md` for digests, backups, rollout results
and rollback commands. Only the approved 50-RPS read-only smoke and stop tests ran;
no full preset or high-load capacity benchmark was started.

Final local suites: 29 lab-controller, 14 loadgen-controller and 8 web tests
passed again after deployment (51 total). Workspace typecheck passes; all three
release Docker builds include successful production compilation.
`git diff --check` passes with existing LF/CRLF warnings. Offline YAML parsing
also confirmed unchanged production host/TLS/issuer and namespace-scoped RBAC.

## Implementation discoveries

- API discovery labels pods as `api_instance`, while cAdvisor uses `pod`. Queries
  preserve both correctly and normalize names in the response.
- Phase 3 configuration endpoint depends on Phase 4 resource schema: implemented
  that small shared contract first so the preset UI can show real VM budgets.
  Defaults now explicitly use 500 preallocated / 4,000 max VUs independently of
  target RPS, with a configurable VU budget and clear errors, not silent clamps.
- Ramp's old integer rounding shortened runs; use millisecond stage durations
  so all five plateaus plus four 1s transitions equal the requested duration.
- Public mutations gain origin checks, an unattended kill switch and reset/
  preparation cooldowns. They remain public, not authenticated visitor controls.
