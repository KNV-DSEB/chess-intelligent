import { ontologyContentSha256, OntologyValidator } from '@chess-intelligent/domain';

import { readOntologySourceFile } from './ontology-source';

const source = await readOntologySourceFile(process.argv[2]);
const report = new OntologyValidator().assertValid(source);

process.stdout.write(`Ontology ${report.version} valid\n`);
process.stdout.write(`Concepts: ${report.conceptCount}\n`);
process.stdout.write(`Domains: ${report.domainCount}\n`);
process.stdout.write(`Relationships: ${report.relationshipCount}\n`);
process.stdout.write(`Prerequisites: ${report.prerequisiteCount}\n`);
process.stdout.write(`Evidence types: ${report.evidenceTypeCount}\n`);
process.stdout.write(`Evidence policies: ${report.evidencePolicyCount}\n`);
process.stdout.write(`Canonical SHA-256: ${ontologyContentSha256(source)}\n`);
process.stdout.write(`Warnings: ${report.warnings.length}\n`);
for (const warning of report.warnings) {
  process.stdout.write(`- ${warning.code} at ${warning.path}: ${warning.message}\n`);
}
