import { loadRootEnvironment, requireDatabaseUrl } from '@chess-intelligent/config';

import { PgDatabase } from './database';
import { runMigrations } from './migrations';
import { OntologyRepository } from './ontology-repository';
import { readOntologySourceFile } from './ontology-source';

loadRootEnvironment();
const database = new PgDatabase(requireDatabaseUrl());

try {
  await runMigrations(database);
  const source = await readOntologySourceFile(process.argv[2]);
  const result = await new OntologyRepository(database).sync(source);
  process.stdout.write(
    result.status === 'published'
      ? `Published ontology ${result.version} (${result.contentSha256}).\n`
      : `Ontology ${result.version} already published with matching hash (${result.contentSha256}).\n`,
  );
} finally {
  await database.close();
}
