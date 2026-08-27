import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { OntologyRepository, runMigrations, type Database } from '@chess-intelligent/db';
import { readOntologySourceFile } from '@chess-intelligent/db';
import { PGliteDatabase } from '@chess-intelligent/db/testing';

import { buildApp } from '../src/app';

describe('Task 007 read-only ontology API', () => {
  let database: Database;
  let app: FastifyInstance;

  beforeEach(async () => {
    database = await PGliteDatabase.create();
    await runMigrations(database);
    await new OntologyRepository(database).sync(await readOntologySourceFile());
    app = await buildApp({ database });
  });

  afterEach(async () => {
    await app.close();
    await database.close();
  });

  it('lists published versions and retrieves latest/full immutable metadata', async () => {
    const versions = await app.inject({ method: 'GET', url: '/ontology/versions' });
    expect(versions.statusCode).toBe(200);
    expect(versions.json()).toEqual({
      versions: [
        expect.objectContaining({
          version: '1.0.0',
          status: 'PUBLISHED',
          contentSha256: expect.stringMatching(/^[a-f0-9]{64}$/u),
          conceptCount: 64,
          domainCount: 7,
          prerequisiteCount: 24,
          evidenceTypeCount: 12,
          evidencePolicyCount: 190,
        }),
      ],
    });

    const latest = await app.inject({ method: 'GET', url: '/ontology/latest' });
    expect(latest.statusCode).toBe(200);
    expect(latest.json()).toMatchObject({
      version: '1.0.0',
      status: 'PUBLISHED',
      filter: null,
      counts: { concepts: 64, domains: 7, prerequisites: 24, evidenceTypes: 12 },
    });

    const versioned = await app.inject({ method: 'GET', url: '/ontology/1.0.0' });
    expect(versioned.statusCode).toBe(200);
    expect(versioned.json().contentSha256).toBe(latest.json().contentSha256);
  });

  it('filters an exact top-level domain without fuzzy fallback', async () => {
    const response = await app.inject({ method: 'GET', url: '/ontology/latest?domain=tactics' });
    expect(response.statusCode).toBe(200);
    const body = response.json<{
      filter: { domainStableId: string };
      concepts: Array<{ stableId: string }>;
      evidencePolicies: Array<{ conceptStableId: string }>;
    }>();
    expect(body.filter.domainStableId).toBe('domain.tactics');
    expect(body.concepts).toHaveLength(14);
    expect(
      body.concepts.every(
        (concept) =>
          concept.stableId.startsWith('tactics.') || concept.stableId === 'domain.tactics',
      ),
    ).toBe(true);
    expect(
      body.evidencePolicies.every((policy) => policy.conceptStableId.startsWith('tactics.')),
    ).toBe(true);

    const unknown = await app.inject({ method: 'GET', url: '/ontology/latest?domain=tactic' });
    expect(unknown.statusCode).toBe(404);
    expect(unknown.json()).toMatchObject({ error: { code: 'DOMAIN_NOT_FOUND' } });
  });

  it('returns concept hierarchy, prerequisite, dependent, and evidence detail', async () => {
    const deflection = await app.inject({
      method: 'GET',
      url: '/ontology/1.0.0/concepts/tactics.deflection',
    });
    expect(deflection.statusCode).toBe(200);
    expect(deflection.json()).toMatchObject({
      version: '1.0.0',
      concept: {
        stableId: 'tactics.deflection',
        parent: { stableId: 'domain.tactics' },
        allowedEvidence: expect.arrayContaining([
          expect.objectContaining({ stableId: 'position.tactical_motif', role: 'DIRECT' }),
          expect.objectContaining({ stableId: 'engine.eval_loss', role: 'CONTEXTUAL' }),
        ]),
      },
    });

    const triangulation = await app.inject({
      method: 'GET',
      url: '/ontology/1.0.0/concepts/endgame.triangulation',
    });
    expect(triangulation.json()).toMatchObject({
      concept: {
        prerequisites: [expect.objectContaining({ stableId: 'endgame.opposition' })],
      },
    });
  });

  it('uses clear 400 and 404 contracts for invalid or absent resources', async () => {
    const invalidVersion = await app.inject({ method: 'GET', url: '/ontology/v1' });
    expect(invalidVersion.statusCode).toBe(400);
    expect(invalidVersion.json()).toMatchObject({ error: { code: 'INVALID_ONTOLOGY_QUERY' } });

    const missingVersion = await app.inject({ method: 'GET', url: '/ontology/9.9.9' });
    expect(missingVersion.statusCode).toBe(404);
    expect(missingVersion.json()).toMatchObject({ error: { code: 'ONTOLOGY_NOT_FOUND' } });

    const missingConcept = await app.inject({
      method: 'GET',
      url: '/ontology/1.0.0/concepts/tactics.unknown',
    });
    expect(missingConcept.statusCode).toBe(404);
    expect(missingConcept.json()).toMatchObject({ error: { code: 'CONCEPT_NOT_FOUND' } });
  });
});
