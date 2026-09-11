import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, extname } from 'node:path';

import { PgDatabase } from './database';
import { PilotRepository } from './pilot-repository';

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function date(name: string): Date {
  const value = new Date(required(name));
  if (Number.isNaN(value.valueOf())) throw new Error(`${name} must be an ISO timestamp.`);
  return value;
}

if (process.env.PILOT_METRICS_EXPORT_CONFIRM !== 'YES') {
  throw new Error(
    'Set PILOT_METRICS_EXPORT_CONFIRM=YES only for the explicitly named Pilot Academy and output.',
  );
}

const academyId = required('PILOT_ACADEMY_ID');
if (!/^[0-9a-f]{8}-[0-9a-f-]{27}$/iu.test(academyId)) {
  throw new Error('PILOT_ACADEMY_ID must be a UUID.');
}
const fromInclusive = date('PILOT_METRICS_FROM');
const toExclusive = date('PILOT_METRICS_TO');
if (fromInclusive >= toExclusive)
  throw new Error('PILOT_METRICS_TO must be after PILOT_METRICS_FROM.');
const outputPath = required('PILOT_METRICS_OUTPUT');
if (extname(outputPath).toLowerCase() !== '.json') {
  throw new Error('PILOT_METRICS_OUTPUT must be an explicit .json path.');
}
const supportIncidentCount = Number(process.env.PILOT_SUPPORT_INCIDENT_COUNT ?? '0');
if (!Number.isInteger(supportIncidentCount) || supportIncidentCount < 0) {
  throw new Error('PILOT_SUPPORT_INCIDENT_COUNT must be a non-negative integer.');
}

const database = new PgDatabase(required('PILOT_DATABASE_URL'), {
  maxConnections: 2,
  connectionTimeoutMillis: 5_000,
  statementTimeoutMillis: 30_000,
  applicationName: 'pilot-001-metrics-export',
});

try {
  const repository = new PilotRepository(database);
  const report = await repository.exportMetrics({ academyId, fromInclusive, toExclusive });
  const supportIncidents = report.metrics.supportIncidents;
  if (!supportIncidents) throw new Error('The support-incidents metric is missing.');
  supportIncidents.numerator = supportIncidentCount;
  const csvPath = outputPath.replace(/\.json$/iu, '.csv');
  const csv = [
    'metric,numerator,denominator,rate,definition',
    ...Object.entries(report.metrics).map(([name, metric]) =>
      [name, metric.numerator, metric.denominator ?? '', metric.rate ?? '', metric.definition]
        .map((value) => `"${String(value).replaceAll('"', '""')}"`)
        .join(','),
    ),
  ].join('\n');
  await mkdir(dirname(outputPath), { recursive: true });
  await Promise.all([
    writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8'),
    writeFile(csvPath, `${csv}\n`, 'utf8'),
  ]);
  process.stdout.write(
    `${JSON.stringify({ status: 'PILOT_METRICS_EXPORTED', academyId, outputPath, csvPath, fromInclusive: report.fromInclusive, toExclusive: report.toExclusive })}\n`,
  );
} finally {
  await database.close();
}
