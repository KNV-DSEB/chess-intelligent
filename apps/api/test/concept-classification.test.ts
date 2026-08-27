import { readFile } from 'node:fs/promises';

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

const fixtureUrl = new URL('./fixtures/concept-evidence.pgn', import.meta.url);

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

class ConceptEvidenceFakeEngine implements ChessEngine {
  async identify() {
    return {
      family: 'FAKE' as const,
      reportedName: 'Task 008 Evidence Engine',
      reportedVersion: '1',
      binarySha256: '8'.repeat(64),
    };
  }

  async newGame(): Promise<void> {}

  async analyze(request: EngineAnalysisRequest): Promise<EngineAnalysisResult> {
    const ply = request.position.moves.length;
    const playedMoves = ['e4g5', 'e8f8', 'f3e5', 'c5b4'];
    const bestMoves = ['e4g5', 'e8f8', 'f3e5', 'b6c4'];
    const bestScores = [100, -50, 100, -150];
    const playedScores = [95, -50, 90, -20];
    const rootMove = request.allowedRootMoves?.[0] ?? bestMoves[ply]!;
    const score = request.allowedRootMoves ? playedScores[ply]! : bestScores[ply]!;
    if (request.allowedRootMoves) expect(rootMove).toBe(playedMoves[ply]);
    return { bestMoveUci: rootMove, lines: [engineLine(rootMove, score)] };
  }

  async close(): Promise<void> {}
}

interface ClassificationResponse {
  classificationRunId: string;
  selectedAnalysisRunId: string | null;
  evidenceCount: number;
  deduplicated: boolean;
}

interface EvidenceResponse {
  run: { id: string; selectedAnalysisRunId: string | null };
  limitations: { decisionQualityEvidenceLimited: boolean; message: string };
  evidence: Array<{
    occurrencePly: number;
    conceptStableId: string;
    evidenceTypeStableId: string;
    evidenceRole: string;
    polarity: string;
    subjectKind: string;
    subjectPlayerId: string | null;
    subjectColor: string;
    analysisRunId: string | null;
    classifierId: string;
    classifierVersion: string;
    ruleId: string;
    exactHistorySha256: string;
    facts: Record<string, unknown>;
    concept: { displayName: string };
  }>;
}

