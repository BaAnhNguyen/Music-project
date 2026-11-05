// TODO: validate env bằng class-validator (DATABASE_URL, REDIS_URL, JWT_SECRET, ...)
export function validateEnv(config: Record<string, unknown>) {
  return config;
}
