import { execFileSync } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import https from 'node:https';

const baseUrl = new URL(process.env.TASK015_BASE_URL ?? 'https://localhost');
const resultPath =
  process.env.TASK015_RUNTIME_RESULT_PATH ?? '.tmp-task015-runtime/runtime-fault-gate.json';
const expected = {
  stockfishRunId: process.env.TASK015_STOCKFISH_RUN_ID,
  skillGraphRunId: process.env.TASK015_V2_GRAPH_ID,
  trainingPlanRunId: process.env.TASK015_V2_PLAN_ID,
  playerId: process.env.TASK015_PLAYER_ID,
};

for (const [name, value] of Object.entries(expected)) {
  if (!value) throw new Error(`${name} is required.`);
}

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
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
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function docker(...arguments_) {
  return execFileSync('docker', arguments_, {
    cwd: process.cwd(),
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function serviceState(service) {
  const id = compose('ps', '-q', service);
  if (!id) return { id: null, status: 'missing', health: null, restartCount: null };
  const inspected = JSON.parse(docker('inspect', id))[0];
  return {
    id,
    status: inspected.State.Status,
    health: inspected.State.Health?.Status ?? null,
    restartCount: inspected.RestartCount,
  };
}

function requestStatus(pathname, options = {}) {
  return new Promise((resolve) => {
    const body = options.body ? JSON.stringify(options.body) : null;
    const request = https.request(
      new URL(pathname, baseUrl),
      {
        method: options.method ?? 'GET',
        rejectUnauthorized: false,
        headers: body
          ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) }
          : undefined,
      },
      (response) => {
        response.resume();
        response.on('end', () => resolve(response.statusCode ?? 0));
      },
    );
    request.on('error', () => resolve(0));
    request.setTimeout(15_000, () => request.destroy());
    if (body) request.write(body);
    request.end();
  });
}

async function waitForStatus(pathname, expectedStatus, attempts = 60) {
  let status = 0;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    status = await requestStatus(pathname);
    if (status === expectedStatus) return status;
    await delay(500);
  }
  return status;
}

async function waitForServiceHealth(service, expectedHealth, attempts = 60) {
  let state = serviceState(service);
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    state = serviceState(service);
    if (state.status === 'running' && state.health === expectedHealth) return state;
    await delay(500);
  }
  return state;
}

function databaseSnapshot() {
  const sql = `SELECT json_build_object(
    'migrations', (SELECT count(*)::int FROM schema_migrations),
    'publishedOntologyVersions', (SELECT count(*)::int FROM ontology_versions WHERE status = 'PUBLISHED'),
    'conceptDefinitions', (SELECT count(*)::int FROM concept_definitions),
    'users', (SELECT count(*)::int FROM users),
    'memberships', (SELECT count(*)::int FROM academy_memberships),
    'studentProfiles', (SELECT count(*)::int FROM student_profiles),
    'games', (SELECT count(*)::int FROM games),
    'analysisRuns', (SELECT count(*)::int FROM analysis_runs),
    'conceptEvidence', (SELECT count(*)::int FROM concept_evidence_instances),
    'skillGraphRuns', (SELECT count(*)::int FROM player_skill_graph_runs),
    'skillGraphLineage', (SELECT count(*)::int FROM skill_graph_evidence_contributions),
    'trainingPlans', (SELECT count(*)::int FROM training_plan_runs),
    'trainingItems', (SELECT count(*)::int FROM training_items),
    'trainingAttempts', (SELECT count(*)::int FROM training_attempts),
    'trainingEvidence', (SELECT count(*)::int FROM training_evidence_instances),
    'assignments', (SELECT count(*)::int FROM training_assignments),
    'stockfishRunPresent', EXISTS(SELECT 1 FROM analysis_runs WHERE id = '${expected.stockfishRunId}'),
    'skillGraphPresent', EXISTS(SELECT 1 FROM player_skill_graph_runs WHERE id = '${expected.skillGraphRunId}'),
    'trainingPlanPresent', EXISTS(SELECT 1 FROM training_plan_runs WHERE id = '${expected.trainingPlanRunId}'),
    'sharedPlayerProfiles', (SELECT count(*)::int FROM student_profiles WHERE player_id = '${expected.playerId}')
  )::text;`;
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

const result = {
  baseline: {},
  databaseOutage: {},
  recovery: {},
  processRestart: {},
  composeRecreation: {},
};

result.baseline.snapshot = databaseSnapshot();
result.baseline.api = serviceState('api');
result.baseline.worker = serviceState('worker');
result.baseline.readiness = await waitForStatus('/api/readyz', 200);

compose('stop', 'postgres');
result.databaseOutage.readiness = await waitForStatus('/api/readyz', 503);
result.databaseOutage.liveness = await waitForStatus('/api/livez', 200);
result.databaseOutage.loginFailsClosed = await requestStatus('/api/auth/login', {
  method: 'POST',
  body: { email: 'database-outage.task015@academy.test', password: 'Invalid-Task015-Password' },
});
result.databaseOutage.api = serviceState('api');
result.databaseOutage.worker = serviceState('worker');

compose('start', 'postgres');
result.recovery.readiness = await waitForStatus('/api/readyz', 200);
result.recovery.worker = await waitForServiceHealth('worker', 'healthy');
result.recovery.snapshot = databaseSnapshot();

compose('restart', 'api', 'worker', 'web', 'proxy');
result.processRestart.readiness = await waitForStatus('/api/readyz', 200);
result.processRestart.api = await waitForServiceHealth('api', 'healthy');
result.processRestart.worker = await waitForServiceHealth('worker', 'healthy');
result.processRestart.snapshot = databaseSnapshot();

compose('down');
result.composeRecreation.boundaryUnavailable = await requestStatus('/api/livez');
compose('up', '-d');
result.composeRecreation.readiness = await waitForStatus('/api/readyz', 200, 120);
result.composeRecreation.api = await waitForServiceHealth('api', 'healthy', 120);
result.composeRecreation.worker = await waitForServiceHealth('worker', 'healthy', 120);
result.composeRecreation.snapshot = databaseSnapshot();

const snapshots = [
  result.recovery.snapshot,
  result.processRestart.snapshot,
  result.composeRecreation.snapshot,
];
const persistenceStable = snapshots.every(
  (snapshot) => JSON.stringify(snapshot) === JSON.stringify(result.baseline.snapshot),
);
const outageProcessesSurvived =
  result.databaseOutage.api.id === result.baseline.api.id &&
  result.databaseOutage.api.status === 'running' &&
  result.databaseOutage.worker.id === result.baseline.worker.id &&
  result.databaseOutage.worker.status === 'running';
const pass =
  result.baseline.readiness === 200 &&
  result.databaseOutage.readiness === 503 &&
  result.databaseOutage.liveness === 200 &&
  result.databaseOutage.loginFailsClosed >= 500 &&
  outageProcessesSurvived &&
  result.recovery.readiness === 200 &&
  result.processRestart.readiness === 200 &&
  result.composeRecreation.boundaryUnavailable === 0 &&
  result.composeRecreation.readiness === 200 &&
  persistenceStable;
result.assertions = { pass, persistenceStable, outageProcessesSurvived };

await writeFile(resultPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
if (!pass) throw new Error(`Runtime fault gate failed; inspect ${resultPath}.`);
process.stdout.write(`${JSON.stringify({ status: 'PASS', resultPath })}\n`);
