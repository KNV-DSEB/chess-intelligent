import { randomUUID } from 'node:crypto';
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
const fideId = '12456789';

function utcDateAtOffset(days: number, hour = 0): Date {
  const today = new Date();
  return new Date(
    Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() + days, hour),
  );
}

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

class AcademyFixtureEngine implements ChessEngine {
  constructor(private readonly finalMode: 'FORK_MISS' | 'PIN_SOUND') {}

  async identify() {
    return {
      family: 'FAKE' as const,
      reportedName: `Task 011 ${this.finalMode}`,
      reportedVersion: '1',
      binarySha256: (this.finalMode === 'FORK_MISS' ? '6' : '5').repeat(64),
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
  run: { id: string };
  trainingItems: Array<{
    id: string;
    positionFen: string;
    targetConcept: { stableId: string } | null;
    trainingMode: 'REMEDIATION' | 'DIAGNOSTIC';
  }>;
}

interface AcademySetup {
  academyAId: string;
  academyBId: string;
  coachAId: string;
  coachBId: string;
  studentMembershipAId: string;
  studentProfileAId: string;
  studentProfileBId: string;
}

describe('Task 011 Coach / Student Intelligence', () => {
  let database: Database;
  let app: FastifyInstance;
  let fixture: string;
  let activeDueAt: string;
  let overdueDueAt: string;

  beforeEach(async () => {
    activeDueAt = utcDateAtOffset(10).toISOString().slice(0, 10);
    overdueDueAt = utcDateAtOffset(1).toISOString().slice(0, 10);
    const viewNow = utcDateAtOffset(5, 12);
    fixture = await readFile(fixtureUrl, 'utf8');
    database = await PGliteDatabase.create();
    await runMigrations(database);
    await new OntologyRepository(database).sync(await readOntologySourceFile());
    app = await buildApp({
      database,
      internalDevRoutes: true,
      now: () => viewNow,
    });
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
      () => new AcademyFixtureEngine(mode),
      `task-011-${mode}`,
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

  async function prepareLearningArtifacts(): Promise<{
    playerId: string;
    baselineSkillGraphRunId: string;
    incompatibleV1RunId: string;
    plan: PlanResponse;
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
       ) VALUES ($1, $2, 'FIDE', $3, 'VERIFIED', 1, 'TASK_011_ACCEPTANCE_FIXTURE')`,
      [randomUUID(), playerId, fideId],
    );
    await classify(forkGameId, await analyze(forkGameId, 'FORK_MISS'));
    await classify(pinGameId, await analyze(pinGameId, 'PIN_SOUND'));

    const baseline = await app.inject({
      method: 'POST',
      url: '/intelligence/player-skill-graph',
      payload: {
        playerId,
        ontologyVersion: '1.0.0',
        asOfDate: '2026-08-27',
        skillGraphPolicyVersion: 'SKILL_GRAPH_POLICY_V2',
        scope: { gameContexts: ['OTB'], timeCategories: ['CLASSICAL'] },
      },
    });
    expect(baseline.statusCode).toBe(201);
    const baselineSkillGraphRunId = baseline.json<{ run: { id: string } }>().run.id;
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
      [baselineSkillGraphRunId],
    );

    const planResponse = await app.inject({
      method: 'POST',
      url: '/training/plans',
      payload: { playerId, skillGraphRunId: baselineSkillGraphRunId, maxItems: 10 },
    });
    expect(planResponse.statusCode).toBe(201);
    const plan = planResponse.json<PlanResponse>();
    expect(plan.trainingItems.map((item) => item.trainingMode)).toEqual(
      expect.arrayContaining(['REMEDIATION', 'DIAGNOSTIC']),
    );

    const incompatible = await app.inject({
      method: 'POST',
      url: '/intelligence/player-skill-graph',
      payload: {
        playerId,
        ontologyVersion: '1.0.0',
        asOfDate: new Date().toISOString().slice(0, 10),
        skillGraphPolicyVersion: 'SKILL_GRAPH_POLICY_V1',
        scope: { gameContexts: ['OTB'], timeCategories: ['CLASSICAL'] },
      },
    });
    expect(incompatible.statusCode).toBe(201);
    return {
      playerId,
      baselineSkillGraphRunId,
      incompatibleV1RunId: incompatible.json<{ run: { id: string } }>().run.id,
      plan,
    };
  }

  async function createAcademy(name: string): Promise<string> {
    const response = await app.inject({ method: 'POST', url: '/academies', payload: { name } });
    expect(response.statusCode).toBe(201);
    return response.json<{ academy: { id: string } }>().academy.id;
  }

  async function createMembership(
    academyId: string,
    role: 'COACH' | 'STUDENT',
    displayName: string,
  ): Promise<string> {
    const response = await app.inject({
      method: 'POST',
      url: `/academies/${academyId}/memberships`,
      payload: { role, displayName },
    });
    expect(response.statusCode).toBe(201);
    return response.json<{ membership: { id: string } }>().membership.id;
  }

  async function createStudent(
    academyId: string,
    membershipId: string,
    playerId: string,
  ): Promise<string> {
    const response = await app.inject({
      method: 'POST',
      url: `/academies/${academyId}/students`,
      payload: { membershipId, playerId },
    });
    expect(response.statusCode).toBe(201);
    return response.json<{ student: { id: string } }>().student.id;
  }

  async function prepareAcademies(playerId: string): Promise<AcademySetup> {
    const academyAId = await createAcademy('Academy A');
    const academyBId = await createAcademy('Academy B');
    const coachAId = await createMembership(academyAId, 'COACH', 'Coach A');
    const coachBId = await createMembership(academyBId, 'COACH', 'Coach B');
    const studentMembershipAId = await createMembership(academyAId, 'STUDENT', 'Student S');
    const studentMembershipBId = await createMembership(academyBId, 'STUDENT', 'Student S — B');
    return {
      academyAId,
      academyBId,
      coachAId,
      coachBId,
      studentMembershipAId,
      studentProfileAId: await createStudent(academyAId, studentMembershipAId, playerId),
      studentProfileBId: await createStudent(academyBId, studentMembershipBId, playerId),
    };
  }

  function profileQuery(coachMembershipId: string): string {
    return new URLSearchParams({
      coachMembershipId,
      ontologyVersion: '1.0.0',
      skillGraphPolicyVersion: 'SKILL_GRAPH_POLICY_V2',
      gameContexts: 'OTB',
      timeCategories: 'CLASSICAL',
    }).toString();
  }

  it('closes Academy → assignment → Task 010 evidence → comparable progress with isolation', async () => {
    const learning = await prepareLearningArtifacts();
    const academy = await prepareAcademies(learning.playerId);

    const roster = await app.inject({
      method: 'GET',
      url: `/academies/${academy.academyAId}/roster?${profileQuery(academy.coachAId)}`,
    });
    expect(roster.statusCode, roster.body).toBe(200);
    expect(roster.json()).toMatchObject({
      authorizationStatus: 'AUTHENTICATED_ACADEMY_RBAC_V1',
      pagination: { total: 1 },
      students: [
        {
          student: { id: academy.studentProfileAId, playerId: learning.playerId, fideId },
          skillGraph: { id: learning.baselineSkillGraphRunId },
          freshness: { status: 'CURRENT', newTrainingEvidenceCount: 0 },
          activeAssignment: null,
        },
      ],
    });

    const studentBefore = await app.inject({
      method: 'GET',
      url: `/academies/${academy.academyAId}/students/${academy.studentProfileAId}/intelligence?${profileQuery(academy.coachAId)}`,
    });
    expect(studentBefore.statusCode, studentBefore.body).toBe(200);
    expect(studentBefore.json()).toMatchObject({
      skillGraph: { run: { id: learning.baselineSkillGraphRunId } },
      freshness: { status: 'CURRENT' },
      trainingSummary: { attemptCount: 0, distinctScoredItems: 0 },
      assignments: [],
    });

    const evidenceBefore = await database.query<{ count: number }>(
      `SELECT count(*)::int AS count FROM training_evidence_instances`,
    );
    const conceptEvidenceBefore = await database.query<{ count: number }>(
      `SELECT count(*)::int AS count FROM concept_evidence_instances`,
    );
    const fork = learning.plan.trainingItems.find(
      (item) =>
        item.trainingMode === 'REMEDIATION' && item.targetConcept?.stableId === 'tactics.fork',
    )!;
    const pin = learning.plan.trainingItems.find(
      (item) => item.trainingMode === 'DIAGNOSTIC' && item.positionFen === fork.positionFen,
    )!;
    const assignmentResponse = await app.inject({
      method: 'POST',
      url: `/academies/${academy.academyAId}/assignments`,
      payload: {
        studentProfileId: academy.studentProfileAId,
        coachMembershipId: academy.coachAId,
        trainingPlanRunId: learning.plan.run.id,
        baselineSkillGraphRunId: learning.baselineSkillGraphRunId,
        trainingItemIds: [fork.id, pin.id],
        dueAt: activeDueAt,
        note: 'Review before Saturday session.',
      },
    });
    expect(assignmentResponse.statusCode, assignmentResponse.body).toBe(201);
    const assignment = assignmentResponse.json<{
      assignment: { id: string };
      progress: { status: string; completedItemCount: number };
      evidenceCreatedByAssignment: number;
      noteEvidenceCreated: number;
    }>();
    expect(assignment).toMatchObject({
      progress: { status: 'ACTIVE', completedItemCount: 0 },
      evidenceCreatedByAssignment: 0,
      noteEvidenceCreated: 0,
    });
    expect(
      (
        await database.query<{ count: number }>(
          `SELECT count(*)::int AS count FROM training_evidence_instances`,
        )
      ).rows[0]!.count,
    ).toBe(evidenceBefore.rows[0]!.count);
    expect(
      (
        await database.query<{ count: number }>(
          `SELECT count(*)::int AS count FROM concept_evidence_instances`,
        )
      ).rows[0]!.count,
    ).toBe(conceptEvidenceBefore.rows[0]!.count);

    expect(
      await app.inject({
        method: 'POST',
        url: `/training/items/${fork.id}/attempts`,
        payload: { playerId: learning.playerId, moveUci: 'c5b4' },
      }),
    ).toMatchObject({ statusCode: 201 });
    expect(
      await app.inject({
        method: 'POST',
        url: `/training/items/${pin.id}/attempts`,
        payload: { playerId: learning.playerId, moveUci: 'c5b4' },
      }),
    ).toMatchObject({ statusCode: 201 });

    const completed = await app.inject({
      method: 'GET',
      url: `/academies/${academy.academyAId}/assignments/${assignment.assignment.id}?coachMembershipId=${academy.coachAId}`,
    });
    expect(completed.statusCode, completed.body).toBe(200);
    expect(completed.json()).toMatchObject({
      progress: {
        status: 'COMPLETED',
        completedItemCount: 2,
        firstScoredCorrectItems: 1,
        firstScoredIncorrectItems: 1,
      },
    });

    const stale = await app.inject({
      method: 'GET',
      url: `/academies/${academy.academyAId}/students/${academy.studentProfileAId}/intelligence?${profileQuery(academy.coachAId)}`,
    });
    expect(stale.statusCode, stale.body).toBe(200);
    expect(stale.json()).toMatchObject({
      skillGraph: { run: { id: learning.baselineSkillGraphRunId } },
      freshness: { status: 'REFRESH_AVAILABLE', newTrainingEvidenceCount: 2 },
      trainingSummary: {
        attemptCount: 2,
        distinctScoredItems: 2,
        firstAttemptCorrect: 1,
        firstAttemptIncorrect: 1,
      },
      attentionSignals: expect.arrayContaining([
        'SKILL_GRAPH_REFRESH_AVAILABLE',
        'ASSIGNMENT_COMPLETED_REVIEW_AVAILABLE',
      ]),
    });

    const followup = await app.inject({
      method: 'POST',
      url: '/intelligence/player-skill-graph',
      payload: {
        playerId: learning.playerId,
        ontologyVersion: '1.0.0',
        asOfDate: new Date().toISOString().slice(0, 10),
        skillGraphPolicyVersion: 'SKILL_GRAPH_POLICY_V2',
        scope: { gameContexts: ['OTB'], timeCategories: ['CLASSICAL'] },
      },
    });
    expect(followup.statusCode, followup.body).toBe(201);
    const followupRunId = followup.json<{ run: { id: string } }>().run.id;
    const progress = await app.inject({
      method: 'POST',
      url: '/intelligence/student-progress',
      payload: {
        academyId: academy.academyAId,
        studentProfileId: academy.studentProfileAId,
        coachMembershipId: academy.coachAId,
        fromSkillGraphRunId: learning.baselineSkillGraphRunId,
        toSkillGraphRunId: followupRunId,
      },
    });
    expect(progress.statusCode, progress.body).toBe(200);
    expect(progress.json()).toMatchObject({
      comparisonPolicyVersion: 'STUDENT_PROGRESS_COMPARISON_V1',
      comparisonStatus: 'COMPARABLE',
      comparabilityReasons: [],
      coverageDelta: { trainingIndependentUnitDelta: 2 },
    });
    expect(progress.json()).not.toHaveProperty('improved');

    const incompatible = await app.inject({
      method: 'POST',
      url: '/intelligence/student-progress',
      payload: {
        academyId: academy.academyAId,
        studentProfileId: academy.studentProfileAId,
        coachMembershipId: academy.coachAId,
        fromSkillGraphRunId: learning.incompatibleV1RunId,
        toSkillGraphRunId: followupRunId,
      },
    });
    expect(incompatible.json()).toMatchObject({
      comparisonStatus: 'NOT_COMPARABLE',
      comparabilityReasons: expect.arrayContaining(['DIFFERENT_SKILL_GRAPH_POLICY']),
      coverageDelta: null,
      conceptTransitions: [],
    });

    const crossAcademy = await app.inject({
      method: 'GET',
      url: `/academies/${academy.academyAId}/students/${academy.studentProfileAId}/intelligence?${profileQuery(academy.coachBId)}`,
    });
    expect(crossAcademy.statusCode).toBe(403);
    const crossAssignment = await app.inject({
      method: 'POST',
      url: `/academies/${academy.academyAId}/assignments`,
      payload: {
        studentProfileId: academy.studentProfileAId,
        coachMembershipId: academy.coachBId,
        trainingPlanRunId: learning.plan.run.id,
        baselineSkillGraphRunId: learning.baselineSkillGraphRunId,
        trainingItemIds: [fork.id],
      },
    });
    expect(crossAssignment.statusCode).toBe(403);

    const studentCannotAssign = await app.inject({
      method: 'POST',
      url: `/academies/${academy.academyAId}/assignments`,
      payload: {
        studentProfileId: academy.studentProfileAId,
        coachMembershipId: academy.studentMembershipAId,
        trainingPlanRunId: learning.plan.run.id,
        baselineSkillGraphRunId: learning.baselineSkillGraphRunId,
        trainingItemIds: [fork.id],
      },
    });
    expect(studentCannotAssign.statusCode).toBe(403);

    const diagnosticReplay = await app.inject({
      method: 'POST',
      url: `/academies/${academy.academyAId}/assignments`,
      payload: {
        studentProfileId: academy.studentProfileAId,
        coachMembershipId: academy.coachAId,
        trainingPlanRunId: learning.plan.run.id,
        baselineSkillGraphRunId: learning.baselineSkillGraphRunId,
        trainingItemIds: [pin.id],
      },
    });
    expect(diagnosticReplay.statusCode).toBe(409);
    expect(diagnosticReplay.json()).toMatchObject({
      error: { code: 'DIAGNOSTIC_ITEM_ALREADY_MEASURED' },
    });

    const practice = await app.inject({
      method: 'POST',
      url: `/academies/${academy.academyAId}/assignments`,
      payload: {
        studentProfileId: academy.studentProfileAId,
        coachMembershipId: academy.coachAId,
        trainingPlanRunId: learning.plan.run.id,
        baselineSkillGraphRunId: learning.baselineSkillGraphRunId,
        trainingItemIds: [fork.id],
        dueAt: overdueDueAt,
      },
    });
    expect(practice.statusCode, practice.body).toBe(201);
    expect(practice.json()).toMatchObject({
      assignment: {
        items: [{ measurementStatus: 'PRACTICE_ONLY_ALREADY_MEASURED' }],
      },
      progress: { status: 'ACTIVE', completedItemCount: 0, overdue: true },
    });
    const practiceId = practice.json<{ assignment: { id: string } }>().assignment.id;
    const cancelled = await app.inject({
      method: 'POST',
      url: `/academies/${academy.academyAId}/assignments/${practiceId}/cancel`,
      payload: { coachMembershipId: academy.coachAId },
    });
    expect(cancelled.statusCode, cancelled.body).toBe(200);
    expect(cancelled.json()).toMatchObject({
      progress: { status: 'CANCELLED' },
      itemLinks: [],
    });

    const samePlayerProfiles = await database.query<{ player_id: string }>(
      `SELECT player_id FROM student_profiles WHERE id = ANY($1::uuid[]) ORDER BY id`,
      [[academy.studentProfileAId, academy.studentProfileBId]],
    );
    expect(samePlayerProfiles.rows).toHaveLength(2);
    expect(new Set(samePlayerProfiles.rows.map((row) => row.player_id))).toEqual(
      new Set([learning.playerId]),
    );
  }, 120_000);
});
