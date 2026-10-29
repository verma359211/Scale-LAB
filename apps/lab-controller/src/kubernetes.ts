import { readFileSync } from "node:fs";
import { request } from "node:https";

export type Hpa = {
  metadata: { resourceVersion: string; annotations?: Record<string, string> };
  spec: { minReplicas?: number; maxReplicas: number };
  status?: { desiredReplicas?: number };
};
export type Deployment = {
  metadata: { generation: number };
  status?: { observedGeneration?: number; readyReplicas?: number; updatedReplicas?: number; availableReplicas?: number };
};
export interface KubernetesProvider {
  hpa(): Promise<Hpa>;
  deployment(): Promise<Deployment>;
  patchHpa(version: string, minimum: number, annotations: Record<string, string | null>): Promise<void>;
}

// Uses only the mounted service-account identity; no kubeconfig or admin token
// is exposed to the browser. RBAC restricts these calls to the one API workload.
export class KubernetesClient implements KubernetesProvider {
  private readonly tokenPath = "/var/run/secrets/kubernetes.io/serviceaccount/token";
  private readonly ca = readFileSync("/var/run/secrets/kubernetes.io/serviceaccount/ca.crt");
  private readonly hpaPath = "/apis/autoscaling/v2/namespaces/scalelab/horizontalpodautoscalers/scalelab-api";

  private call<T>(path: string, method = "GET", body?: unknown): Promise<T> {
    const data = body === undefined ? undefined : JSON.stringify(body);
    return new Promise((resolve, reject) => {
      const req = request({
        hostname: "kubernetes.default.svc", port: 443, path, method, ca: this.ca,
        headers: { Authorization: `Bearer ${readFileSync(this.tokenPath, "utf8").trim()}`, Accept: "application/json", ...(data ? { "Content-Type": "application/merge-patch+json", "Content-Length": Buffer.byteLength(data) } : {}) },
      }, (response) => {
        let result = "";
        response.setEncoding("utf8");
        response.on("data", (chunk: string) => { result += chunk; });
        response.on("end", () => {
          if ((response.statusCode ?? 500) >= 300) return reject(new Error(`Kubernetes ${method} failed (HTTP ${response.statusCode}); check scoped RBAC and workload availability`));
          try { resolve(JSON.parse(result) as T); } catch { reject(new Error("Invalid Kubernetes response")); }
        });
      });
      req.setTimeout(5_000, () => req.destroy(new Error("Kubernetes request timed out")));
      req.on("error", reject);
      if (data) req.write(data);
      req.end();
    });
  }

  hpa() { return this.call<Hpa>(this.hpaPath); }
  deployment() { return this.call<Deployment>("/apis/apps/v1/namespaces/scalelab/deployments/scalelab-api"); }
  async patchHpa(version: string, minimum: number, annotations: Record<string, string | null>) {
    await this.call(this.hpaPath, "PATCH", { metadata: { resourceVersion: version, annotations }, spec: { minReplicas: minimum } });
  }
}
