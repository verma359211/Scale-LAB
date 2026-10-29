import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Deployment, Hpa, KubernetesProvider } from "./kubernetes.js";
import { LEASE_ANNOTATION, PodWarmup, recoverExpiredWarmup } from "./warmup.js";

class FakeKubernetes implements KubernetesProvider {
  value: Hpa = { metadata: { resourceVersion: "1", annotations: {} }, spec: { minReplicas: 2, maxReplicas: 6 }, status: { desiredReplicas: 2 } };
  pods: Deployment = { metadata: { generation: 1 }, status: { observedGeneration: 1, readyReplicas: 2, updatedReplicas: 2, availableReplicas: 2 } };
  patches = 0;
  async hpa() { return structuredClone(this.value); }
  async deployment() { return structuredClone(this.pods); }
  async patchHpa(version: string, minimum: number, annotations: Record<string, string | null>) {
    assert.equal(version, this.value.metadata.resourceVersion);
    this.value.spec.minReplicas = minimum;
    for (const [key, value] of Object.entries(annotations)) {
      if (value === null) delete this.value.metadata.annotations![key];
      else this.value.metadata.annotations![key] = value;
    }
    this.value.metadata.resourceVersion = String(++this.patches + 1);
  }
  ready(count: number) {
    this.pods.status = { observedGeneration: 1, readyReplicas: count, updatedReplicas: count, availableReplicas: count };
    this.value.status = { desiredReplicas: count };
  }
}

describe("bounded HPA pod preparation", () => {
  it("serializes simultaneous readiness polls and restore without stale lease writes", async () => {
    const kube = new FakeKubernetes();
    const warmup = new PodWarmup(kube);
    await warmup.start();
    kube.ready(5);
    await Promise.all([warmup.current(), warmup.current(), warmup.restore()]);
    assert.equal(kube.value.spec.minReplicas, 2);
    assert.equal(kube.value.metadata.annotations![LEASE_ANNOTATION], undefined);
  });
  it("raises only minReplicas, confirms real readiness and does not renew on repeated clicks", async () => {
    const kube = new FakeKubernetes();
    let now = 1_000;
    const warmup = new PodWarmup(kube, () => now);
    const starting = await warmup.start();
    assert.equal(starting.status, "warming");
    assert.equal(starting.readyReplicas, 2);
    assert.equal(kube.value.spec.minReplicas, 5);
    assert.equal(kube.value.spec.maxReplicas, 6);
    const expiry = starting.expiresAt;
    now += 1_000;
    assert.equal((await warmup.start()).expiresAt, expiry);
    kube.ready(5);
    assert.equal((await warmup.current()).status, "ready");
    assert.equal((await warmup.restore()).status, "idle");
    assert.equal(kube.value.spec.minReplicas, 2);
    assert.equal(kube.value.metadata.annotations![LEASE_ANNOTATION], undefined);
    const patches = kube.patches;
    await warmup.restore();
    assert.equal(kube.patches, patches);
  });

  it("restores on readiness timeout and reports the failure", async () => {
    const kube = new FakeKubernetes();
    let now = 1_000;
    const warmup = new PodWarmup(kube, () => now);
    await warmup.start();
    now += 180_001;
    const failed = await warmup.current();
    assert.equal(failed.status, "failed");
    assert.match(failed.message, /timed out/);
    assert.equal(kube.value.spec.minReplicas, 2);
  });

  it("recovers an expired persisted lease after restart, independently of the controller", async () => {
    const kube = new FakeKubernetes();
    let now = 1_000;
    await new PodWarmup(kube, () => now).start();
    kube.ready(5);
    await new PodWarmup(kube, () => now).current();
    now += 900_001;
    await recoverExpiredWarmup(kube, now);
    assert.equal(kube.value.spec.minReplicas, 2);
    assert.equal((await new PodWarmup(kube, () => now).current()).status, "idle");
  });

  it("independent recovery restores a preparation that never became ready", async () => {
    const kube = new FakeKubernetes();
    await new PodWarmup(kube, () => 1_000).start();
    await recoverExpiredWarmup(kube, 182_000);
    assert.equal(kube.value.spec.minReplicas, 2);
  });

  it("preserves external HPA edits and respects a lower maximum", async () => {
    const kube = new FakeKubernetes();
    kube.value.spec.maxReplicas = 4;
    const warmup = new PodWarmup(kube);
    assert.equal((await warmup.start()).targetReplicas, 4);
    kube.value.spec.minReplicas = 3;
    await warmup.restore();
    assert.equal(kube.value.spec.minReplicas, 3);
  });

  it("never reports readiness just because desired replicas reached the target", async () => {
    const kube = new FakeKubernetes();
    const warmup = new PodWarmup(kube);
    await warmup.start();
    kube.value.status = { desiredReplicas: 5 };
    assert.equal((await warmup.current()).status, "warming");
    kube.ready(5);
    kube.pods.status!.observedGeneration = 0;
    assert.equal((await warmup.current()).status, "warming");
  });

  it("a failed Kubernetes update cannot produce a successful warm-up", async () => {
    const kube = new FakeKubernetes();
    kube.patchHpa = async () => { throw new Error("RBAC unavailable"); };
    await assert.rejects(new PodWarmup(kube).start(), /RBAC/);
    assert.equal(kube.value.spec.minReplicas, 2);
  });

  it("readiness polling never overrides an external minimum edit", async () => {
    const kube = new FakeKubernetes();
    const warmup = new PodWarmup(kube);
    await warmup.start();
    kube.ready(5);
    kube.value.spec.minReplicas = 3;
    const current = await warmup.current();
    assert.equal(current.status, "failed");
    assert.equal(kube.value.spec.minReplicas, 3);
    assert.equal(kube.value.metadata.annotations![LEASE_ANNOTATION], undefined);
  });

  it("rolls back a successful HPA update if readiness inspection fails", async () => {
    const kube = new FakeKubernetes();
    kube.deployment = async () => { throw new Error("Readiness unavailable"); };
    await assert.rejects(new PodWarmup(kube).start(), /Readiness unavailable/);
    assert.equal(kube.value.spec.minReplicas, 2);
    assert.equal(kube.value.metadata.annotations![LEASE_ANNOTATION], undefined);
  });
});
