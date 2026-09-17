export interface ApiListenOptions {
  host: '0.0.0.0';
  port: number;
}

export function resolveApiListenOptions(
  defaultPort: number,
  environment: NodeJS.ProcessEnv = process.env,
): ApiListenOptions {
  const port = Number(environment.PORT ?? defaultPort);

  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error('PORT must be an integer between 1 and 65535.');
  }

  return { host: '0.0.0.0', port };
}
