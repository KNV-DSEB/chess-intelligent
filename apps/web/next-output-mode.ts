import type { NextConfig } from 'next';

type NextOutputEnvironment = Readonly<Record<string, string | undefined>>;

export function resolveNextOutputMode(
  environment: NextOutputEnvironment = process.env,
): NextConfig['output'] {
  return environment.VERCEL === undefined ? 'standalone' : undefined;
}
