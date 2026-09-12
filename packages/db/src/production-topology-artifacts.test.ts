import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { describe, expect, it } from 'vitest';

import { RESTORE_MANIFEST_TABLES } from './database-operations';

const execute = promisify(execFile);

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

  it('keeps Vercel Web separate from digest-pinned backend workloads', async () => {
    const [vercelConfig, backend, apiCaddy] = await Promise.all([
      source('vercel.json'),
      source('docker-compose.pilot-backend.yml'),
      source('docker/Caddyfile.pilot-api'),
    ]);

    expect(vercelConfig).toContain('verify-vercel-pilot-build.mjs');
    expect(vercelConfig).toContain('apps/web/.next');
    expect(backend).toContain(
      '${API_IMAGE_REPOSITORY:?API_IMAGE_REPOSITORY is required}@sha256:${API_IMAGE_DIGEST:?API_IMAGE_DIGEST is required}',
    );
    expect(backend).toContain(
      '${WORKER_IMAGE_REPOSITORY:?WORKER_IMAGE_REPOSITORY is required}@sha256:${WORKER_IMAGE_DIGEST:?WORKER_IMAGE_DIGEST is required}',
    );
    expect(backend).toContain('DATABASE_URL: ${DATABASE_URL:?DATABASE_URL is required}');
    expect(backend).toContain(
      'ALLOWED_ORIGINS: ${WEB_PUBLIC_ORIGIN:?WEB_PUBLIC_ORIGIN is required}',
    );
    expect(backend).not.toMatch(/^\s{2}web:/mu);
    expect(backend).not.toMatch(/^\s{2}postgres:/mu);
    expect(apiCaddy).toContain('{$API_PUBLIC_HOST}');
    expect(apiCaddy).not.toContain('tls internal');
  });

  it('fails a Vercel build whose public API is not HTTPS or whose release SHA drifts', async () => {
    const script = fileURLToPath(
      new URL('../../../scripts/operations/verify-vercel-pilot-build.mjs', import.meta.url),
    );
    const releaseSha = 'a'.repeat(40);

    await expect(
      execute(process.execPath, [script], {
        env: {
          ...process.env,
          NEXT_PUBLIC_API_URL: 'http://api.pilot.example',
          PILOT_RELEASE_SHA: releaseSha,
          VERCEL: '1',
          VERCEL_GIT_COMMIT_SHA: releaseSha,
        },
      }),
    ).rejects.toThrow(/NEXT_PUBLIC_API_URL must be one credential-free HTTPS origin/u);

    await expect(
      execute(process.execPath, [script], {
        env: {
          ...process.env,
          NEXT_PUBLIC_API_URL: 'https://api.pilot.example',
          PILOT_RELEASE_SHA: releaseSha,
          VERCEL: '1',
          VERCEL_GIT_COMMIT_SHA: 'b'.repeat(40),
        },
      }),
    ).rejects.toThrow(/does not match PILOT_RELEASE_SHA/u);
  });

  it('covers exact Pilot lineage in backup and restore manifests', () => {
    expect(RESTORE_MANIFEST_TABLES).toEqual(
      expect.arrayContaining([
        'position_occurrences',
        'engine_position_states',
        'concept_classification_runs',
        'training_items',
        'grounded_ai_artifacts',
        'pilot_events',
        'coach_review_feedback',
        'ai_claim_feedback',
      ]),
    );
  });
});
