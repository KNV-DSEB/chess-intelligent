import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';

import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  AnalysisRepository,
  OntologyRepository,
  readOntologySourceFile,
  runMigrations,
  type Database,
} from '@chess-intelligent/db';
import { PGliteDatabase } from '@chess-intelligent/db/testing';
import type {
  ChessEngine,
  EngineAnalysisRequest,
  EngineAnalysisResult,
  EnginePrincipalVariation,
} from '@chess-intelligent/domain';
import { AnalysisWorker } from '../../worker/src/analysis-worker';

import { buildApp } from '../src/app';

const conceptFixtureUrl = new URL('./fixtures/concept-evidence.pgn', import.meta.url);
const ordinaryFixtureUrl = new URL('./fixtures/successful.pgn', import.meta.url);
const fideId = '12456789';

function engineLine(rootMoveUci: string, centipawns: number): EnginePrincipalVariation {
  return {
    pvRank: 1,
    rootMoveUci,
    moves: [rootMoveUci],
    score: { kind: 'CENTIPAWN', centipawns },
    depth: 10,
    seldepth: 12,
    nodes: 800,
    nps: 40_000,
    timeMs: 20,
    hashfull: 2,
  };
}

class SkillGraphFakeEngine implements ChessEngine {
  async identify() {
    return {
      family: 'FAKE' as const,
      reportedName: 'Task 009 Evidence Engine',
      reportedVersion: '1',
      binarySha256: '9'.repeat(64),
    };
  }

  async newGame(): Promise<void> {}

  async analyze(request: EngineAnalysisRequest): Promise<EngineAnalysisResult> {
    const ply = request.position.moves.length;
    const bestMoves = ['e4g5', 'e8f8', 'f3e5', 'b6c4'];
    const bestScores = [100, -50, 100, -150];
    const playedScores = [95, -50, 90, -20];
    const rootMove = request.allowedRootMoves?.[0] ?? bestMoves[ply]!;
    const score = request.allowedRootMoves ? playedScores[ply]! : bestScores[ply]!;
    return { bestMoveUci: rootMove, lines: [engineLine(rootMove, score)] };
  }

  async close(): Promise<void> {}
}

interface SkillGraphResponse {
  run: {
    id: string;
    playerId: string;
    ontologyVersion: string;
    policyConfigSha256: string;
    deduplicated?: boolean;
  };
  coverage: {
    canonicalGames: number;
    gamesWithMoves: number;
    decisionOccurrences: number;
    classifiedDecisions: number;
    engineBackedDecisions: number;
    masteryEligibleEvidence: number;
    positiveMasteryEvidence: number;
    negativeMasteryEvidence: number;
    selectedClassificationRuns: number;
  };
  concepts: Array<{
    conceptStableId: string;
    displayName: string;
    status: string;
    posteriorMean: number | null;
    displayPosteriorMean: number | null;
    positiveEvidenceMass: number;
    negativeEvidenceMass: number;
    neutralExposureCount: number;
    masteryBand: string | null;
  }>;
  selectedClassificationRuns: Array<{
    gameId: string;
    classificationRunId: string;
    selectedAnalysisRunId: string | null;
  }>;
}

