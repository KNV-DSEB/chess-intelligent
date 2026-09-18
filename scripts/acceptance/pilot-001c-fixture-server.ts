import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import {
  AnalysisRepository,
  AuthRepository,
  OntologyRepository,
  readOntologySourceFile,
  runMigrations,
} from '../../packages/db/src/index';
import { PGliteDatabase } from '../../packages/db/src/testing';
import type {
  ChessEngine,
  EngineAnalysisRequest,
  EngineAnalysisResult,
  EnginePrincipalVariation,
} from '../../packages/domain/src/index';

import { buildApp } from '../../apps/api/src/app';
import { Argon2idPasswordHasher } from '../../apps/api/src/password-hasher';
import { AnalysisWorker } from '../../apps/worker/src/analysis-worker';

const webOrigin = process.env.PILOT001C_WEB_ORIGIN ?? 'http://127.0.0.1:3000';
const host = process.env.PILOT001C_API_HOST ?? '127.0.0.1';
const port = Number(process.env.PILOT001C_API_PORT ?? 4010);
const outputPath = process.env.PILOT001C_FIXTURE_OUTPUT ?? '.tmp-task-pilot001c/fixture.json';
const fixtureUrl = new URL('../../apps/api/test/fixtures/concept-evidence.pgn', import.meta.url);
const now = new Date('2026-09-18T08:00:00.000Z');

const identities = {
  owner: {
    email: 'owner.pilot001c@example.test',
    password: 'Owner pilot fixture passphrase 001C!',
    displayName: 'Linh Nguyen',
  },
  coach: {
    email: 'coach.pilot001c@example.test',
    password: 'Coach pilot fixture passphrase 001C!',
    displayName: 'Coach Minh',
  },
  student: {
    email: 'student.pilot001c@example.test',
    password: 'Student pilot fixture passphrase 001C!',
    displayName: 'Maya Tran',
  },
} as const;

function engineLine(rootMoveUci: string, centipawns: number): EnginePrincipalVariation {
  return {
    pvRank: 1,
    rootMoveUci,
    moves: [rootMoveUci],
    score: { kind: 'CENTIPAWN', centipawns },
    depth: 12,
    seldepth: 15,
    nodes: 1_600,
    nps: 80_000,
    timeMs: 24,
    hashfull: 3,
  };
}

class PilotUxFixtureEngine implements ChessEngine {
  constructor(private readonly finalMode: 'FORK_MISS' | 'PIN_SOUND') {}

