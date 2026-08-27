import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { parseOntologySource, type ChessConceptOntologySource } from '@chess-intelligent/domain';

export const DEFAULT_ONTOLOGY_SOURCE_PATH = fileURLToPath(
  new URL('../../../ontology/chess/1.0.0.json', import.meta.url),
);

export async function readOntologySourceFile(
  path = DEFAULT_ONTOLOGY_SOURCE_PATH,
): Promise<ChessConceptOntologySource> {
  const raw = JSON.parse(await readFile(path, 'utf8')) as unknown;
  return parseOntologySource(raw);
}
