import { timingSafeEqual } from "node:crypto";
import { Router } from "express";
import type { CacheStore } from "../cache/cache-store.js";
import type { ShardRouter } from "../db/shard-router.js";
import type { ApiMetrics } from "../observability/metrics.js";
import { BenchmarkResetError, BenchmarkResetService } from "./benchmark-reset.service.js";

function validToken(authorization: string | undefined, expectedToken: string) {
  if (!authorization?.startsWith("Bearer ") || !expectedToken) return false;
  const supplied = Buffer.from(authorization.slice("Bearer ".length));
  const expected = Buffer.from(expectedToken);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

export function createBenchmarkResetRouter(
  shards: ShardRouter,
  metrics: ApiMetrics,
  cache: CacheStore,
  token: string,
) {
  const router = Router();
  const reset = new BenchmarkResetService(shards, metrics, cache);

  router.post("/reset", async (request, response) => {
    if (!validToken(request.header("authorization"), token)) {
      response.status(401).json({ error: "Unauthorized" });
      return;
    }

    try {
      response.json({ status: "completed", shards: await reset.reset() });
    } catch (error) {
      if (error instanceof BenchmarkResetError) {
        response.status(500).json({ error: "Benchmark reset failed", shards: error.shards });
        return;
      }
      throw error;
    }
  });

  return router;
}
