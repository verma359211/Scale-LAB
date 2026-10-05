import type { RedisClientType } from "redis";

export interface CacheStore {
  readonly enabled: boolean;
  isReady(): boolean;
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, ttlSeconds: number): Promise<void>;
  delete(keys: string[]): Promise<void>;
  ping(): Promise<void>;
}

// Tests and non-server callers can create the Express app without Redis.
export const disabledCache: CacheStore = {
  enabled: false,
  isReady: () => false,
  get: async () => null,
  set: async () => undefined,
  delete: async () => undefined,
  ping: async () => undefined,
};

export function createRedisCache(client: RedisClientType): CacheStore {
  return {
    enabled: true,
    isReady: () => client.isReady,

    async get<T>(key: string) {
      const value = await client.get(key);
      return value === null ? null : JSON.parse(value) as T;
    },

    async set<T>(key: string, value: T, ttlSeconds: number) {
      await client.set(key, JSON.stringify(value), { expiration: { type: "EX", value: ttlSeconds } });
    },

    async delete(keys: string[]) {
      if (keys.length > 0) await client.del(keys);
    },

    async ping() {
      await client.ping();
    },
  };
}
