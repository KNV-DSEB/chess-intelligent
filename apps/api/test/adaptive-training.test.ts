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

const fixtureUrl = new URL('./fixtures/concept-evidence.pgn', import.meta.url);
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

class TrainingFixtureEngine implements ChessEngine {
  constructor(private readonly finalMode: 'FORK_MISS' | 'PIN_SOUND') {}

  async identify() {
    return {
      family: 'FAKE' as const,
      reportedName: `Task 010 ${this.finalMode}`,
      reportedVersion: '1',
      binarySha256: (this.finalMode === 'FORK_MISS' ? '8' : '7').repeat(64),
    };
  }

  async newGame(): Promise<void> {}

  async analyze(request: EngineAnalysisRequest): Promise<EngineAnalysisResult> {
    const ply = request.position.moves.length;
    const forkBestMoves = ['e4g5', 'e8f8', 'f3e5', 'b6c4'];
    const bestMoves =
      this.finalMode === 'PIN_SOUND' ? [...forkBestMoves.slice(0, 3), 'c5b4'] : forkBestMoves;
    const bestScores = [100, -50, 100, this.finalMode === 'PIN_SOUND' ? -20 : -150];
    const playedScores = [95, -50, 90, -20];
    const rootMove = request.allowedRootMoves?.[0] ?? bestMoves[ply]!;
    const score = request.allowedRootMoves ? playedScores[ply]! : bestScores[ply]!;
    return { bestMoveUci: rootMove, lines: [engineLine(rootMove, score)] };
  }

  async close(): Promise<void> {}
}

interface PlanResponse {
  run: { id: string; deduplicated?: boolean };
  remediationCandidates: Array<{
    conceptStableId: string;
    disposition: string;
    candidateType: string;
  }>;
  diagnosticCandidates: Array<{
    conceptStableId: string;
    disposition: string;
    candidateType: string;
  }>;
  unavailableCandidates: Array<{ conceptStableId: string; disposition: string }>;
  trainingItems: Array<{
    id: string;
    trainingMode: 'REMEDIATION' | 'DIAGNOSTIC';
    targetConcept: { stableId: string } | null;
    source: null | { gameId: string };
    acceptedMoveUcis?: string[];
  }>;
}

