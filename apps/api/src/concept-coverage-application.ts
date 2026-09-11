import type { OntologyRepository } from '@chess-intelligent/db';
import { buildConceptCoverageReport, type ConceptCoverageReport } from '@chess-intelligent/domain';

export class ConceptCoverageApplicationError extends Error {
  readonly code = 'ONTOLOGY_NOT_FOUND';

  constructor(version: string) {
    super(`Published ontology ${version} does not exist.`);
    this.name = 'ConceptCoverageApplicationError';
  }
}

export class ConceptCoverageApplicationService {
  constructor(private readonly ontologies: OntologyRepository) {}

  async getReport(ontologyVersion: string): Promise<ConceptCoverageReport> {
    const snapshot = await this.ontologies.getPublishedVersion(ontologyVersion);
    if (!snapshot) throw new ConceptCoverageApplicationError(ontologyVersion);
    return buildConceptCoverageReport({
      ontology: snapshot.source,
      ontologyContentSha256: snapshot.contentSha256,
    });
  }
}