describe('Task 009 Player Skill Graph', () => {
  let database: Database;
  let app: FastifyInstance;
  let conceptFixture: string;
  let ordinaryFixture: string;

  beforeEach(async () => {
    [conceptFixture, ordinaryFixture] = await Promise.all([
      readFile(conceptFixtureUrl, 'utf8'),
      readFile(ordinaryFixtureUrl, 'utf8'),
    ]);
    database = await PGliteDatabase.create();
    await runMigrations(database);
    await new OntologyRepository(database).sync(await readOntologySourceFile());
    app = await buildApp({ database });
  });

  afterEach(async () => {
    await app.close();
    await database.close();
  });

  async function importPgn(pgn: string): Promise<string> {
    const response = await app.inject({
      method: 'POST',
      url: '/games/import-pgn',
      payload: { pgn, sourceType: 'USER_UPLOAD' },
    });
    expect(response.statusCode).toBe(201);
    return response.json<{ gameId: string }>().gameId;
  }

  async function classify(gameId: string, analysisRunId?: string): Promise<string> {
    const response = await app.inject({
      method: 'POST',
      url: `/classification/games/${gameId}`,
      payload: { ontologyVersion: '1.0.0', ...(analysisRunId ? { analysisRunId } : {}) },
    });
    expect([200, 201]).toContain(response.statusCode);
    return response.json<{ classificationRunId: string }>().classificationRunId;
  }

  async function analyze(gameId: string): Promise<string> {
    const request = await app.inject({
      method: 'POST',
      url: '/analysis/jobs',
      payload: { gameId, profile: 'QUICK_V1' },
    });
    const jobId = request.json<{ id: string }>().id;
    await new AnalysisWorker(
      new AnalysisRepository(database),
      () => new SkillGraphFakeEngine(),
      'task-009-test-worker',
    ).runNext();
    const job = await app.inject({ method: 'GET', url: `/analysis/jobs/${jobId}` });
    expect(job.json()).toMatchObject({ status: 'SUCCEEDED' });
    return job.json<{ runId: string }>().runId;
  }

  async function prepareFixture(): Promise<{
    focalPlayerId: string;
    conceptGameId: string;
    ordinaryGameId: string;
    engineClassificationRunId: string;
  }> {
    const conceptGameId = await importPgn(conceptFixture);
    await database.query(
      `UPDATE games SET game_context = 'OTB', time_category = 'CLASSICAL',
                        played_at = '2026-08-22'::date
       WHERE id = $1`,
      [conceptGameId],
    );
    const focal = await database.query<{ player_id: string }>(
      `SELECT player_id FROM game_players WHERE game_id = $1 AND color = 'WHITE'`,
      [conceptGameId],
    );
    const focalPlayerId = focal.rows[0]!.player_id;
    await database.query(
      `INSERT INTO external_identities (
         id, player_id, provider, external_id, verification_status, confidence, link_reason
       ) VALUES ($1, $2, 'FIDE', $3, 'VERIFIED', 1, 'TASK_009_ACCEPTANCE_FIXTURE')`,
      [randomUUID(), focalPlayerId, fideId],
    );
    await database.query(
      `INSERT INTO game_source_records (
         id, game_id, data_source_id, permission_basis, raw_source_metadata
       )
       SELECT $1, game_id, data_source_id, permission_basis,
              '{"fixture":"duplicate-provenance-observation"}'::jsonb
       FROM game_source_records
       WHERE game_id = $2
       LIMIT 1`,
      [randomUUID(), conceptGameId],
    );

    await classify(conceptGameId);
    const analysisRunId = await analyze(conceptGameId);
    const engineClassificationRunId = await classify(conceptGameId, analysisRunId);
    await database.query(
      `INSERT INTO concept_classification_runs (
         id, game_id, ontology_version_id, ontology_version,
         classifier_bundle_version, classifier_config_sha256,
         selected_analysis_run_id, status, evidence_count, completed_at
       )
       SELECT $1, game_id, ontology_version_id, ontology_version,
              'INCOMPATIBLE_BUNDLE', classifier_config_sha256,
              selected_analysis_run_id, 'SUCCEEDED', 0, now()
       FROM concept_classification_runs WHERE id = $2`,
      [randomUUID(), engineClassificationRunId],
    );
    await database.query(
      `INSERT INTO concept_classification_runs (
         id, game_id, ontology_version_id, ontology_version,
         classifier_bundle_version, classifier_config_sha256,
         selected_analysis_run_id, status, evidence_count, completed_at
       )
       SELECT $1, game_id, ontology_version_id, ontology_version,
              classifier_bundle_version, $3,
              selected_analysis_run_id, 'SUCCEEDED', 0, now()
       FROM concept_classification_runs WHERE id = $2`,
      [randomUUID(), engineClassificationRunId, 'f'.repeat(64)],
    );
    await database.query(
      `INSERT INTO concept_classification_runs (
         id, game_id, ontology_version_id, ontology_version,
         classifier_bundle_version, classifier_config_sha256,
         selected_analysis_run_id, status, evidence_count,
         error_code, error_message, completed_at
       )
       SELECT $1, game_id, ontology_version_id, ontology_version,
              classifier_bundle_version, classifier_config_sha256,
              NULL, 'FAILED', 0, 'FIXTURE_FAILURE', 'Expected fixture failure', now()
       FROM concept_classification_runs WHERE id = $2`,
      [randomUUID(), engineClassificationRunId],
    );

    const ordinaryGameId = await importPgn(ordinaryFixture);
    await database.query(
      `UPDATE games SET game_context = 'OTB', time_category = 'CLASSICAL',
                        played_at = '2025-08-27'::date
       WHERE id = $1`,
      [ordinaryGameId],
    );
    await database.query(
      `UPDATE game_players SET player_id = $2, display_name = 'Evidence, White'
       WHERE game_id = $1 AND color = 'WHITE'`,
      [ordinaryGameId, focalPlayerId],
    );
    await classify(ordinaryGameId);
    return { focalPlayerId, conceptGameId, ordinaryGameId, engineClassificationRunId };
  }

  async function generate(): Promise<ReturnType<FastifyInstance['inject']>> {
    return app.inject({
      method: 'POST',
      url: '/intelligence/player-skill-graph',
      payload: {
        externalIdentity: { provider: 'FIDE', externalId: fideId },
        ontologyVersion: '1.0.0',
        asOfDate: '2026-08-27',
        scope: { gameContexts: ['OTB'], timeCategories: ['CLASSICAL'] },
      },
    });
  }

  it('builds a version-pinned coverage-first graph and preserves exact evidence lineage', async () => {
    const fixture = await prepareFixture();
    const response = await generate();
    expect(response.statusCode).toBe(201);
    const graph = response.json<SkillGraphResponse>();
    expect(graph.run).toMatchObject({
      playerId: fixture.focalPlayerId,
      ontologyVersion: '1.0.0',
      policyConfigSha256: expect.stringMatching(/^[a-f0-9]{64}$/u),
      deduplicated: false,
    });
    expect(graph.coverage).toMatchObject({
      canonicalGames: 2,
      gamesWithMoves: 2,
      decisionOccurrences: 12,
      engineBackedDecisions: 2,
      selectedClassificationRuns: 2,
      positiveMasteryEvidence: 2,
      negativeMasteryEvidence: 0,
      masteryEligibleEvidence: 2,
    });
    expect(graph.coverage.classifiedDecisions).toBeGreaterThan(0);
    expect(graph.coverage.classifiedDecisions).toBeLessThan(graph.coverage.decisionOccurrences);
    expect(graph.selectedClassificationRuns).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          gameId: fixture.conceptGameId,
          classificationRunId: fixture.engineClassificationRunId,
          selectedAnalysisRunId: expect.any(String),
        }),
        expect.objectContaining({
          gameId: fixture.ordinaryGameId,
          selectedAnalysisRunId: null,
        }),
      ]),
    );

    const fork = graph.concepts.find((concept) => concept.conceptStableId === 'tactics.fork')!;
    expect(fork).toMatchObject({
      status: 'INSUFFICIENT_EVIDENCE',
      posteriorMean: expect.any(Number),
      displayPosteriorMean: null,
      positiveEvidenceMass: expect.any(Number),
      negativeEvidenceMass: 0,
      masteryBand: null,
    });
    expect(fork.positiveEvidenceMass).toBeGreaterThan(0);

    const detail = await app.inject({
      method: 'GET',
      url: `/skill-graph/runs/${graph.run.id}/concepts/tactics.fork`,
    });
    expect(detail.statusCode).toBe(200);
    const concept = detail.json<{
      reconstruction: { matchesPersistedState: boolean };
      contributions: Array<{
        gameId: string;
        evidence: Array<{
          conceptEvidenceInstanceId: string;
          subjectPlayerId: string;
          subjectColor: string;
          analysisRunId: string;
        }>;
      }>;
    }>();
    expect(concept.reconstruction.matchesPersistedState).toBe(true);
    expect(concept.contributions).toHaveLength(1);
    expect(concept.contributions[0]?.gameId).toBe(fixture.conceptGameId);
    expect(concept.contributions[0]?.evidence).toEqual([
      expect.objectContaining({
        conceptEvidenceInstanceId: expect.any(String),
        subjectPlayerId: fixture.focalPlayerId,
        subjectColor: 'WHITE',
        analysisRunId: expect.any(String),
      }),
    ]);

    const lineage = await database.query<{ evidence_id: string; source_id: string }>(
      `SELECT lineage.concept_evidence_instance_id AS evidence_id, evidence.id AS source_id
       FROM skill_graph_evidence_contributions lineage
       JOIN concept_evidence_instances evidence
         ON evidence.id = lineage.concept_evidence_instance_id
       WHERE lineage.skill_graph_run_id = $1`,
      [graph.run.id],
    );
    expect(lineage.rows.length).toBe(graph.coverage.masteryEligibleEvidence);
    expect(lineage.rows.every((row) => row.evidence_id === row.source_id)).toBe(true);

    const runView = await app.inject({
      method: 'GET',
      url: `/skill-graph/runs/${graph.run.id}`,
    });
    expect(runView.statusCode).toBe(200);
    expect(runView.json<SkillGraphResponse>().coverage).toEqual(graph.coverage);
    const history = await app.inject({
      method: 'GET',
      url: `/players/${fixture.focalPlayerId}/skill-graph-runs`,
    });
    expect(history.statusCode).toBe(200);
    expect(history.json<{ runs: Array<{ id: string }> }>().runs).toEqual([
      expect.objectContaining({ id: graph.run.id }),
    ]);

    const repeated = await generate();
    expect(repeated.statusCode).toBe(200);
    expect(repeated.json<SkillGraphResponse>().run).toMatchObject({
      id: graph.run.id,
      deduplicated: true,
    });
  });

  it('isolates ontology versions and renders metadata from the explicitly requested snapshot', async () => {
    const fixture = await prepareFixture();
    const source = await readOntologySourceFile();
    await new OntologyRepository(database).sync({
      ...source,
      version: '1.0.1',
      concepts: source.concepts.map((concept) =>
        concept.stableId === 'tactics.fork'
          ? { ...concept, displayName: 'Fork (1.0.1 fixture)' }
          : concept,
      ),
    });
    const v101Classification = await app.inject({
      method: 'POST',
      url: `/classification/games/${fixture.conceptGameId}`,
      payload: { ontologyVersion: '1.0.1' },
    });
    expect([200, 201]).toContain(v101Classification.statusCode);
    const v101ClassificationRunId = v101Classification.json<{
      classificationRunId: string;
    }>().classificationRunId;

    const v100 = await generate();
    const v100Graph = v100.json<SkillGraphResponse>();
    expect(
      v100Graph.concepts.find((concept) => concept.conceptStableId === 'tactics.fork')?.displayName,
    ).toBe('Fork');
    expect(v100Graph.coverage).toMatchObject({
      selectedClassificationRuns: 2,
      masteryEligibleEvidence: 2,
    });

    const v101 = await app.inject({
      method: 'POST',
      url: '/intelligence/player-skill-graph',
      payload: {
        playerId: fixture.focalPlayerId,
        ontologyVersion: '1.0.1',
        asOfDate: '2026-08-27',
        scope: { gameContexts: ['OTB'], timeCategories: ['CLASSICAL'] },
      },
    });
    expect(v101.statusCode).toBe(201);
    const v101Graph = v101.json<SkillGraphResponse>();
    expect(
      v101Graph.concepts.find((concept) => concept.conceptStableId === 'tactics.fork')?.displayName,
    ).toBe('Fork (1.0.1 fixture)');
    expect(v101Graph.coverage).toMatchObject({
      selectedClassificationRuns: 1,
      masteryEligibleEvidence: 2,
      positiveMasteryEvidence: 2,
      negativeMasteryEvidence: 0,
    });
    expect(v101Graph.selectedClassificationRuns).toEqual([
      expect.objectContaining({ classificationRunId: v101ClassificationRunId }),
    ]);

    const [v100Detail, v101Detail] = await Promise.all([
      app.inject({
        method: 'GET',
        url: `/skill-graph/runs/${v100Graph.run.id}/concepts/tactics.fork`,
      }),
      app.inject({
        method: 'GET',
        url: `/skill-graph/runs/${v101Graph.run.id}/concepts/tactics.fork`,
      }),
    ]);
    const evidenceIds = (response: typeof v100Detail): string[] =>
      response
        .json<{
          contributions: Array<{
            evidence: Array<{ conceptEvidenceInstanceId: string }>;
          }>;
        }>()
        .contributions.flatMap((contribution) =>
          contribution.evidence.map((evidence) => evidence.conceptEvidenceInstanceId),
        );
    expect(evidenceIds(v100Detail)).not.toEqual(evidenceIds(v101Detail));
    expect(evidenceIds(v100Detail).filter((id) => evidenceIds(v101Detail).includes(id))).toEqual(
      [],
    );
  });

  it('attributes Black evidence only to Black and never turns missing engine data negative', async () => {
    const fixture = await prepareFixture();
    const black = await database.query<{ player_id: string }>(
      `SELECT player_id FROM game_players WHERE game_id = $1 AND color = 'BLACK'`,
      [fixture.conceptGameId],
    );
    const response = await app.inject({
      method: 'POST',
      url: '/intelligence/player-skill-graph',
      payload: {
        playerId: black.rows[0]!.player_id,
        ontologyVersion: '1.0.0',
        asOfDate: '2026-08-27',
        scope: { gameContexts: ['OTB'], timeCategories: ['CLASSICAL'] },
      },
    });
    expect(response.statusCode).toBe(201);
    const graph = response.json<SkillGraphResponse>();
    const fork = graph.concepts.find((concept) => concept.conceptStableId === 'tactics.fork')!;
    expect(graph.coverage).toMatchObject({
      canonicalGames: 1,
      decisionOccurrences: 2,
      engineBackedDecisions: 2,
      positiveMasteryEvidence: 0,
      negativeMasteryEvidence: 1,
    });
    expect(fork.negativeEvidenceMass).toBeGreaterThan(0);
    expect(fork.positiveEvidenceMass).toBe(0);

    const white = (await generate()).json<SkillGraphResponse>();
    expect(white.coverage.decisionOccurrences).toBeGreaterThan(
      white.coverage.engineBackedDecisions,
    );
    expect(white.coverage.negativeMasteryEvidence).toBe(0);
  });

  it('applies context, time, date, and source scope without silently broadening it', async () => {
    await prepareFixture();
    const oneGame = await app.inject({
      method: 'POST',
      url: '/intelligence/player-skill-graph',
      payload: {
        externalIdentity: { provider: 'FIDE', externalId: fideId },
        ontologyVersion: '1.0.0',
        asOfDate: '2026-08-27',
        scope: {
          gameContexts: ['OTB'],
          timeCategories: ['CLASSICAL'],
          playedFrom: '2026-08-01',
          playedTo: '2026-08-31',
          sourceTypes: ['USER_UPLOAD'],
        },
      },
    });
    expect(oneGame.statusCode).toBe(201);
    expect(oneGame.json<SkillGraphResponse>().coverage).toMatchObject({
      canonicalGames: 1,
      decisionOccurrences: 2,
      selectedClassificationRuns: 1,
    });

    const absentSource = await app.inject({
      method: 'POST',
      url: '/intelligence/player-skill-graph',
      payload: {
        externalIdentity: { provider: 'FIDE', externalId: fideId },
        ontologyVersion: '1.0.0',
        asOfDate: '2026-08-27',
        scope: {
          gameContexts: ['OTB'],
          timeCategories: ['CLASSICAL'],
          sourceTypes: ['FIDE'],
        },
      },
    });
    expect(absentSource.statusCode).toBe(201);
    expect(absentSource.json<SkillGraphResponse>().coverage).toMatchObject({
      canonicalGames: 0,
      decisionOccurrences: 0,
      classifiedDecisions: 0,
      engineBackedDecisions: 0,
      masteryEligibleEvidence: 0,
    });
  });

  it('requires an explicit published ontology and validates date/scope requests', async () => {
    const missingVersion = await app.inject({
      method: 'POST',
      url: '/intelligence/player-skill-graph',
      payload: {
        playerId: '10000000-0000-4000-8000-000000000001',
        asOfDate: '2026-08-27',
      },
    });
    expect(missingVersion.statusCode).toBe(400);

    const invalidDate = await app.inject({
      method: 'POST',
      url: '/intelligence/player-skill-graph',
      payload: {
        playerId: '10000000-0000-4000-8000-000000000001',
        ontologyVersion: '1.0.0',
        asOfDate: '2026-02-30',
      },
    });
    expect(invalidDate.statusCode).toBe(400);
  });
});
