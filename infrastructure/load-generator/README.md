# ScaleLab load-generator controller

The controller is built on a development machine and published as an immutable
image. The load-generator VM does not need the ScaleLab repository, Node.js,
pnpm, or a compiler.

## Build and publish

For the finalization release, follow
[`docs/scalelab-finalization-deployment.md`](../../docs/scalelab-finalization-deployment.md).
It documents the new configurable VU/CPU/memory budgets, required new immutable
image, and the coordinated controller/frontend rollout. Existing tags below are
historical; choose an unused release tag instead of overwriting one.

Run from the ScaleLab repository root:

```powershell
docker build --platform linux/amd64 -t verma17/scalelab-loadgen-controller:civo-v3 -f apps/loadgen-controller/Dockerfile .
docker push verma17/scalelab-loadgen-controller:civo-v3
```

## Files required on the VM

```text
/home/civo/scalelab-loadtest/        existing k6 scripts
/home/civo/scalelab-loadgen/
  compose.yaml
  .env
```

The VM `.env` contains:

```dotenv
LOAD_TESTS_HOST_DIR=/home/civo/scalelab-loadtest
LOADGEN_CONTROL_TOKEN=replace-with-a-long-random-service-token
```

Start and verify the controller from `/home/civo/scalelab-loadgen`:

```bash
docker compose pull
docker compose up -d
docker compose ps
curl http://192.168.1.8:4100/live
```

The API is bound only to the VM's private address. The Docker socket is mounted
because the controller launches a separate, fixed `grafana/k6` container. The
k6 container receives only the load-test directory as a read-only mount; it
does not inherit the Docker socket. The controller accepts only the configured
production HTTPS target and requires `LOADGEN_CONTROL_TOKEN` for its private
start and stop requests from the lab controller.
