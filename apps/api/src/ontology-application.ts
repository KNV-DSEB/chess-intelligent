import type { OntologyRepository, OntologyVersionSummary } from '@chess-intelligent/db';
import {
  OntologyRegistry,
  OntologyValidator,
  type ChessConceptOntologySource,
  type OntologyConceptDetail,
  type OntologySnapshot,
  type OntologyValidationIssue,
} from '@chess-intelligent/domain';

export type OntologyApplicationErrorCode =
  'ONTOLOGY_NOT_FOUND' | 'CONCEPT_NOT_FOUND' | 'DOMAIN_NOT_FOUND';

export class OntologyApplicationError extends Error {
  constructor(
    readonly code: OntologyApplicationErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'OntologyApplicationError';
  }
}

export interface OntologyReadView {
  version: string;
  status: 'PUBLISHED';
  contentSha256: string;
  publishedAt: string;
  filter: { domainStableId: string } | null;
  counts: {
    concepts: number;
    domains: number;
    relationships: number;
    prerequisites: number;
    evidenceTypes: number;
    evidencePolicies: number;
  };
  warnings: OntologyValidationIssue[];
  concepts: ChessConceptOntologySource['concepts'];
  relationships: ChessConceptOntologySource['relationships'];
  evidenceTypes: ChessConceptOntologySource['evidenceTypes'];
  evidencePolicies: ChessConceptOntologySource['evidencePolicies'];
}

export interface OntologyConceptReadView {
  version: string;
  contentSha256: string;
  publishedAt: string;
  concept: OntologyConceptDetail;
}

function resolveDomainId(source: ChessConceptOntologySource, value: string): string | null {
  const candidate = value.startsWith('domain.') ? value : `domain.${value}`;
  return source.concepts.some(
    (concept) => concept.stableId === candidate && concept.kind === 'DOMAIN',
  )
    ? candidate
    : null;
}

export class OntologyApplicationService {
  constructor(private readonly repository: OntologyRepository) {}

  listVersions(): Promise<OntologyVersionSummary[]> {
    return this.repository.listVersions();
  }

  async getOntology(
    selector: string | 'latest',
    domain?: string | undefined,
  ): Promise<OntologyReadView> {
    const snapshot = await this.requireSnapshot(selector);
    const registry = new OntologyRegistry(snapshot.source);
    let source = snapshot.source;
    let domainStableId: string | null = null;

    if (domain) {
      domainStableId = resolveDomainId(source, domain);
      if (!domainStableId) {
        throw new OntologyApplicationError(
          'DOMAIN_NOT_FOUND',
          `No top-level domain named ${domain} exists in ontology ${snapshot.version}.`,
        );
      }
      const conceptIds = new Set([
        domainStableId,
        ...registry.graph.getDescendantIds(domainStableId),
      ]);
      const evidencePolicies = source.evidencePolicies.filter((policy) =>
        conceptIds.has(policy.conceptStableId),
      );
      const evidenceTypeIds = new Set(
        evidencePolicies.map((policy) => policy.evidenceTypeStableId),
      );
      source = {
        ...source,
        concepts: source.concepts.filter((concept) => conceptIds.has(concept.stableId)),
        relationships: source.relationships.filter(
          (relationship) =>
            conceptIds.has(relationship.fromConceptId) && conceptIds.has(relationship.toConceptId),
        ),
        evidenceTypes: source.evidenceTypes.filter((evidence) =>
          evidenceTypeIds.has(evidence.stableId),
        ),
        evidencePolicies,
      };
    }

    const report = new OntologyValidator().validate(snapshot.source);
    return this.toReadView(snapshot, source, report.warnings, domainStableId);
  }

  async getConcept(
    selector: string | 'latest',
    stableId: string,
  ): Promise<OntologyConceptReadView> {
    const snapshot = await this.requireSnapshot(selector);
    const concept = new OntologyRegistry(snapshot.source).getConceptDetail(stableId);
    if (!concept) {
      throw new OntologyApplicationError(
        'CONCEPT_NOT_FOUND',
        `Concept ${stableId} does not exist in ontology ${snapshot.version}.`,
      );
    }
    return {
      version: snapshot.version,
      contentSha256: snapshot.contentSha256,
      publishedAt: snapshot.publishedAt,
      concept,
    };
  }

  private async requireSnapshot(selector: string | 'latest'): Promise<OntologySnapshot> {
    const snapshot = await this.repository.getSnapshot(selector);
    if (!snapshot) {
      throw new OntologyApplicationError(
        'ONTOLOGY_NOT_FOUND',
        selector === 'latest'
          ? 'No published ontology exists.'
          : `Ontology version ${selector} does not exist.`,
      );
    }
    return snapshot;
  }

  private toReadView(
    snapshot: OntologySnapshot,
    source: ChessConceptOntologySource,
    warnings: OntologyValidationIssue[],
    domainStableId: string | null,
  ): OntologyReadView {
    return {
      version: snapshot.version,
      status: snapshot.status,
      contentSha256: snapshot.contentSha256,
      publishedAt: snapshot.publishedAt,
      filter: domainStableId ? { domainStableId } : null,
      counts: {
        concepts: source.concepts.length,
        domains: source.concepts.filter((concept) => concept.kind === 'DOMAIN').length,
        relationships: source.relationships.length,
        prerequisites: source.relationships.filter(
          (relationship) => relationship.type === 'PREREQUISITE_OF',
        ).length,
        evidenceTypes: source.evidenceTypes.length,
        evidencePolicies: source.evidencePolicies.length,
      },
      warnings,
      concepts: source.concepts,
      relationships: source.relationships,
      evidenceTypes: source.evidenceTypes,
      evidencePolicies: source.evidencePolicies,
    };
  }
}
