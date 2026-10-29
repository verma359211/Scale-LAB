import type { Hpa, KubernetesProvider } from "./kubernetes.js";

export const LEASE_ANNOTATION = "scalelab.chandanverma.space/warmup-lease";
type Lease = { originalMin: number; target: number; startedAt: number; expiresAt: number; readyAt?: number };
export type WarmupState = {
  status: "idle" | "warming" | "ready" | "failed" | "disabled";
  readyReplicas: number | null;
  desiredReplicas: number | null;
  targetReplicas: number | null;
  baselineReplicas: number | null;
  expiresAt: string | null;
  message: string;
};

function leaseFrom(hpa: Hpa): Lease | null {
  const raw = hpa.metadata.annotations?.[LEASE_ANNOTATION];
  if (!raw) return null;
  const lease = JSON.parse(raw) as Lease;
  if (![lease.originalMin, lease.target, lease.startedAt, lease.expiresAt].every(Number.isSafeInteger)
    || lease.originalMin < 1 || lease.originalMin > 6 || lease.target < lease.originalMin || lease.target > 6 || lease.expiresAt <= lease.startedAt) {
    throw new Error("Invalid persisted warm-up lease; operator inspection required");
  }
  return lease;
}

export class PodWarmup {
  private failure: string | null = null;
  private operation: Promise<unknown> = Promise.resolve();
  constructor(private readonly kube: KubernetesProvider, private readonly now = Date.now, private readonly leaseMs = 15 * 60_000, private readonly readinessTimeoutMs = 3 * 60_000) {}

  // Dashboard polling, preparation and periodic recovery share one lease writer.
  // Internal calls stay in the same operation rather than re-entering the queue.
  private serialize<T>(action: () => Promise<T>): Promise<T> {
    const next = this.operation.then(action, action);
    this.operation = next.catch(() => {});
    return next;
  }
  start() { return this.serialize(() => this.startInternal()); }
  restore() { return this.serialize(() => this.restoreInternal()); }
  current() { return this.serialize(() => this.inspect()); }

  private async startInternal() {
    const hpa = await this.kube.hpa();
    const existing = leaseFrom(hpa);
    if (existing) return this.inspect(); // Repeated clicks must never renew the lease.
    const target = Math.min(5, hpa.spec.maxReplicas);
    const originalMin = hpa.spec.minReplicas ?? 1;
    if (target < 2 || target > 6 || originalMin > target) throw new Error("HPA bounds do not permit the fixed warm-up target");
    const lease: Lease = { originalMin, target, startedAt: this.now(), expiresAt: this.now() + this.leaseMs };
    await this.kube.patchHpa(hpa.metadata.resourceVersion, target, { [LEASE_ANNOTATION]: JSON.stringify(lease) });
    this.failure = null;
    try { return await this.inspect(); }
    catch (error) {
      // If the write succeeded but readiness inspection failed, attempt rollback
      // now. The persisted lease and independent worker remain the fallback.
      try { await this.restoreInternal(); } catch { /* Recovery retries after expiry. */ }
      throw error;
    }
  }

  private async restoreInternal() {
    const hpa = await this.kube.hpa();
    const lease = leaseFrom(hpa);
    if (lease) {
      // Preserve a manual operator change instead of overwriting it on rollback.
      const minimum = hpa.spec.minReplicas === lease.target ? Math.min(lease.originalMin, hpa.spec.maxReplicas) : (hpa.spec.minReplicas ?? 1);
      await this.kube.patchHpa(hpa.metadata.resourceVersion, minimum, { [LEASE_ANNOTATION]: null });
    }
    return this.inspect();
  }

  private async inspect(): Promise<WarmupState> {
    const hpa = await this.kube.hpa();
    const lease = leaseFrom(hpa);
    if (lease && hpa.spec.minReplicas !== lease.target) {
      this.failure = "HPA minimum changed externally; preparation was released without overwriting the operator change.";
      return this.restoreInternal();
    }
    const deployment = await this.kube.deployment();
    const ready = deployment.status?.readyReplicas ?? 0;
    if (lease && (this.now() >= lease.expiresAt || (!lease.readyAt && this.now() - lease.startedAt >= this.readinessTimeoutMs))) {
      this.failure = this.now() >= lease.expiresAt ? null : "Pod readiness timed out. Normal autoscaling was restored.";
      return this.restoreInternal();
    }
    const prepared = !!lease && (deployment.status?.observedGeneration ?? 0) >= deployment.metadata.generation
      && ready >= lease.target && (deployment.status?.updatedReplicas ?? 0) >= lease.target
      && (deployment.status?.availableReplicas ?? 0) >= lease.target;
    if (prepared && lease && !lease.readyAt) {
      await this.kube.patchHpa(hpa.metadata.resourceVersion, lease.target, {
        [LEASE_ANNOTATION]: JSON.stringify({ ...lease, readyAt: this.now() }),
      });
    }
    return {
      status: lease ? prepared ? "ready" : "warming" : this.failure ? "failed" : "idle",
      readyReplicas: ready, desiredReplicas: hpa.status?.desiredReplicas ?? null,
      targetReplicas: lease?.target ?? null, baselineReplicas: lease?.originalMin ?? hpa.spec.minReplicas ?? 1,
      expiresAt: lease ? new Date(lease.expiresAt).toISOString() : null,
      message: this.failure ?? (lease ? prepared ? "Requested API pods are ready." : "Waiting for API pods to become ready." : "Normal autoscaling is enabled; HPA may take time to scale down."),
    };
  }
}

// The CronJob needs only HPA get/patch and can recover even when the dashboard
// controller is unavailable. Readiness polling is handled by the main service.
export async function recoverExpiredWarmup(kube: Pick<KubernetesProvider, "hpa" | "patchHpa">, now = Date.now()) {
  const hpa = await kube.hpa();
  const lease = leaseFrom(hpa);
  if (!lease || now < lease.expiresAt && (lease.readyAt || now - lease.startedAt < 180_000)) return;
  const minimum = hpa.spec.minReplicas === lease.target ? Math.min(lease.originalMin, hpa.spec.maxReplicas) : hpa.spec.minReplicas ?? 1;
  await kube.patchHpa(hpa.metadata.resourceVersion, minimum, { [LEASE_ANNOTATION]: null });
}
