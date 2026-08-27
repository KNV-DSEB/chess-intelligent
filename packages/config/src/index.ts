import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { z } from 'zod';

const apiEnvironmentSchema = z.object({
  DATABASE_URL: z.string().min(1),
  API_HOST: z.string().default('127.0.0.1'),
  API_PORT: z.coerce.number().int().positive().default(4000),
  WEB_ORIGIN: z.string().url().default('http://localhost:3000'),
});

const workerEnvironmentSchema = z.object({
  DATABASE_URL: z.string().min(1),
  STOCKFISH_PATH: z.string().min(1),
  WORKER_ID: z.string().min(1).max(200).default(`worker-${process.pid}`),
  WORKER_POLL_INTERVAL_MS: z.coerce.number().int().min(100).max(60_000).default(1_000),
  WORKER_ONCE: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
});

export type ApiEnvironment = z.infer<typeof apiEnvironmentSchema>;
export type WorkerEnvironment = z.infer<typeof workerEnvironmentSchema>;

export function loadRootEnvironment(): void {
  const rootEnvironmentPath = fileURLToPath(new URL('../../../.env', import.meta.url));
  if (existsSync(rootEnvironmentPath)) {
    process.loadEnvFile(rootEnvironmentPath);
  }
}

export function readApiEnvironment(environment: NodeJS.ProcessEnv = process.env): ApiEnvironment {
  return apiEnvironmentSchema.parse(environment);
}

export function readWorkerEnvironment(
  environment: NodeJS.ProcessEnv = process.env,
): WorkerEnvironment {
  return workerEnvironmentSchema.parse(environment);
}

export function requireDatabaseUrl(environment: NodeJS.ProcessEnv = process.env): string {
  return z.string().min(1).parse(environment.DATABASE_URL);
}
