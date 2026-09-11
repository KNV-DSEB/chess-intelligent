import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { z } from 'zod';

const booleanEnvironment = () =>
  z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true');

const enabledByDefaultEnvironment = () =>
  z
    .enum(['true', 'false'])
    .default('true')
    .transform((value) => value === 'true');

const optionalEnvironment = () =>
  z.preprocess((value) => (value === '' ? undefined : value), z.string().min(1).optional());

const apiEnvironmentSchema = z
  .object({
    DATABASE_URL: z.string().min(1),
    API_HOST: z.string().default('127.0.0.1'),
    API_PORT: z.coerce.number().int().positive().default(4000),
    WEB_ORIGIN: z.string().url().default('http://localhost:3000'),
    ALLOWED_ORIGINS: z.string().optional(),
    PUBLIC_WEB_BASE_URL: z.string().url().optional(),
    APP_ENV: z.enum(['development', 'test', 'production']).default('development'),
    AUTH_COOKIE_SECURE: booleanEnvironment(),
    INTERNAL_DEV_ROUTES: booleanEnvironment(),
    TRUST_PROXY: booleanEnvironment(),
    AUTO_MIGRATE: enabledByDefaultEnvironment(),
    SMTP_ENABLED: booleanEnvironment(),
    SMTP_HOST: z.string().min(1).optional(),
    SMTP_PORT: z.coerce.number().int().positive().max(65_535).default(1025),
    SMTP_USERNAME: z.string().min(1).optional(),
    SMTP_PASSWORD: z.string().min(1).optional(),
    SMTP_SECURE: booleanEnvironment(),
    SMTP_REQUIRE_TLS: booleanEnvironment(),
    EMAIL_FROM: z.string().min(3).max(320).optional(),
    GROUNDED_AI_PROVIDER: z.enum(['DISABLED', 'OPENAI']).default('DISABLED'),
    GROUNDED_AI_API_KEY: optionalEnvironment(),
    GROUNDED_AI_BASE_URL: z.string().url().default('https://api.openai.com/v1'),
    GROUNDED_AI_MODEL: z.string().min(1).max(200).default('gpt-5.6-terra'),
    GROUNDED_AI_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(120_000).default(30_000),
    GROUNDED_AI_INPUT_USD_PER_MILLION: z.coerce.number().nonnegative().default(2),
    GROUNDED_AI_OUTPUT_USD_PER_MILLION: z.coerce.number().nonnegative().default(12),
    DB_POOL_MAX: z.coerce.number().int().min(1).max(100).default(10),
    DB_CONNECTION_TIMEOUT_MS: z.coerce.number().int().min(100).max(60_000).default(5_000),
    DB_STATEMENT_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(300_000).default(30_000),
  })
  .superRefine((value, context) => {
    if (value.APP_ENV === 'production' && !value.AUTH_COOKIE_SECURE) {
      context.addIssue({
        code: 'custom',
        path: ['AUTH_COOKIE_SECURE'],
        message: 'Production requires Secure __Host- session cookies.',
      });
    }
    if (value.APP_ENV === 'production' && value.INTERNAL_DEV_ROUTES) {
      context.addIssue({
        code: 'custom',
        path: ['INTERNAL_DEV_ROUTES'],
        message: 'Internal development routes cannot be enabled in production.',
      });
    }
    if (value.APP_ENV === 'production' && value.AUTO_MIGRATE) {
      context.addIssue({
        code: 'custom',
        path: ['AUTO_MIGRATE'],
        message: 'Production requires the explicit one-shot migration process.',
      });
    }
    if (value.APP_ENV === 'production' && !value.ALLOWED_ORIGINS) {
      context.addIssue({
        code: 'custom',
        path: ['ALLOWED_ORIGINS'],
        message: 'Production requires explicit ALLOWED_ORIGINS.',
      });
    }
    if (value.APP_ENV === 'production' && !value.PUBLIC_WEB_BASE_URL) {
      context.addIssue({
        code: 'custom',
        path: ['PUBLIC_WEB_BASE_URL'],
        message: 'Production requires PUBLIC_WEB_BASE_URL.',
      });
    }
    const origins = (value.ALLOWED_ORIGINS ?? value.WEB_ORIGIN)
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean);
    if (origins.length === 0 || origins.some((origin) => !z.url().safeParse(origin).success)) {
      context.addIssue({
        code: 'custom',
        path: ['ALLOWED_ORIGINS'],
        message: 'ALLOWED_ORIGINS must contain one or more comma-separated absolute URLs.',
      });
    }
    if (value.APP_ENV === 'production' && !value.SMTP_ENABLED) {
      context.addIssue({
        code: 'custom',
        path: ['SMTP_ENABLED'],
        message: 'Production requires SMTP delivery for invitations and password reset.',
      });
    }
    if (value.SMTP_ENABLED) {
      for (const field of ['SMTP_HOST', 'EMAIL_FROM', 'PUBLIC_WEB_BASE_URL'] as const) {
        if (!value[field]) {
          context.addIssue({
            code: 'custom',
            path: [field],
            message: `${field} is required when SMTP delivery is enabled.`,
          });
        }
      }
      if (Boolean(value.SMTP_USERNAME) !== Boolean(value.SMTP_PASSWORD)) {
        context.addIssue({
          code: 'custom',
          path: ['SMTP_USERNAME'],
          message: 'SMTP_USERNAME and SMTP_PASSWORD must be configured together.',
        });
      }
    }
    if (value.GROUNDED_AI_PROVIDER === 'OPENAI' && !value.GROUNDED_AI_API_KEY) {
      context.addIssue({
        code: 'custom',
        path: ['GROUNDED_AI_API_KEY'],
        message: 'GROUNDED_AI_API_KEY is required when the OpenAI provider is enabled.',
      });
    }
  })
  .transform((value) => ({
    ...value,
    WEB_ORIGINS: (value.ALLOWED_ORIGINS ?? value.WEB_ORIGIN)
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
    PUBLIC_WEB_BASE_URL: value.PUBLIC_WEB_BASE_URL ?? value.WEB_ORIGIN,
  }));

const workerEnvironmentSchema = z.object({
  DATABASE_URL: z.string().min(1),
  STOCKFISH_PATH: z.string().min(1),
  WORKER_ID: z.string().min(1).max(200).default(`worker-${process.pid}`),
  WORKER_POLL_INTERVAL_MS: z.coerce.number().int().min(100).max(60_000).default(1_000),
  WORKER_ONCE: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  AUTO_MIGRATE: enabledByDefaultEnvironment(),
  DB_POOL_MAX: z.coerce.number().int().min(1).max(100).default(5),
  DB_CONNECTION_TIMEOUT_MS: z.coerce.number().int().min(100).max(60_000).default(5_000),
  DB_STATEMENT_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(300_000).default(60_000),
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
