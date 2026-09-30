function positiveInteger(value: string | undefined, fallback: number, name: string) {
  const parsed = Number(value ?? fallback);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return parsed;
}

export const env = {
  port: positiveInteger(process.env.PORT, 3001, "PORT"),
  clientOrigin: process.env.CLIENT_ORIGIN ?? "http://localhost:5174",
  databaseUrl: process.env.DATABASE_URL ?? "postgresql://scalelab:scalelab@localhost:5433/scalelab",
  databasePoolMax: positiveInteger(process.env.DATABASE_POOL_MAX, 10, "DATABASE_POOL_MAX"),
  instanceId: process.env.INSTANCE_ID?.trim() || "api-1",
};
