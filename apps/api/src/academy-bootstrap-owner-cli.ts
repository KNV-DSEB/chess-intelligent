import { loadRootEnvironment, requireDatabaseUrl } from '@chess-intelligent/config';
import { AuthRepository, PgDatabase, runMigrations } from '@chess-intelligent/db';
import { normalizeEmail, validatePassword } from '@chess-intelligent/domain';

import { Argon2idPasswordHasher } from './password-hasher';

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

loadRootEnvironment();
const email = argument('email');
const displayName = argument('display-name');
const academyId = argument('academy-id');
const academyName = argument('academy-name');
const password = process.env.ACADEMY_BOOTSTRAP_PASSWORD;

if (!email || !displayName || (!academyId && !academyName) || !password) {
  throw new Error(
    'Usage: ACADEMY_BOOTSTRAP_PASSWORD=<secret> pnpm academy:bootstrap-owner --email <email> --display-name <name> (--academy-id <uuid> | --academy-name <name>)',
  );
}
if (!validatePassword(password).valid) {
  throw new Error('ACADEMY_BOOTSTRAP_PASSWORD does not satisfy PASSWORD_POLICY_V1.');
}

const database = new PgDatabase(requireDatabaseUrl());
try {
  await runMigrations(database);
  const result = await new AuthRepository(database).bootstrapOwner({
    academyId,
    academyName,
    email: email.trim(),
    normalizedEmail: normalizeEmail(email),
    displayName: displayName.trim(),
    passwordHash: await new Argon2idPasswordHasher().hashPassword(password),
    now: new Date(),
  });
  process.stdout.write(
    `${JSON.stringify({ ...result, email: normalizeEmail(email), role: 'OWNER' })}\n`,
  );
} finally {
  await database.close();
}