  async identify() {
    return {
      family: 'FAKE' as const,
      reportedName: 'Pilot 001C deterministic fixture engine',
      reportedVersion: '1',
      binarySha256: (this.finalMode === 'FORK_MISS' ? 'c' : 'd').repeat(64),
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

interface PrivateTrainingItem {
  id: string;
  acceptedMoveUcis?: string[];
  targetConcept: { stableId: string; displayName: string } | null;
}

interface TrainingPlanResponse {
  run: { id: string; skillGraphRunId: string };
  trainingItems: PrivateTrainingItem[];
}

function cookie(response: { headers: Record<string, string | string[] | number | undefined> }) {
  const raw = response.headers['set-cookie'];
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value || typeof value !== 'string') throw new Error('Fixture login did not set a cookie.');
  return value.split(';', 1)[0]!;
}

const database = await PGliteDatabase.create();
await runMigrations(database);
await new OntologyRepository(database).sync(await readOntologySourceFile());

let app = await buildApp({
  database,
  logger: false,
  manageDatabaseLifecycle: false,
  webOrigins: [webOrigin],
  webOrigin,
  secureCookies: false,
  internalDevRoutes: true,
  now: () => now,
});

async function expectStatus(
  response: { statusCode: number; body: string },
  expected: number,
  step: string,
) {
  if (response.statusCode !== expected) {
    throw new Error(`${step} failed (${response.statusCode}): ${response.body}`);
  }
}

async function importGame(date: string): Promise<string> {
  const source = await readFile(fixtureUrl, 'utf8');
  const pgn = source.replace('[Date "2026.08.22"]', `[Date "${date.replaceAll('-', '.')}"]`);
  const imported = await app.inject({
    method: 'POST',
    url: '/games/import-pgn',
    payload: { pgn, sourceType: 'USER_UPLOAD' },
  });
  await expectStatus(imported, 201, 'PGN import');
  const gameId = imported.json<{ gameId: string }>().gameId;
  await database.query(
    `UPDATE games SET game_context = 'OTB', time_category = 'CLASSICAL', played_at = $2::date,
       event = 'Pilot 001C Academy Match' WHERE id = $1`,
    [gameId, date],
  );
  return gameId;
}

async function analyzeAndClassify(gameId: string, mode: 'FORK_MISS' | 'PIN_SOUND'): Promise<void> {
  const requested = await app.inject({
    method: 'POST',
    url: '/analysis/jobs',
    payload: { gameId, profile: 'QUICK_V1' },
  });
  await expectStatus(requested, 202, 'analysis job enqueue');
  const jobId = requested.json<{ id: string }>().id;
  const claimed = await new AnalysisWorker(
    new AnalysisRepository(database),
    () => new PilotUxFixtureEngine(mode),
    `pilot-001c-${mode.toLowerCase()}`,
  ).runNext();
  if (!claimed) throw new Error('Fixture Worker did not claim the AnalysisJob.');
  const job = await app.inject({ method: 'GET', url: `/analysis/jobs/${jobId}` });
  await expectStatus(job, 200, 'analysis job read');
  const runId = job.json<{ status: string; runId: string | null }>().runId;
  if (!runId) throw new Error('Fixture AnalysisJob completed without an AnalysisRun.');
  const classified = await app.inject({
    method: 'POST',
    url: `/classification/games/${gameId}`,
    payload: {
      ontologyVersion: '1.0.0',
      analysisRunId: runId,
      classifierBundleVersion: 'CONCEPT_CLASSIFIER_BUNDLE_V2',
    },
  });
  await expectStatus(classified, 201, 'concept classification');
}

const gameSpecs = [
  ['2026-08-18', 'FORK_MISS'],
  ['2026-08-22', 'FORK_MISS'],
  ['2026-08-26', 'FORK_MISS'],
  ['2026-08-30', 'FORK_MISS'],
  ['2026-09-03', 'PIN_SOUND'],
] as const;
const gameIds: string[] = [];
let focalPlayerId = '';
for (const [index, [date, mode]] of gameSpecs.entries()) {
  const gameId = await importGame(date);
  gameIds.push(gameId);
  const player = await database.query<{ player_id: string }>(
    `SELECT player_id FROM game_players WHERE game_id = $1 AND color = 'BLACK'`,
    [gameId],
  );
  if (index === 0) {
    focalPlayerId = player.rows[0]!.player_id;
    await database.query(
      `UPDATE players SET display_name = 'Maya Tran', normalized_name = 'maya tran',
         identity_resolution_status = 'RESOLVED' WHERE id = $1`,
      [focalPlayerId],
    );
    await database.query(
      `UPDATE game_players SET display_name = 'Maya Tran' WHERE game_id = $1 AND color = 'BLACK'`,
      [gameId],
    );
  } else {
    await database.query(
      `UPDATE game_players SET player_id = $2, display_name = 'Maya Tran'
       WHERE game_id = $1 AND color = 'BLACK'`,
      [gameId, focalPlayerId],
    );
  }
  await analyzeAndClassify(gameId, mode);
}
await database.query(
  `INSERT INTO external_identities (
     id, player_id, provider, external_id, verification_status, confidence, link_reason
   ) VALUES ($1, $2, 'FIDE', '12456789', 'VERIFIED', 1, 'PILOT_001C_ACCEPTANCE_FIXTURE')`,
  [randomUUID(), focalPlayerId],
);

const graphResponse = await app.inject({
  method: 'POST',
  url: '/intelligence/player-skill-graph',
  payload: {
    playerId: focalPlayerId,
    ontologyVersion: '1.0.0',
    asOfDate: '2026-09-18',
    skillGraphPolicyVersion: 'SKILL_GRAPH_POLICY_V2',
    scope: { gameContexts: ['OTB'], timeCategories: ['CLASSICAL'] },
  },
});
await expectStatus(graphResponse, 201, 'baseline Skill Graph');
const baselineSkillGraphRunId = graphResponse.json<{ run: { id: string } }>().run.id;

const planResponse = await app.inject({
  method: 'POST',
  url: '/training/plans',
  payload: { playerId: focalPlayerId, skillGraphRunId: baselineSkillGraphRunId, maxItems: 10 },
});
await expectStatus(planResponse, 201, 'TrainingPlan generation');
const plan = planResponse.json<TrainingPlanResponse>();
if (plan.trainingItems.length < 2) {
  throw new Error('Pilot 001C fixture requires at least two materialized TrainingItems.');
}

const hasher = new Argon2idPasswordHasher();
const owner = await new AuthRepository(database).bootstrapOwner({
  academyName: 'Riverstone Chess Academy',
  email: identities.owner.email,
  normalizedEmail: identities.owner.email,
  displayName: identities.owner.displayName,
  passwordHash: await hasher.hashPassword(identities.owner.password),
  now,
});

async function createUserMembership(input: {
  email: string;
  password: string;
  displayName: string;
  role: 'COACH' | 'STUDENT';
  playerId?: string;
}) {
  const userId = randomUUID();
  const membershipId = randomUUID();
  await database.query(
    `INSERT INTO users (id, email, normalized_email, display_name, status, created_at, updated_at)
     VALUES ($1, $2, $2, $3, 'ACTIVE', $4, $4)`,
    [userId, input.email, input.displayName, now.toISOString()],
  );
  await database.query(
    `INSERT INTO user_credentials (
       user_id, password_hash, password_algorithm, password_updated_at, created_at
     ) VALUES ($1, $2, 'ARGON2ID_V1', $3, $3)`,
    [userId, await hasher.hashPassword(input.password), now.toISOString()],
  );
  await database.query(
    `INSERT INTO academy_memberships (
       id, academy_id, user_id, role, status, display_name, created_at, updated_at
     ) VALUES ($1, $2, $3, $4, 'ACTIVE', $5, $6, $6)`,
    [membershipId, owner.academyId, userId, input.role, input.displayName, now.toISOString()],
  );
  let studentProfileId: string | null = null;
  if (input.role === 'STUDENT') {
    if (!input.playerId) throw new Error('Student fixture membership requires a Player.');
    studentProfileId = randomUUID();
    await database.query(
      `INSERT INTO student_profiles (
         id, academy_id, academy_membership_id, membership_role, player_id,
         requires_guardian_consent, created_at
       ) VALUES ($1, $2, $3, 'STUDENT', $4, false, $5)`,
      [studentProfileId, owner.academyId, membershipId, input.playerId, now.toISOString()],
    );
  }
  return { userId, membershipId, studentProfileId };
}

await createUserMembership({ ...identities.coach, role: 'COACH' });
const student = await createUserMembership({
  ...identities.student,
  role: 'STUDENT',
  playerId: focalPlayerId,
});

async function createUnclaimedStudent(displayName: string) {
  const playerId = randomUUID();
  const membershipId = randomUUID();
  const studentProfileId = randomUUID();
  await database.query(
    `INSERT INTO players (id, display_name, normalized_name, identity_resolution_status)
     VALUES ($1, $2, $3, 'UNRESOLVED')`,
    [playerId, displayName, displayName.toLowerCase()],
  );
  await database.query(
    `INSERT INTO academy_memberships (
       id, academy_id, role, status, display_name, created_at, updated_at
     ) VALUES ($1, $2, 'STUDENT', 'ACTIVE', $3, $4, $4)`,
    [membershipId, owner.academyId, displayName, now.toISOString()],
  );
  await database.query(
    `INSERT INTO student_profiles (
       id, academy_id, academy_membership_id, membership_role, player_id,
       requires_guardian_consent, created_at
     ) VALUES ($1, $2, $3, 'STUDENT', $4, false, $5)`,
    [studentProfileId, owner.academyId, membershipId, playerId, now.toISOString()],
  );
  return { playerId, studentProfileId };
}

const noGamesStudent = await createUnclaimedStudent('Noah Pham');
const discoveryStudent = await createUnclaimedStudent('Anika Le');

// Seed through the explicit internal-development boundary, then serve the browser fixture through
// the production-like authenticated boundary. The database remains the same in-memory instance.
await app.close();
app = await buildApp({
  database,
  logger: false,
  manageDatabaseLifecycle: false,
  webOrigins: [webOrigin],
  webOrigin,
  secureCookies: false,
  internalDevRoutes: false,
  now: () => now,
});

async function login(email: string, password: string): Promise<string> {
  const response = await app.inject({
    method: 'POST',
    url: '/auth/login',
    headers: { origin: webOrigin },
    payload: { email, password },
  });
  await expectStatus(response, 200, `login ${email}`);
  return cookie(response);
}

const coachCookie = await login(identities.coach.email, identities.coach.password);
const studentCookie = await login(identities.student.email, identities.student.password);
const assignedItems = plan.trainingItems.slice(0, Math.min(3, plan.trainingItems.length));
const assignmentResponse = await app.inject({
  method: 'POST',
  url: `/academies/${owner.academyId}/assignments`,
  headers: { cookie: coachCookie, origin: webOrigin },
  payload: {
    studentProfileId: student.studentProfileId,
    trainingPlanRunId: plan.run.id,
    baselineSkillGraphRunId,
    trainingItemIds: assignedItems.map((item) => item.id),
    dueAt: '2026-09-25',
    note: 'Review the position, name the motif, then calculate one forcing line.',
  },
});
await expectStatus(assignmentResponse, 201, 'TrainingAssignment creation');
const assignmentId = assignmentResponse.json<{ assignment: { id: string } }>().assignment.id;

const completedItem = assignedItems[0]!;
const privateTruth = await database.query<{ accepted_move_ucis: string[] | string }>(
  `SELECT accepted_move_ucis FROM training_items WHERE id = $1`,
  [completedItem.id],
);
const acceptedMoves =
  typeof privateTruth.rows[0]?.accepted_move_ucis === 'string'
    ? (JSON.parse(privateTruth.rows[0].accepted_move_ucis) as string[])
    : (privateTruth.rows[0]?.accepted_move_ucis ?? []);
const acceptedMove = acceptedMoves[0];
if (!acceptedMove) throw new Error('Fixture TrainingItem did not expose acceptance-only truth.');
const attemptResponse = await app.inject({
  method: 'POST',
  url: `/training/items/${completedItem.id}/attempts`,
  headers: { cookie: studentCookie, origin: webOrigin },
  payload: { moveUci: acceptedMove },
});
await expectStatus(attemptResponse, 201, 'first Student training attempt');

const refreshedGraphResponse = await app.inject({
  method: 'POST',
  url: `/academies/${owner.academyId}/students/${student.studentProfileId}/skill-graph`,
  headers: { cookie: coachCookie, origin: webOrigin },
  payload: {
    ontologyVersion: '1.0.0',
    skillGraphPolicyVersion: 'SKILL_GRAPH_POLICY_V2',
    scope: { gameContexts: ['OTB'], timeCategories: ['CLASSICAL'] },
    asOfDate: '2026-09-18',
  },
});
if (![200, 201].includes(refreshedGraphResponse.statusCode)) {
  throw new Error(
    `refreshed Skill Graph failed (${refreshedGraphResponse.statusCode}): ${refreshedGraphResponse.body}`,
  );
}
const refreshedSkillGraphRunId = refreshedGraphResponse.json<{ run: { id: string } }>().run.id;

await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(
  outputPath,
  `${JSON.stringify(
    {
      academyId: owner.academyId,
      studentProfileId: student.studentProfileId,
      noGamesStudentProfileId: noGamesStudent.studentProfileId,
      discoveryStudentProfileId: discoveryStudent.studentProfileId,
      assignmentId,
      trainingPlanRunId: plan.run.id,
      baselineSkillGraphRunId,
      refreshedSkillGraphRunId,
      gameIds,
      trainingItems: assignedItems.map((item) => ({
        id: item.id,
        conceptStableId: item.targetConcept?.stableId ?? null,
        // Acceptance-only private truth; the browser asserts that the pre-attempt API omits it.
        acceptedMoveUci: item.id === completedItem.id ? acceptedMove : null,
      })),
      identities,
      apiUrl: `http://${host}:${port}`,
      webOrigin,
    },
    null,
    2,
  )}\n`,
  'utf8',
);

await app.listen({ host, port });
process.stdout.write(
  `${JSON.stringify({
    status: 'PILOT_001C_FIXTURE_READY',
    apiUrl: `http://${host}:${port}`,
    outputPath,
    academyId: owner.academyId,
    students: 3,
    assignments: 1,
    trainingItems: assignedItems.length,
  })}\n`,
);

async function close(): Promise<void> {
  await app.close();
  await database.close();
  process.exit(0);
}

process.once('SIGINT', () => void close());
process.once('SIGTERM', () => void close());
