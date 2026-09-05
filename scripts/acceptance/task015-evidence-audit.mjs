import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';

const resultPath =
  process.env.TASK015_EVIDENCE_RESULT_PATH ?? '.tmp-task015-runtime/evidence-audit.json';
const secretsPath =
  process.env.TASK015_SECRETS_PATH ?? '.tmp-task015-runtime/acceptance-secrets.json';
const playerId = process.env.TASK015_PLAYER_ID;
if (!playerId) throw new Error('TASK015_PLAYER_ID is required.');

const composeArguments = [
  'compose',
  '--env-file',
  '.tmp-task015-runtime/compose.env',
  '-p',
  'chess-intelligent-task015',
  '-f',
  'docker-compose.production.yml',
];

function compose(...arguments_) {
  return execFileSync('docker', [...composeArguments, ...arguments_], {
    cwd: process.cwd(),
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function databaseJson(sql) {
  return JSON.parse(
    compose(
      'exec',
      '-T',
      'postgres',
      'psql',
      '-X',
      '-A',
      '-t',
      '-U',
      'task015_admin',
      '-d',
      'task015_academy',
      '-c',
      sql,
    ),
  );
}

const audit = databaseJson(`SELECT json_build_object(
  'total', count(*)::int,
  'denied', count(*) FILTER (WHERE outcome = 'DENIED')::int,
  'crossTenantDenied', count(*) FILTER (WHERE action = 'CROSS_TENANT_ACCESS_DENIED' AND outcome = 'DENIED')::int,
  'permissionDenied', count(*) FILTER (WHERE action = 'PERMISSION_DENIED' AND outcome = 'DENIED')::int,
  'assignmentCreated', count(*) FILTER (WHERE action = 'ASSIGNMENT_CREATED' AND outcome = 'SUCCESS')::int,
  'assignmentCancelled', count(*) FILTER (WHERE action = 'ASSIGNMENT_CANCELLED' AND outcome = 'SUCCESS')::int,
  'passwordResetCompleted', count(*) FILTER (WHERE action = 'PASSWORD_RESET_COMPLETED' AND outcome = 'SUCCESS')::int,
  'userDisabled', count(*) FILTER (WHERE action = 'USER_DISABLED' AND outcome = 'SUCCESS')::int,
  'membershipDisabled', count(*) FILTER (WHERE action = 'MEMBERSHIP_DISABLED' AND outcome = 'SUCCESS')::int,
  'membershipEnabled', count(*) FILTER (WHERE action = 'MEMBERSHIP_ENABLED' AND outcome = 'SUCCESS')::int,
  'invitationDeliveryFailed', count(*) FILTER (WHERE action = 'INVITATION_DELIVERY_FAILED' AND outcome = 'FAILURE')::int,
  'suspiciousMetadataKeys', count(*) FILTER (
    WHERE metadata::text ~* '(password|raw.?token|cookie|authorization|session.?token|secret)'
  )::int
)::text FROM security_audit_events;`);

const lineage = databaseJson(`SELECT json_build_object(
  'attemptCount', count(*)::int,
  'evidenceCount', count(evidence.id)::int,
  'valid', COALESCE(bool_and(
    attempt.player_id = item.player_id
    AND evidence.training_attempt_id = attempt.id
    AND evidence.training_item_id = item.id
    AND evidence.player_id = item.player_id
    AND item.source_evidence_instance_id = source.id
    AND item.source_game_id = source.game_id
    AND item.source_occurrence_id = source.position_occurrence_id
    AND item.source_analysis_run_id = source.analysis_run_id
    AND item.exact_history_sha256 = source.exact_history_sha256
    AND occurrence.id = item.source_occurrence_id
    AND occurrence.game_id = item.source_game_id
    AND analysis.id = item.source_analysis_run_id
    AND analysis.game_id = item.source_game_id
  ), false),
  'records', COALESCE(json_agg(json_build_object(
    'attemptId', attempt.id,
    'trainingEvidenceInstanceId', evidence.id,
    'trainingItemId', item.id,
    'sourceConceptEvidenceInstanceId', source.id,
    'classificationRunId', source.classification_run_id,
    'analysisRunId', source.analysis_run_id,
    'gameId', source.game_id,
    'positionOccurrenceId', source.position_occurrence_id,
    'conceptStableId', source.concept_stable_id,
    'ontologyVersionId', source.ontology_version_id,
    'exactHistorySha256', source.exact_history_sha256
  ) ORDER BY attempt.submitted_at, attempt.id) FILTER (WHERE attempt.id IS NOT NULL), '[]'::json)
)::text
FROM training_attempts attempt
JOIN training_items item ON item.id = attempt.training_item_id AND item.player_id = attempt.player_id
LEFT JOIN training_evidence_instances evidence ON evidence.training_attempt_id = attempt.id
LEFT JOIN concept_evidence_instances source ON source.id = item.source_evidence_instance_id
LEFT JOIN position_occurrences occurrence ON occurrence.id = item.source_occurrence_id
LEFT JOIN analysis_runs analysis ON analysis.id = item.source_analysis_run_id
WHERE attempt.player_id = '${playerId}';`);

const tenantAndAttribution = databaseJson(`SELECT json_build_object(
  'studentProfilesForSharedPlayer', (
    SELECT count(*)::int FROM student_profiles WHERE player_id = '${playerId}'
  ),
  'academiesForSharedPlayer', (
    SELECT count(DISTINCT academy_id)::int FROM student_profiles WHERE player_id = '${playerId}'
  ),
  'assignmentActors', (
    SELECT COALESCE(json_agg(json_build_object(
      'assignmentId', assignment.id,
      'actorMembershipId', actor.id,
      'actorRole', actor.role,
      'academyId', assignment.academy_id,
      'studentProfileId', assignment.student_profile_id,
      'cancelled', assignment.cancelled_at IS NOT NULL
    ) ORDER BY assignment.assigned_at), '[]'::json)
    FROM training_assignments assignment
    JOIN academy_memberships actor ON actor.id = assignment.assigned_by_coach_membership_id
  ),
  'coachMembershipActive', EXISTS(
    SELECT 1 FROM academy_memberships WHERE display_name = 'Task 015 Coach' AND role = 'COACH' AND status = 'ACTIVE'
  )
)::text;`);

const persistence = databaseJson(`SELECT json_build_object(
  'nonArgonCredentials', (SELECT count(*)::int FROM user_credentials WHERE password_hash !~ '^\\$argon2id\\$'),
  'invalidSessionDigests', (SELECT count(*)::int FROM auth_sessions WHERE token_hash !~ '^[a-f0-9]{64}$'),
  'invalidInvitationDigests', (SELECT count(*)::int FROM academy_invitations WHERE token_hash !~ '^[a-f0-9]{64}$'),
  'invalidResetDigests', (SELECT count(*)::int FROM password_reset_tokens WHERE token_hash !~ '^[a-f0-9]{64}$'),
  'rawSecretColumns', (
    SELECT count(*)::int FROM information_schema.columns
    WHERE table_schema = 'public'
      AND column_name IN ('password', 'raw_token', 'session_token', 'invitation_token', 'reset_token')
  )
)::text;`);

const secrets = JSON.parse(await readFile(secretsPath, 'utf8'));
const knownSecrets = [
  secrets.owner?.password,
  secrets.admin?.password,
  secrets.coach?.password,
  secrets.student?.password,
  secrets.resetPassword,
  secrets.changedPassword,
].filter((value) => typeof value === 'string' && value.length > 0);
const logs = compose('logs', '--no-color');
const knownSecretMatches = knownSecrets.reduce(
  (count, secret) => count + (logs.includes(secret) ? 1 : 0),
  0,
);
const rawTokenPathMatches = [
  ...logs.matchAll(
    /\/(?:auth\/invitations|password-reset)\/(?!\[REDACTED\])[A-Za-z0-9._~%+-]{32,}/gu,
  ),
].length;
const rawSessionCookieMatches = [...logs.matchAll(/__Host-chess_session=[A-Za-z0-9._~%+-]+/gu)]
  .length;

const logScan = {
  serviceLogCharactersScanned: logs.length,
  knownSecretMatches,
  rawTokenPathMatches,
  rawSessionCookieMatches,
};
const pass =
  audit.denied > 0 &&
  audit.crossTenantDenied > 0 &&
  audit.permissionDenied > 0 &&
  audit.assignmentCreated >= 3 &&
  audit.assignmentCancelled >= 1 &&
  audit.passwordResetCompleted >= 1 &&
  audit.userDisabled >= 1 &&
  audit.membershipDisabled >= 1 &&
  audit.membershipEnabled >= 1 &&
  audit.invitationDeliveryFailed >= 1 &&
  audit.suspiciousMetadataKeys === 0 &&
  lineage.attemptCount === 1 &&
  lineage.evidenceCount === 1 &&
  lineage.valid === true &&
  tenantAndAttribution.studentProfilesForSharedPlayer === 2 &&
  tenantAndAttribution.academiesForSharedPlayer === 2 &&
  tenantAndAttribution.coachMembershipActive === true &&
  persistence.nonArgonCredentials === 0 &&
  persistence.invalidSessionDigests === 0 &&
  persistence.invalidInvitationDigests === 0 &&
  persistence.invalidResetDigests === 0 &&
  persistence.rawSecretColumns === 0 &&
  knownSecretMatches === 0 &&
  rawTokenPathMatches === 0 &&
  rawSessionCookieMatches === 0;

const result = {
  audit,
  lineage,
  tenantAndAttribution,
  persistence,
  logScan,
  assertions: { pass },
};
await writeFile(resultPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
if (!pass) throw new Error(`Evidence audit failed; inspect ${resultPath}.`);
process.stdout.write(`${JSON.stringify({ status: 'PASS', resultPath })}\n`);
