export type BenchmarkResetResult = {
  status: "completed";
  shards: Array<{
    shard: number;
    status: "completed" | "failed";
    ordersDeleted?: number;
    productsRestored?: number;
  }>;
};

export class BenchmarkResetClient {
  constructor(
    private readonly url: string,
    private readonly token: string,
    private readonly timeoutMs: number,
  ) {}

  async reset(): Promise<BenchmarkResetResult> {
    const response = await fetch(this.url, {
      method: "POST",
      signal: AbortSignal.timeout(this.timeoutMs),
      headers: { Authorization: `Bearer ${this.token}` },
    });
    const body = await response.json().catch(() => null) as (BenchmarkResetResult & { error?: string }) | null;
    if (!response.ok) throw new Error(body?.error ?? `Benchmark reset returned HTTP ${response.status}`);
    return body as BenchmarkResetResult;
  }
}
