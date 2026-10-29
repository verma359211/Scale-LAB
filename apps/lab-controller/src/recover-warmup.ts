import { KubernetesClient } from "./kubernetes.js";
import { recoverExpiredWarmup } from "./warmup.js";

await recoverExpiredWarmup(new KubernetesClient());
