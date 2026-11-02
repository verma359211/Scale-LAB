# Repository hygiene and pre-push checklist

## Keep off GitHub

- [ ] Actual `.env` files, tokens, registry credentials, SSH keys, certificates with private keys and kubeconfigs. Only placeholder `.env.example` files belong in Git.
- [ ] Kubernetes Secret **values**, production database URLs/passwords, bearer headers and database dumps. References to Secret names/keys are safe to version.
- [ ] `node_modules`, build output, coverage, caches and TypeScript build metadata. Keep the pnpm lockfile.
- [ ] Raw k6 exports, Prometheus exports, terminal logs, traces, CPU/heap profiles and machine-specific manifests.
- [ ] Private deployment backups, screenshots/QA fixture output, temporary files, archives and editor/OS metadata.
- [ ] Obsolete components or temporary exposure manifests. Before removing a config, check package scripts, Kustomize, mounts, imports and current deployment references.
- [ ] Invented benchmark claims. Preserve useful experiment narratives, with date/topology and limitations.

## Checks before every push

```powershell
pnpm repo:check
pnpm typecheck
pnpm build
pnpm test  # Needs a local PostgreSQL instance; never point tests at production

git diff --check
git diff --cached --check
git diff --cached --stat
git status --short
```

`repo:check` inspects tracked working-tree paths, common credential signatures and inline Civo Secret documents. It never prints matched values. It is a guard, not a complete secret scanner: manually inspect added code/config and the staged diff too. Test fixtures and explicitly documented local demo credentials are not real deployment credentials.

## Findings from the 2 November 2026 cleanup

- Untracked 278 raw-result artifacts (including the old placeholder). Existing files remain on the operator's disk under the ignored `docs/experiments/results/`; they are removed from the current Git tree. Reports remain in `docs/experiments/`.
- Removed the obsolete LiveScalingPanel, MetricCard, SystemStatePanel, SystemTopology and WhatToWatch components, their orphaned state helper/test, and confirmed-unused legacy CSS. The missing-telemetry test now exercises the actual hero.
- Preserved Compose, local Kubernetes and Civo configurations: they are different runnable topologies, not redundant copies. All remaining runner scripts are referenced by package scripts/current experiments. Store components and migrations remain in use.
- Removed the inline `postgres` Secret from the Civo database manifest. Its password/DSNs used the public demo default. The existing live Secret is not changed by this cleanup; do not apply local sample credentials to Civo. Shared exporter manifests already use Secret references.
- Bound local Compose published ports to `127.0.0.1`, keeping development credentials off public network interfaces.
- Local Git/PowerShell checks found no matches for known private-key, GitHub token, AWS access-key or JWT signatures in reachable Git history at audit time. This does **not** rule out generic passwords/tokens or inaccessible remote refs.

An external-container history scan was rejected by automatic approval review because it would mount potentially sensitive history into a downloaded third-party image. No repository contents were sent to that scanner. Local checks were used instead; do not interpret this as a full Gitleaks audit.

## Existing history and credential handling

A normal cleanup commit does not purge old commits, forks, clones or cached GitHub content. No history was rewritten or force-pushed. If a real deployment ever used a credential committed to Git—including a public sample password—rotate it privately and coordinate database/API/exporter connection updates. Deleting the manifest alone does not secure that credential. Never print the replacement in a terminal transcript or paste it into a tracked file.

The local Compose/Kubernetes sample credentials remain intentionally public for local development. They are not suitable for cloud use. The cleanup release deploys **only the web image**; it does not rotate or restart cloud database services.

## Private Civo database Secret

Create `postgres` in namespace `scalelab` before applying `civo/database.yaml` on a fresh cluster. Existing clusters keep their current Secret. Manage its values outside this repository with your secret manager or a private environment file containing these keys:

```text
POSTGRES_DB
POSTGRES_USER
POSTGRES_PASSWORD
DATABASE_URL
DATABASE_SHARD_URLS
POSTGRES_EXPORTER_URL
POSTGRES_SHARD_1_EXPORTER_URL
```

The primary URL targets `postgres:5432`; the shard list contains both that host and `postgres-shard-1:5432`. Exporter URLs target their respective shards. Use the same privately chosen database credentials consistently and URL-encode special characters in connection strings. Secret references alone do not change passwords in an existing PostgreSQL data directory.

For an initial installation, after creating a private file **outside Git**, use your own explicit kubeconfig/context:

```powershell
kubectl --kubeconfig $KubePath --context $Context -n scalelab create secret generic postgres --from-env-file=$PrivateEnvPath --dry-run=client -o yaml | kubectl --kubeconfig $KubePath --context $Context -n scalelab apply -f -
```

Do not replace an existing Secret or rotate credentials during a UI rollout. The Civo web, ingress, TLS and HPA manifests remain separate from this private provisioning step.