describe('Task 008 concept evidence classification', () => {
  let database: Database;
  let app: FastifyInstance;
  let fixture: string;

  beforeEach(async () => {
    fixture = await readFile(fixtureUrl, 'utf8');
    database = await PGliteDatabase.create();
    await runMigrations(database);
    await new OntologyRepository(database).sync(await readOntologySourceFile());
    app = await buildApp({ database });
  });

  afterEach(async () => {
    await app.close();
    await database.close();
  });

  async function importFixture(): Promise<string> {
    const response = await app.inject({
      method: 'POST',
      url: '/games/import-pgn',
      payload: { pgn: fixture, sourceType: 'USER_UPLOAD' },
    });
    expect(response.statusCode).toBe(201);
    return response.json<{ gameId: string }>().gameId;
  }

  async function classify(gameId: string, analysisRunId?: string) {
    return app.inject({
      method: 'POST',
      url: `/classification/games/${gameId}`,
      payload: { ontologyVersion: '1.0.0', ...(analysisRunId ? { analysisRunId } : {}) },
    });
  }

  it('classifies deterministic structural and tactical facts without engine implications', async () => {
    const gameId = await importFixture();
    const created = await classify(gameId);
    expect(created.statusCode).toBe(201);
    const run = created.json<ClassificationResponse>();
    expect(run).toMatchObject({ selectedAnalysisRunId: null, deduplicated: false });
    expect(run.evidenceCount).toBeGreaterThan(0);

    const retrieved = await app.inject({
      method: 'GET',
      url: `/games/${gameId}/concept-evidence`,
    });
    expect(retrieved.statusCode).toBe(200);
    const body = retrieved.json<EvidenceResponse>();
    expect(body.limitations).toMatchObject({ decisionQualityEvidenceLimited: true });
    expect(body.limitations.message).toContain('positive/negative decision evidence is limited');
    expect(body.evidence.every((entry) => entry.polarity === 'NEUTRAL')).toBe(true);

    expect(body.evidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          occurrencePly: 0,
          conceptStableId: 'tactics.discovered_attack',
          evidenceTypeStableId: 'position.tactical_motif',
          subjectKind: 'DECISION',
          subjectColor: 'WHITE',
          facts: expect.objectContaining({ discoveredCheck: true }),
        }),
        expect.objectContaining({
          occurrencePly: 2,
          conceptStableId: 'tactics.fork',
          subjectColor: 'WHITE',
        }),
        expect.objectContaining({
          occurrencePly: 3,
          conceptStableId: 'tactics.pin',
          subjectColor: 'BLACK',
        }),
        expect.objectContaining({
          conceptStableId: 'pawn_structure.isolated_queen_pawn',
          subjectKind: 'POSITION',
          subjectPlayerId: null,
          polarity: 'NEUTRAL',
        }),
        expect.objectContaining({ conceptStableId: 'pawn_structure.doubled_pawns' }),
        expect.objectContaining({ conceptStableId: 'pawn_structure.passed_pawn' }),
      ]),
    );
    expect(
      body.evidence
        .filter((entry) => entry.subjectKind === 'DECISION')
        .every((entry) => entry.subjectPlayerId !== null),
    ).toBe(true);
    expect(
      body.evidence
        .filter((entry) => entry.subjectKind === 'POSITION')
        .every((entry) => entry.subjectPlayerId === null && entry.analysisRunId === null),
    ).toBe(true);

    const repeated = await classify(gameId);
    expect(repeated.statusCode).toBe(200);
    expect(repeated.json<ClassificationResponse>()).toMatchObject({
      classificationRunId: run.classificationRunId,
      evidenceCount: run.evidenceCount,
      deduplicated: true,
    });
    const runCount = await database.query<{ count: string | number }>(
      'SELECT count(*) AS count FROM concept_classification_runs WHERE game_id = $1',
      [gameId],
    );
    expect(Number(runCount.rows[0]?.count)).toBe(1);

    const forkOnly = await app.inject({
      method: 'GET',
      url: `/games/${gameId}/concept-evidence?concept=tactics.fork`,
    });
    expect(
      forkOnly
        .json<EvidenceResponse>()
        .evidence.every((entry) => entry.conceptStableId === 'tactics.fork'),
    ).toBe(true);
  });

  it('adds conservative positive and negative decisions from one compatible exact engine run', async () => {
    const gameId = await importFixture();
    const positionOnlyRun = await classify(gameId);
    expect(positionOnlyRun.statusCode).toBe(201);
    const requested = await app.inject({
      method: 'POST',
      url: '/analysis/jobs',
      payload: { gameId, profile: 'QUICK_V1' },
    });
    const jobId = requested.json<{ id: string }>().id;
    await new AnalysisWorker(
      new AnalysisRepository(database),
      () => new ConceptEvidenceFakeEngine(),
      'task-008-test-worker',
    ).runNext();
    const job = await app.inject({ method: 'GET', url: `/analysis/jobs/${jobId}` });
    const analysisRunId = job.json<{ status: string; runId: string }>().runId;
    expect(job.json()).toMatchObject({ status: 'SUCCEEDED' });

    const created = await classify(gameId, analysisRunId);
    expect(created.statusCode).toBe(201);
    expect(created.json<ClassificationResponse>().selectedAnalysisRunId).toBe(analysisRunId);
    expect(created.json<ClassificationResponse>().classificationRunId).not.toBe(
      positionOnlyRun.json<ClassificationResponse>().classificationRunId,
    );
    const immutableRunCount = await database.query<{ count: string | number }>(
      'SELECT count(*) AS count FROM concept_classification_runs WHERE game_id = $1',
      [gameId],
    );
    expect(Number(immutableRunCount.rows[0]?.count)).toBe(2);
    const runView = await app.inject({
      method: 'GET',
      url: `/classification/runs/${created.json<ClassificationResponse>().classificationRunId}`,
    });
    expect(runView.statusCode).toBe(200);
    expect(runView.json()).toMatchObject({
      ontologyVersion: '1.0.0',
      classifiers: expect.arrayContaining([
        { classifierId: 'POSITION_STRUCTURE_CLASSIFIER', classifierVersion: 'V1' },
        { classifierId: 'TACTICAL_DECISION_CLASSIFIER', classifierVersion: 'V1' },
        { classifierId: 'TACTICAL_MOTIF_CLASSIFIER', classifierVersion: 'V1' },
      ]),
    });
    const projection = await app.inject({
      method: 'GET',
      url: `/games/${gameId}/concept-evidence?classificationRunId=${created.json<ClassificationResponse>().classificationRunId}`,
    });
    const evidence = projection.json<EvidenceResponse>();
    expect(evidence.limitations.decisionQualityEvidenceLimited).toBe(false);
    expect(evidence.evidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          occurrencePly: 0,
          conceptStableId: 'tactics.discovered_attack',
          evidenceTypeStableId: 'decision.classification',
          polarity: 'POSITIVE',
          analysisRunId,
        }),
        expect.objectContaining({
          occurrencePly: 2,
          conceptStableId: 'tactics.fork',
          evidenceTypeStableId: 'decision.classification',
          polarity: 'POSITIVE',
          analysisRunId,
        }),
        expect.objectContaining({
          occurrencePly: 3,
          conceptStableId: 'tactics.fork',
          evidenceTypeStableId: 'decision.classification',
          polarity: 'NEGATIVE',
          analysisRunId,
          ruleId: 'MISSED_TACTICAL_MOTIF_V1',
        }),
      ]),
    );
    expect(
      evidence.evidence
        .filter((entry) => entry.polarity !== 'NEUTRAL')
        .every(
          (entry) =>
            entry.analysisRunId === analysisRunId &&
            entry.exactHistorySha256.match(/^[a-f0-9]{64}$/u),
        ),
    ).toBe(true);

    await database.query(
      `UPDATE engine_position_states SET history_sha256 = $2
       WHERE analysis_run_id = $1 AND occurrence_ply = 0`,
      [analysisRunId, '0'.repeat(64)],
    );
    const incompatible = await classify(gameId, analysisRunId);
    expect(incompatible.statusCode).toBe(409);
    expect(incompatible.json()).toMatchObject({ error: { code: 'EXACT_HISTORY_MISMATCH' } });
  });

  it('validates requests and never classifies metadata-only games', async () => {
    const invalidOntology = await app.inject({
      method: 'POST',
      url: '/classification/games/00000000-0000-4000-8000-000000000001',
      payload: { ontologyVersion: 'not-a-version' },
    });
    expect(invalidOntology.statusCode).toBe(400);

    const metadata = await app.inject({
      method: 'POST',
      url: '/games/import-metadata',
      payload: {
        result: '*',
        white: { displayName: 'Metadata White' },
        black: { displayName: 'Metadata Black' },
      },
    });
    const rejected = await classify(metadata.json<{ gameId: string }>().gameId);
    expect(rejected.statusCode).toBe(409);
    expect(rejected.json()).toMatchObject({ error: { code: 'MOVES_REQUIRED' } });

    const gameId = await importFixture();
    const absentOntology = await app.inject({
      method: 'POST',
      url: `/classification/games/${gameId}`,
      payload: { ontologyVersion: '9.9.9' },
    });
    expect(absentOntology.statusCode).toBe(404);
    expect(absentOntology.json()).toMatchObject({ error: { code: 'ONTOLOGY_NOT_FOUND' } });
  });
});
