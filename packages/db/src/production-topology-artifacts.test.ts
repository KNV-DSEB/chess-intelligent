import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

async function source(path: string): Promise<string> {
  return readFile(new URL(`../../../${path}`, import.meta.url), 'utf8');
}

describe('production artifact topology', () => {
  it('boots migrations and the immutable ontology before API and Worker', async () => {
    const compose = await source('docker-compose.production.yml');

    expect(compose).toContain("command: ['node', 'packages/db/dist/migrate-cli.js']");
    expect(compose).toContain("command: ['node', 'packages/db/dist/ontology-sync-cli.js']");
    expect(compose).toMatch(
      /ontology:\s[\s\S]*?migrate:\s+condition: service_completed_successfully/u,
    );
    expect(compose.match(/ontology:\s+condition: service_completed_successfully/gu)).toHaveLength(
      2,
    );
  });

  it('runs compiled JavaScript and carries bundle-relative immutable assets', async () => {
    const [build, apiImage, workerImage, webImage] = await Promise.all([
      source('scripts/build-node-artifacts.mjs'),
      source('docker/Dockerfile.api'),
      source('docker/Dockerfile.worker'),
      source('docker/Dockerfile.web'),
    ]);

    expect(build).toContain("'packages/db/src/ontology-sync-cli.ts'");
    expect(apiImage).toContain('/app/ontology/chess ./ontology/chess');
    expect(apiImage).toContain('CMD ["node", "apps/api/dist/server.js"]');
    expect(workerImage).toContain('CMD ["node", "apps/worker/dist/worker.js"]');
    expect(webImage).toContain('CMD ["node", "apps/web/server.js"]');
    expect(`${apiImage}${workerImage}${webImage}`).not.toMatch(/CMD \[[^\]]*(tsx|pnpm dev)/u);
  });

  it('requires a real external SMTP boundary for the Pilot topology', async () => {
    const compose = await source('docker-compose.production.yml');

    expect(compose).not.toContain('mailpit:');
    expect(compose).toContain('SMTP_HOST: ${SMTP_HOST:?SMTP_HOST is required}');
    expect(compose).toContain(
      'SMTP_REQUIRE_TLS: ${SMTP_REQUIRE_TLS:?SMTP_REQUIRE_TLS is required}',
    );
    expect(compose).toContain('SMTP_PASSWORD: ${SMTP_PASSWORD:?SMTP_PASSWORD is required}');
  });

  it('uses public ACME TLS in production and isolates internal-CA acceptance', async () => {
    const [compose, productionCaddy, localCaddy] = await Promise.all([
      source('docker-compose.production.yml'),
      source('docker/Caddyfile'),
      source('docker/Caddyfile.local-acceptance'),
    ]);

    expect(compose).toContain('PUBLIC_HOST: ${PUBLIC_HOST:?PUBLIC_HOST is required}');
    expect(productionCaddy).toContain('{$PUBLIC_HOST}');
    expect(productionCaddy).not.toContain('tls internal');
    expect(localCaddy).toContain('tls internal');
  });
});
