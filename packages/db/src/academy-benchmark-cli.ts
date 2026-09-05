import { createHash } from 'node:crypto';

import { PgDatabase } from './database';
import { runMigrations } from './migrations';

const BENCHMARK_ACADEMY_ID = '01200000-0000-4000-8000-000000000001';

if (process.env.ACADEMY_BENCHMARK_CONFIRM !== 'YES') {
  throw new Error(
    'Set ACADEMY_BENCHMARK_CONFIRM=YES to run this opt-in real-PostgreSQL benchmark.',
  );
}

const benchmarkConnectionString = process.env.ACADEMY_BENCHMARK_DATABASE_URL;
if (!benchmarkConnectionString) {
  throw new Error('ACADEMY_BENCHMARK_DATABASE_URL must name an explicit disposable target.');
}
const benchmarkDatabaseName = new URL(benchmarkConnectionString).pathname.replace(/^\//u, '');
if (!/(benchmark|task013)/iu.test(benchmarkDatabaseName)) {
  throw new Error('The benchmark database name must contain benchmark or task013.');
}
const database = new PgDatabase(benchmarkConnectionString, {
  maxConnections: 5,
  connectionTimeoutMillis: 5_000,
  statementTimeoutMillis: 120_000,
  applicationName: 'task013-academy-benchmark',
});

async function seed(): Promise<void> {
  await database.transaction(async (client) => {
    await client.query(
      `INSERT INTO academies (id, name) VALUES ($1, 'Task 012 deterministic benchmark')
       ON CONFLICT (id) DO NOTHING`,
      [BENCHMARK_ACADEMY_ID],
    );
    await client.query(
      `WITH source AS (SELECT generate_series(1, 1050) AS n), ids AS (
         SELECT n,
           (substr(md5('task012-user-' || n),1,8) || '-' || substr(md5('task012-user-' || n),9,4) || '-4' || substr(md5('task012-user-' || n),14,3) || '-8' || substr(md5('task012-user-' || n),18,3) || '-' || substr(md5('task012-user-' || n),21,12))::uuid AS id
         FROM source
       )
       INSERT INTO users (id, email, normalized_email, display_name)
       SELECT id, 'benchmark-' || n || '@task012.invalid',
              'benchmark-' || n || '@task012.invalid', 'Benchmark User ' || n
       FROM ids ON CONFLICT (id) DO NOTHING`,
    );
    await client.query(
      `WITH source AS (SELECT generate_series(1, 1000) AS n), ids AS (
         SELECT n,
           (substr(md5('task012-player-' || n),1,8) || '-' || substr(md5('task012-player-' || n),9,4) || '-4' || substr(md5('task012-player-' || n),14,3) || '-8' || substr(md5('task012-player-' || n),18,3) || '-' || substr(md5('task012-player-' || n),21,12))::uuid AS id
         FROM source
       )
       INSERT INTO players (id, display_name, normalized_name)
       SELECT id, 'Benchmark Player ' || n, 'benchmark player ' || n
       FROM ids ON CONFLICT (id) DO NOTHING`,
    );
    await client.query(
      `WITH source AS (SELECT generate_series(1, 1050) AS n), ids AS (
         SELECT n,
           (substr(md5('task012-member-' || n),1,8) || '-' || substr(md5('task012-member-' || n),9,4) || '-4' || substr(md5('task012-member-' || n),14,3) || '-8' || substr(md5('task012-member-' || n),18,3) || '-' || substr(md5('task012-member-' || n),21,12))::uuid AS membership_id,
           (substr(md5('task012-user-' || n),1,8) || '-' || substr(md5('task012-user-' || n),9,4) || '-4' || substr(md5('task012-user-' || n),14,3) || '-8' || substr(md5('task012-user-' || n),18,3) || '-' || substr(md5('task012-user-' || n),21,12))::uuid AS user_id
         FROM source
       )
       INSERT INTO academy_memberships (id, academy_id, user_id, role, display_name)
       SELECT membership_id, $1, user_id,
              CASE WHEN n = 1 THEN 'OWNER' WHEN n <= 50 THEN 'COACH' ELSE 'STUDENT' END,
              'Benchmark Member ' || n
       FROM ids ON CONFLICT (id) DO NOTHING`,
      [BENCHMARK_ACADEMY_ID],
    );
    await client.query(
      `WITH source AS (SELECT generate_series(51, 1050) AS n), ids AS (
         SELECT n,
           (substr(md5('task012-student-' || n),1,8) || '-' || substr(md5('task012-student-' || n),9,4) || '-4' || substr(md5('task012-student-' || n),14,3) || '-8' || substr(md5('task012-student-' || n),18,3) || '-' || substr(md5('task012-student-' || n),21,12))::uuid AS student_id,
           (substr(md5('task012-member-' || n),1,8) || '-' || substr(md5('task012-member-' || n),9,4) || '-4' || substr(md5('task012-member-' || n),14,3) || '-8' || substr(md5('task012-member-' || n),18,3) || '-' || substr(md5('task012-member-' || n),21,12))::uuid AS membership_id,
           (substr(md5('task012-player-' || (n - 50)),1,8) || '-' || substr(md5('task012-player-' || (n - 50)),9,4) || '-4' || substr(md5('task012-player-' || (n - 50)),14,3) || '-8' || substr(md5('task012-player-' || (n - 50)),18,3) || '-' || substr(md5('task012-player-' || (n - 50)),21,12))::uuid AS player_id
         FROM source
       )
       INSERT INTO student_profiles (
         id, academy_id, academy_membership_id, membership_role, player_id,
         requires_guardian_consent
       )
       SELECT student_id, $1, membership_id, 'STUDENT', player_id, n % 10 = 0
       FROM ids ON CONFLICT (id) DO NOTHING`,
      [BENCHMARK_ACADEMY_ID],
    );
    await client.query(
      `WITH source AS (SELECT generate_series(1, 1050) AS n), ids AS (
         SELECT n,
           (substr(md5('task012-session-' || n),1,8) || '-' || substr(md5('task012-session-' || n),9,4) || '-4' || substr(md5('task012-session-' || n),14,3) || '-8' || substr(md5('task012-session-' || n),18,3) || '-' || substr(md5('task012-session-' || n),21,12))::uuid AS session_id,
           (substr(md5('task012-user-' || n),1,8) || '-' || substr(md5('task012-user-' || n),9,4) || '-4' || substr(md5('task012-user-' || n),14,3) || '-8' || substr(md5('task012-user-' || n),18,3) || '-' || substr(md5('task012-user-' || n),21,12))::uuid AS user_id
         FROM source
       )
       INSERT INTO auth_sessions (id, user_id, token_hash, expires_at)
       SELECT session_id, user_id, md5('task012-token-' || n) || md5('task012-token-b-' || n),
              now() + interval '7 days'
       FROM ids ON CONFLICT (id) DO NOTHING`,
    );
    await client.query(
      `WITH source AS (SELECT generate_series(1, 2000) AS n), owner AS (
         SELECT
           (substr(md5('task012-member-1'),1,8) || '-' || substr(md5('task012-member-1'),9,4) || '-4' || substr(md5('task012-member-1'),14,3) || '-8' || substr(md5('task012-member-1'),18,3) || '-' || substr(md5('task012-member-1'),21,12))::uuid AS membership_id
       )
       INSERT INTO academy_invitations (
         id, academy_id, normalized_email, role, created_by_membership_id,
         token_hash, expires_at
       )
       SELECT
         (substr(md5('task012-invite-' || n),1,8) || '-' || substr(md5('task012-invite-' || n),9,4) || '-4' || substr(md5('task012-invite-' || n),14,3) || '-8' || substr(md5('task012-invite-' || n),18,3) || '-' || substr(md5('task012-invite-' || n),21,12))::uuid,
         $1, 'pending-' || n || '@task012.invalid', 'COACH', owner.membership_id,
         md5('task012-invite-token-' || n) || md5('task012-invite-token-b-' || n),
         now() + interval '7 days'
       FROM source CROSS JOIN owner ON CONFLICT (id) DO NOTHING`,
      [BENCHMARK_ACADEMY_ID],
    );
    await client.query(
      `WITH source AS (SELECT generate_series(1, 2000) AS n), users_source AS (
         SELECT n,
           (substr(md5('task012-user-' || n),1,8) || '-' || substr(md5('task012-user-' || n),9,4) || '-4' || substr(md5('task012-user-' || n),14,3) || '-8' || substr(md5('task012-user-' || n),18,3) || '-' || substr(md5('task012-user-' || n),21,12))::uuid AS user_id
         FROM source
       )
       INSERT INTO password_reset_requests (
         id, identifier_sha256, user_id, requested_at, delivery_status,
         delivery_attempted_at, delivered_at
       )
       SELECT
         (substr(md5('task013-reset-' || n),1,8) || '-' || substr(md5('task013-reset-' || n),9,4) || '-4' || substr(md5('task013-reset-' || n),14,3) || '-8' || substr(md5('task013-reset-' || n),18,3) || '-' || substr(md5('task013-reset-' || n),21,12))::uuid,
         md5('task013-reset-identifier-' || n) || md5('task013-reset-identifier-b-' || n),
         CASE WHEN n <= 1050 THEN user_id ELSE NULL END,
         now() - (n || ' seconds')::interval,
         CASE WHEN n <= 1050 THEN 'DELIVERED' ELSE 'NOT_APPLICABLE' END,
         CASE WHEN n <= 1050 THEN now() - (n || ' seconds')::interval ELSE NULL END,
         CASE WHEN n <= 1050 THEN now() - (n || ' seconds')::interval ELSE NULL END
       FROM users_source ON CONFLICT (id) DO NOTHING`,
    );
    await client.query(
      `WITH source AS (SELECT generate_series(1, 10000) AS n), actor AS (
         SELECT
           (substr(md5('task012-user-1'),1,8) || '-' || substr(md5('task012-user-1'),9,4) || '-4' || substr(md5('task012-user-1'),14,3) || '-8' || substr(md5('task012-user-1'),18,3) || '-' || substr(md5('task012-user-1'),21,12))::uuid AS user_id,
           (substr(md5('task012-member-1'),1,8) || '-' || substr(md5('task012-member-1'),9,4) || '-4' || substr(md5('task012-member-1'),14,3) || '-8' || substr(md5('task012-member-1'),18,3) || '-' || substr(md5('task012-member-1'),21,12))::uuid AS membership_id
       )
       INSERT INTO security_audit_events (
         id, academy_id, actor_user_id, actor_membership_id, action,
         target_type, outcome, metadata
       )
       SELECT
         (substr(md5('task012-audit-' || n),1,8) || '-' || substr(md5('task012-audit-' || n),9,4) || '-4' || substr(md5('task012-audit-' || n),14,3) || '-8' || substr(md5('task012-audit-' || n),18,3) || '-' || substr(md5('task012-audit-' || n),21,12))::uuid,
         $1, actor.user_id, actor.membership_id, 'PERMISSION_DENIED',
         'BENCHMARK_RESOURCE', 'DENIED', jsonb_build_object('ordinal', n)
       FROM source CROSS JOIN actor ON CONFLICT (id) DO NOTHING`,
      [BENCHMARK_ACADEMY_ID],
    );
  });
  await database.execute(
    `ANALYZE users, players, academy_memberships, student_profiles,
             auth_sessions, academy_invitations, password_reset_requests,
             security_audit_events`,
  );
}

async function measureAndExplain(
  name: string,
  sql: string,
  parameters: readonly unknown[],
): Promise<void> {
  const samples: number[] = [];
  for (let iteration = 0; iteration < 20; iteration += 1) {
    const started = performance.now();
    await database.query(sql, parameters);
    samples.push(performance.now() - started);
  }
  samples.sort((left, right) => left - right);
  const result = await database.query<{ 'QUERY PLAN': string }>(
    `EXPLAIN (ANALYZE, BUFFERS) ${sql}`,
    parameters,
  );
  process.stdout.write(
    `${JSON.stringify({ name, sampleCount: samples.length, medianMs: Number(samples[Math.floor(samples.length / 2)]!.toFixed(3)), p95Ms: Number(samples[Math.ceil(samples.length * 0.95) - 1]!.toFixed(3)), plan: result.rows.map((row) => row['QUERY PLAN']) })}\n`,
  );
}

try {
  await runMigrations(database);
  if (process.env.ACADEMY_BENCHMARK_SEED === 'YES') await seed();
  const academyId = process.env.ACADEMY_BENCHMARK_ACADEMY_ID ?? BENCHMARK_ACADEMY_ID;
  await measureAndExplain(
    'session authentication lookup',
    `SELECT session.id FROM auth_sessions session JOIN users account ON account.id = session.user_id
     WHERE session.token_hash = $1 AND session.revoked_at IS NULL AND session.expires_at > now()
       AND account.status = 'ACTIVE'`,
    [md5x2('task012-token-1', 'task012-token-b-1')],
  );
  await measureAndExplain(
    'membership capability lookup',
    `SELECT id, role FROM academy_memberships
     WHERE academy_id = $1 AND user_id = (
       SELECT id FROM users WHERE normalized_email = 'benchmark-1@task012.invalid'
     ) AND status = 'ACTIVE'`,
    [academyId],
  );
  await measureAndExplain(
    'authenticated roster first page',
    `SELECT student.id, membership.display_name, student.player_id
     FROM student_profiles student
     JOIN academy_memberships membership ON membership.id = student.academy_membership_id
     WHERE student.academy_id = $1 ORDER BY student.created_at, student.id LIMIT 50`,
    [academyId],
  );
  await measureAndExplain(
    'authenticated roster later page',
    `SELECT student.id, membership.display_name, student.player_id
     FROM student_profiles student
     JOIN academy_memberships membership ON membership.id = student.academy_membership_id
     WHERE student.academy_id = $1 ORDER BY student.created_at, student.id LIMIT 50 OFFSET 900`,
    [academyId],
  );
  await measureAndExplain(
    'Student self intelligence identity lookup',
    `SELECT student.id, student.player_id, membership.role
     FROM academy_memberships membership
     JOIN student_profiles student ON student.academy_membership_id = membership.id
     WHERE membership.academy_id = $1 AND membership.user_id = (
       SELECT id FROM users WHERE normalized_email = 'benchmark-51@task012.invalid'
     ) AND membership.status = 'ACTIVE' AND membership.role = 'STUDENT'`,
    [academyId],
  );
  await measureAndExplain(
    'active assignments for Student',
    `SELECT assignment.id FROM training_assignments assignment
     WHERE assignment.academy_id = $1 AND assignment.student_profile_id = (
       SELECT id FROM student_profiles WHERE academy_id = $1 ORDER BY id LIMIT 1
     ) AND assignment.cancelled_at IS NULL ORDER BY assignment.assigned_at DESC`,
    [academyId],
  );
  await measureAndExplain(
    'Academy invitation list',
    `SELECT id, role, status, expires_at FROM academy_invitations
     WHERE academy_id = $1 ORDER BY created_at DESC, id DESC LIMIT 50`,
    [academyId],
  );
  await measureAndExplain(
    'audit log page',
    `SELECT id, action, outcome FROM security_audit_events
     WHERE academy_id = $1 ORDER BY occurred_at DESC, id DESC LIMIT 50`,
    [academyId],
  );
  await measureAndExplain(
    'password reset throttle lookup',
    `SELECT requested_at FROM password_reset_requests
     WHERE identifier_sha256 = $1 AND requested_at >= now() - interval '1 hour'
     ORDER BY requested_at`,
    [md5x2('task013-reset-identifier-1', 'task013-reset-identifier-b-1')],
  );
  const dataset = await database.query<{
    students: number;
    staff: number;
    assignments: number;
    attempts: number;
    audits: number;
  }>(
    `SELECT
       (SELECT count(*)::int FROM student_profiles WHERE academy_id = $1) AS students,
       (SELECT count(*)::int FROM academy_memberships WHERE academy_id = $1 AND role <> 'STUDENT') AS staff,
       (SELECT count(*)::int FROM training_assignments WHERE academy_id = $1) AS assignments,
       (SELECT count(*)::int FROM training_attempts) AS attempts,
       (SELECT count(*)::int FROM security_audit_events WHERE academy_id = $1) AS audits`,
    [academyId],
  );
  const sizes = await database.query<{ relation: string; total_bytes: string }>(
    `SELECT relname AS relation, pg_total_relation_size(c.oid)::text AS total_bytes
     FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND relkind IN ('r', 'i')
       AND relname IN (
         'student_profiles', 'academy_memberships', 'auth_sessions',
         'academy_invitations', 'password_reset_requests', 'security_audit_events'
       ) ORDER BY relname`,
  );
  process.stdout.write(
    `${JSON.stringify({ name: 'dataset and storage observation', dataset: dataset.rows[0], sizes: sizes.rows })}\n`,
  );
} finally {
  await database.close();
}

function md5x2(left: string, right: string): string {
  // The deterministic benchmark seed uses PostgreSQL md5 twice to construct a
  // 64-character lookup value. This is test data, never a production token.
  return (
    createHash('md5').update(left).digest('hex') + createHash('md5').update(right).digest('hex')
  );
}
