import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

import type { Database } from './database';

export const RESTORE_MANIFEST_TABLES = [
  'players',
  'games',
  'analysis_runs',
  'concept_evidence_instances',
  'player_skill_graph_runs',
  'training_plan_runs',
  'training_attempts',
  'training_evidence_instances',
  'academies',
  'academy_memberships',
  'student_profiles',
  'training_assignments',
  'users',
  'auth_sessions',
  'academy_invitations',
  'password_reset_tokens',
  'student_access_consent_records',
  'security_audit_events',
] as const;

export interface RestoreManifest {
  generatedAt: string;
  postgresVersion: string;
  schemaMigrations: string[];
  tables: Record<string, { rowCount: number; stableIdHash: string }>;
}

export interface PostgresProcessTarget {
  databaseName: string;
  environment: NodeJS.ProcessEnv;
}

export function postgresProcessTarget(connectionString: string): PostgresProcessTarget {
  const url = new URL(connectionString);
  if (url.protocol !== 'postgresql:' && url.protocol !== 'postgres:') {
    throw new Error('The database target must use a PostgreSQL connection URL.');
  }
  const databaseName = decodeURIComponent(url.pathname.replace(/^\//u, ''));
  if (!databaseName) throw new Error('The PostgreSQL URL must include a database name.');
  const sslMode = url.searchParams.get('sslmode');
  return {
    databaseName,
    environment: {
      ...process.env,
      PGHOST: url.hostname,
      PGPORT: url.port || '5432',
      PGUSER: decodeURIComponent(url.username),
      PGPASSWORD: decodeURIComponent(url.password),
      PGDATABASE: databaseName,
      ...(sslMode ? { PGSSLMODE: sslMode } : {}),
    },
  };
}

export function requireExplicitFilePath(value: string | undefined, extension: string): string {
  if (!value) throw new Error('An explicit operator file path is required.');
  const target = resolve(value);
  if (!target.toLowerCase().endsWith(extension.toLowerCase())) {
    throw new Error(`The operator file path must end with ${extension}.`);
  }
  return target;
}

export async function runPostgresTool(input: {
  executable: 'pg_dump' | 'pg_restore';
  arguments: string[];
  target: PostgresProcessTarget;
}): Promise<void> {
  await new Promise<void>((resolvePromise, reject) => {
    const child = spawn(input.executable, input.arguments, {
      env: input.target.environment,
      stdio: ['ignore', 'inherit', 'inherit'],
      windowsHide: true,
    });
    child.once('error', () => reject(new Error(`${input.executable} could not be started.`)));
    child.once('exit', (code) => {
      if (code === 0) resolvePromise();
      else reject(new Error(`${input.executable} exited with code ${code ?? 'unknown'}.`));
    });
  });
}

export async function createRestoreManifest(database: Database): Promise<RestoreManifest> {
  const version = await database.query<{ server_version: string }>('SHOW server_version');
  const migrations = await database.query<{ name: string }>(
    'SELECT name FROM schema_migrations ORDER BY name',
  );
  const tables: RestoreManifest['tables'] = {};
  for (const table of RESTORE_MANIFEST_TABLES) {
    const result = await database.query<{ row_count: number; stable_id_hash: string }>(
      `SELECT count(*)::int AS row_count,
              md5(COALESCE(string_agg(id::text, ',' ORDER BY id), '')) AS stable_id_hash
       FROM ${table}`,
    );
    tables[table] = {
      rowCount: result.rows[0]?.row_count ?? 0,
      stableIdHash: result.rows[0]?.stable_id_hash ?? '',
    };
  }
  return {
    generatedAt: new Date().toISOString(),
    postgresVersion: version.rows[0]?.server_version ?? 'UNKNOWN',
    schemaMigrations: migrations.rows.map((row) => row.name),
    tables,
  };
}

export function compareRestoreManifests(before: RestoreManifest, after: RestoreManifest): string[] {
  const differences: string[] = [];
  if (JSON.stringify(before.schemaMigrations) !== JSON.stringify(after.schemaMigrations)) {
    differences.push('schema_migrations');
  }
  for (const table of RESTORE_MANIFEST_TABLES) {
    if (JSON.stringify(before.tables[table]) !== JSON.stringify(after.tables[table])) {
      differences.push(table);
    }
  }
  return differences;
}