describe('Task 010 Adaptive Training Engine', () => {
  let database: Database;
  let app: FastifyInstance;
  let fixture: string;

  beforeEach(async () => {
    fixture = await readFile(fixtureUrl, 'utf8');
    database = await PGliteDatabase.create();
    await runMigrations(database);
    await new OntologyRepository(database).sync(await readOntologySourceFile());
    app = await buildApp({ database, internalDevRoutes: true });
  });

  afterEach(async () => {
    await app.close();
    await database.close();
  });

  async function importFixture(date: string): Promise<string> {
    const pgn = fixture.replace('[Date "2026.08.22"]', `[Date "${date.replaceAll('-', '.')}"]`);
    const response = await app.inject({
      method: 'POST',
      url: '/games/import-pgn',
      payload: { pgn, sourceType: 'USER_UPLOAD' },
    });
    expect(response.statusCode).toBe(201);
    const gameId = response.json<{ gameId: string }>().gameId;
    await database.query(
      `UPDATE games SET game_context = 'OTB', time_category = 'CLASSICAL', played_at = $2::date
       WHERE id = $1`,
      [gameId, date],
    );
    return gameId;
  }

  async function analyze(gameId: string, mode: 'FORK_MISS' | 'PIN_SOUND'): Promise<string> {
    const requested = await app.inject({
      method: 'POST',
      url: '/analysis/jobs',
      payload: { gameId, profile: 'QUICK_V1' },
    });
    expect(requested.statusCode).toBe(202);
    const jobId = requested.json<{ id: string }>().id;
    await new AnalysisWorker(
      new AnalysisRepository(database),
      () => new TrainingFixtureEngine(mode),
      `task-010-${mode}`,
    ).runNext();
    const job = await app.inject({ method: 'GET', url: `/analysis/jobs/${jobId}` });
    expect(job.json()).toMatchObject({ status: 'SUCCEEDED' });
    return job.json<{ runId: string }>().runId;
  }

  async function classify(gameId: string, analysisRunId: string): Promise<void> {
    const response = await app.inject({
      method: 'POST',
      url: `/classification/games/${gameId}`,
      payload: { ontologyVersion: '1.0.0', analysisRunId },
    });
    expect(response.statusCode).toBe(201);
  }

  async function prepare(): Promise<{
    playerId: string;
    skillGraphRunId: string;
  }> {
    const forkGameId = await importFixture('2026-08-22');
    const pinGameId = await importFixture('2026-08-23');
    const focal = await database.query<{ player_id: string }>(
      `SELECT player_id FROM game_players WHERE game_id = $1 AND color = 'BLACK'`,
      [forkGameId],
    );
    const playerId = focal.rows[0]!.player_id;
    await database.query(
      `UPDATE game_players SET player_id = $2, display_name = 'Evidence, Black'
       WHERE game_id = $1 AND color = 'BLACK'`,
      [pinGameId, playerId],
    );
    await database.query(
      `INSERT INTO external_identities (
         id, player_id, provider, external_id, verification_status, confidence, link_reason
       ) VALUES ($1, $2, 'FIDE', $3, 'VERIFIED', 1, 'TASK_010_ACCEPTANCE_FIXTURE')`,
      [randomUUID(), playerId, fideId],
    );
    await classify(forkGameId, await analyze(forkGameId, 'FORK_MISS'));
    await classify(pinGameId, await analyze(pinGameId, 'PIN_SOUND'));
    const graphResponse = await app.inject({
      method: 'POST',
      url: '/intelligence/player-skill-graph',
      payload: {
        playerId,
        ontologyVersion: '1.0.0',
        asOfDate: '2026-08-27',
        scope: { gameContexts: ['OTB'], timeCategories: ['CLASSICAL'] },
      },
    });
    expect(graphResponse.statusCode).toBe(201);
    const skillGraphRunId = graphResponse.json<{ run: { id: string } }>().run.id;
    // The fixture represents the acceptance's already-established Task 009 diagnosis. Candidate
    // selection consumes this immutable state; source truth still comes from exact Task 008 rows.
    await database.query(
      `UPDATE player_concept_states
       SET status = 'ESTIMATED', posterior_alpha = 2, posterior_beta = 6,
           posterior_mean = 0.25, positive_evidence_mass = 0,
           negative_evidence_mass = 4, effective_evidence_mass = 4,
           raw_positive_count = 0, raw_negative_count = 4,
           canonical_game_count = 4, evidence_confidence = 'MODERATE',
           mastery_band = 'DEVELOPING', first_evidence_at = '2026-08-22'::date,
           last_evidence_at = '2026-08-22'::date,
           game_positive_evidence_mass = 0, game_negative_evidence_mass = 4,
           training_positive_evidence_mass = 0, training_negative_evidence_mass = 0,
           training_item_count = 0, independent_evidence_unit_count = 4
       WHERE skill_graph_run_id = $1 AND concept_stable_id = 'tactics.fork'`,
      [skillGraphRunId],
    );
    return { playerId, skillGraphRunId };
  }

  it('closes the explicit plan → item → attempt → evidence → V2 graph loop', async () => {
    const fixtureState = await prepare();
    const request = {
      method: 'POST' as const,
      url: '/training/plans',
      payload: { ...fixtureState, maxItems: 10 },
    };
    const created = await app.inject(request);
    expect(created.statusCode).toBe(201);
    const plan = created.json<PlanResponse>();
    expect(plan.remediationCandidates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          conceptStableId: 'tactics.fork',
          candidateType: 'REMEDIATION',
          disposition: 'ELIGIBLE',
        }),
      ]),
    );
    expect(plan.diagnosticCandidates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          conceptStableId: 'tactics.pin',
          candidateType: 'DIAGNOSTIC',
          disposition: 'ELIGIBLE',
        }),
      ]),
    );
    expect(plan.unavailableCandidates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          conceptStableId: 'tactics.skewer',
          disposition: 'NO_ITEM_SOURCE',
        }),
        expect.objectContaining({
          conceptStableId: 'pawn_structure.passed_pawn',
          disposition: 'UNSUPPORTED_CONCEPT_V1',
        }),
      ]),
    );

    const repeated = await app.inject(request);
    expect(repeated.statusCode).toBe(200);
    expect(repeated.json<PlanResponse>().run).toMatchObject({
      id: plan.run.id,
      deduplicated: true,
    });

    const fork = plan.trainingItems.find((item) => item.trainingMode === 'REMEDIATION')!;
    const persistedPin = await database.query<{ id: string; accepted_move_ucis: string[] }>(
      `SELECT id, accepted_move_ucis FROM training_items
       WHERE training_plan_run_id = $1 AND concept_stable_id = 'tactics.pin'`,
      [plan.run.id],
    );
    expect(persistedPin.rows[0]?.accepted_move_ucis).toEqual(['c5b4']);
    const pin = plan.trainingItems.find((item) => item.id === persistedPin.rows[0]!.id)!;
    expect(fork).toMatchObject({ targetConcept: { stableId: 'tactics.fork' }, source: null });
    expect(fork).not.toHaveProperty('acceptedMoveUcis');
    expect(pin).toMatchObject({ targetConcept: null, source: null });
    expect(pin).not.toHaveProperty('acceptedMoveUcis');

    const wrongPlayer = await app.inject({
      method: 'POST',
      url: `/training/items/${fork.id}/attempts`,
      payload: { playerId: randomUUID(), moveUci: 'c5b4' },
    });
    expect(wrongPlayer.statusCode).toBe(409);

    const illegal = await app.inject({
      method: 'POST',
      url: `/training/items/${fork.id}/attempts`,
      payload: { playerId: fixtureState.playerId, moveUci: 'a1a8' },
    });
    expect(illegal.statusCode).toBe(422);

    const v1Before = await app.inject({
      method: 'GET',
      url: `/skill-graph/runs/${fixtureState.skillGraphRunId}`,
    });
    const wrong = await app.inject({
      method: 'POST',
      url: `/training/items/${fork.id}/attempts`,
      payload: { playerId: fixtureState.playerId, moveUci: 'c5b4' },
    });
    expect(wrong.statusCode).toBe(201);
    expect(wrong.json()).toMatchObject({
      attempt: { result: 'INCORRECT', attemptNumber: 1 },
      trainingEvidence: {
        conceptStableId: 'tactics.fork',
        evidenceTypeStableId: 'training.attempt',
        resolvedEvidenceRole: 'DIRECT',
        polarity: 'NEGATIVE',
      },
    });
    expect(wrong.json().item).toMatchObject({
      acceptedMoveUcis: ['b6c4'],
      source: { occurrencePly: 3 },
    });

    const correctRetry = await app.inject({
      method: 'POST',
      url: `/training/items/${fork.id}/attempts`,
      payload: { playerId: fixtureState.playerId, moveUci: 'b6c4' },
    });
    expect(correctRetry.statusCode).toBe(201);
    expect(correctRetry.json()).toMatchObject({
      attempt: { result: 'CORRECT', attemptNumber: 2 },
      trainingEvidence: { polarity: 'POSITIVE' },
    });
    expect(correctRetry.json().item.attempts).toHaveLength(2);

    const pinAttempt = await app.inject({
      method: 'POST',
      url: `/training/items/${pin.id}/attempts`,
      payload: { playerId: fixtureState.playerId, moveUci: 'c5b4' },
    });
    expect(pinAttempt.statusCode, pinAttempt.body).toBe(201);
    expect(pinAttempt.json()).toMatchObject({
      attempt: { result: 'CORRECT' },
      trainingEvidence: { conceptStableId: 'tactics.pin', polarity: 'POSITIVE' },
      item: { targetConcept: { stableId: 'tactics.pin' } },
    });

    const v1After = await app.inject({
      method: 'GET',
      url: `/skill-graph/runs/${fixtureState.skillGraphRunId}`,
    });
    expect(v1After.body).toBe(v1Before.body);

    const v2 = await app.inject({
      method: 'POST',
      url: '/intelligence/player-skill-graph',
      payload: {
        playerId: fixtureState.playerId,
        ontologyVersion: '1.0.0',
        asOfDate: new Date().toISOString().slice(0, 10),
        skillGraphPolicyVersion: 'SKILL_GRAPH_POLICY_V2',
        scope: { gameContexts: ['OTB'], timeCategories: ['CLASSICAL'] },
      },
    });
    expect(v2.statusCode).toBe(201);
    const graph = v2.json<{
      run: {
        id: string;
        skillGraphPolicyVersion: string;
        evidenceSnapshotSha256: string;
        selectedTrainingEvidenceCount: number;
      };
      concepts: Array<{
        conceptStableId: string;
        trainingNegativeMass: number;
        trainingItemCount: number;
        independentEvidenceUnitCount: number;
      }>;
    }>();
    expect(graph.run).toMatchObject({
      skillGraphPolicyVersion: 'SKILL_GRAPH_POLICY_V2',
      evidenceSnapshotSha256: expect.stringMatching(/^[a-f0-9]{64}$/u),
      selectedTrainingEvidenceCount: 2,
    });
    expect(
      graph.concepts.find((concept) => concept.conceptStableId === 'tactics.fork'),
    ).toMatchObject({
      trainingNegativeMass: 0.5,
      trainingItemCount: 1,
      independentEvidenceUnitCount: 2,
    });
    const lineage = await app.inject({
      method: 'GET',
      url: `/skill-graph/runs/${graph.run.id}/concepts/tactics.fork`,
    });
    expect(lineage.statusCode).toBe(200);
    expect(lineage.json().trainingContributions).toEqual([
      expect.objectContaining({
        polarity: 'NEGATIVE',
        attempt: expect.objectContaining({ number: 1, result: 'INCORRECT' }),
        item: expect.objectContaining({
          sourceEvidenceInstanceId: expect.any(String),
          sourceGameId: expect.any(String),
          sourceOccurrencePly: 3,
        }),
      }),
    ]);
  }, 120_000);
});
