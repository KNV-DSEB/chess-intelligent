import { randomUUID } from 'node:crypto';

import {
  ontologyContentSha256,
  OntologyValidator,
  OntologyRegistry,
  type ChessConceptOntologySource,
  type ConceptDifficulty,
  type ConceptKind,
  type ConceptStatus,
  type EvidencePolarity,
  type EvidenceRole,
  type EvidenceSourceClass,
  type OntologyRelationshipType,
  type OntologyConceptDetail,
  type OntologyConceptSummary,
  type OntologySnapshot,
  type OntologyVersionRecord,
} from '@chess-intelligent/domain';

import type { Database, QueryClient } from './database';

interface VersionRow {
  id: string;
  version: string;
  status: 'PUBLISHED';
  content_sha256: string;
  published_at: string | Date;
}

interface VersionSummaryRow extends VersionRow {
  concept_count: string | number;
  domain_count: string | number;
  relationship_count: string | number;
  prerequisite_count: string | number;
  evidence_type_count: string | number;
  evidence_policy_count: string | number;
}

interface ConceptRow {
  concept_stable_id: string;
  display_name: string;
  short_description: string;
  kind: ConceptKind;
  difficulty: ConceptDifficulty;
  status: ConceptStatus;
  aliases: string[] | string;
  replacement_concept_ids: string[] | string;
  notes: string | null;
}

interface RelationshipRow {
  relationship_type: OntologyRelationshipType;
  from_concept_stable_id: string;
  to_concept_stable_id: string;
}

interface EvidenceTypeRow {
  stable_id: string;
  display_name: string;
  description: string;
  source_class: EvidenceSourceClass;
  allowed_polarities: EvidencePolarity[] | string;
}

interface EvidencePolicyRow {
  concept_stable_id: string;
  evidence_type_stable_id: string;
  evidence_role: EvidenceRole;
  rationale: string;
}

export interface OntologyVersionSummary extends OntologyVersionRecord {
  conceptCount: number;
  domainCount: number;
  relationshipCount: number;
  prerequisiteCount: number;
  evidenceTypeCount: number;
  evidencePolicyCount: number;
}

export type OntologySyncResult =
  | { status: 'published'; version: string; contentSha256: string }
  | { status: 'already_published'; version: string; contentSha256: string };

export class OntologyImmutabilityError extends Error {
  readonly code = 'ONTOLOGY_VERSION_HASH_CONFLICT';

  constructor(readonly version: string) {
    super(
      `Ontology version ${version} already exists with a different content hash. Create a new ontology version.`,
    );
    this.name = 'OntologyImmutabilityError';
  }
}

function iso(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : value;
}

function jsonArray<T extends string>(value: T[] | string): T[] {
  return typeof value === 'string' ? (JSON.parse(value) as T[]) : value;
}

function versionRecord(row: VersionRow): OntologyVersionRecord {
  return {
    version: row.version,
    status: row.status,
    contentSha256: row.content_sha256,
    publishedAt: iso(row.published_at),
  };
}

export class OntologyRepository {
  constructor(private readonly database: Database) {}

  async sync(source: ChessConceptOntologySource): Promise<OntologySyncResult> {
    new OntologyValidator().assertValid(source);
    const contentSha256 = ontologyContentSha256(source);
    return this.database.transaction(async (client) => {
      const existing = await client.query<VersionRow>(
        `SELECT id, version, status, content_sha256, published_at
         FROM ontology_versions WHERE version = $1`,
        [source.version],
      );
      if (existing.rows[0]) {
        if (existing.rows[0].content_sha256 !== contentSha256) {
          throw new OntologyImmutabilityError(source.version);
        }
        return { status: 'already_published', version: source.version, contentSha256 };
      }

      const ontologyVersionId = randomUUID();
      await client.query(
        `INSERT INTO ontology_versions (id, version, status, content_sha256)
         VALUES ($1, $2, 'PUBLISHED', $3)`,
        [ontologyVersionId, source.version, contentSha256],
      );
      await this.insertConcepts(client, ontologyVersionId, source);
      await this.insertEvidenceTypes(client, ontologyVersionId, source);
      await this.insertRelationships(client, ontologyVersionId, source);
      await this.insertEvidencePolicies(client, ontologyVersionId, source);
      return { status: 'published', version: source.version, contentSha256 };
    });
  }

  async listVersions(): Promise<OntologyVersionSummary[]> {
    const result = await this.database.query<VersionSummaryRow>(
      `SELECT version_row.*,
              (SELECT COUNT(*) FROM concept_definitions definition
               WHERE definition.ontology_version_id = version_row.id) AS concept_count,
              (SELECT COUNT(*) FROM concept_definitions definition
               WHERE definition.ontology_version_id = version_row.id
                 AND definition.kind = 'DOMAIN') AS domain_count,
              (SELECT COUNT(*) FROM concept_relationships relationship
               WHERE relationship.ontology_version_id = version_row.id) AS relationship_count,
              (SELECT COUNT(*) FROM concept_relationships relationship
               WHERE relationship.ontology_version_id = version_row.id
                 AND relationship.relationship_type = 'PREREQUISITE_OF') AS prerequisite_count,
              (SELECT COUNT(*) FROM evidence_type_definitions evidence
               WHERE evidence.ontology_version_id = version_row.id) AS evidence_type_count,
              (SELECT COUNT(*) FROM concept_evidence_policies policy
               WHERE policy.ontology_version_id = version_row.id) AS evidence_policy_count
       FROM ontology_versions version_row
       WHERE version_row.status = 'PUBLISHED'
       ORDER BY string_to_array(version_row.version, '.')::int[] DESC, version_row.published_at DESC`,
    );
    return result.rows.map((row) => ({
      ...versionRecord(row),
      conceptCount: Number(row.concept_count),
      domainCount: Number(row.domain_count),
      relationshipCount: Number(row.relationship_count),
      prerequisiteCount: Number(row.prerequisite_count),
      evidenceTypeCount: Number(row.evidence_type_count),
      evidencePolicyCount: Number(row.evidence_policy_count),
    }));
  }

  async getSnapshot(version: string | 'latest'): Promise<OntologySnapshot | null> {
    const versionResult = await this.database.query<VersionRow>(
      version === 'latest'
        ? `SELECT id, version, status, content_sha256, published_at
           FROM ontology_versions WHERE status = 'PUBLISHED'
           ORDER BY string_to_array(version, '.')::int[] DESC, published_at DESC LIMIT 1`
        : `SELECT id, version, status, content_sha256, published_at
           FROM ontology_versions WHERE version = $1 AND status = 'PUBLISHED'`,
      version === 'latest' ? [] : [version],
    );
    const row = versionResult.rows[0];
    if (!row) return null;

    const [concepts, relationships, evidenceTypes, evidencePolicies] = await Promise.all([
      this.database.query<ConceptRow>(
        `SELECT concept_stable_id, display_name, short_description, kind, difficulty,
                status, aliases, replacement_concept_ids, notes
         FROM concept_definitions WHERE ontology_version_id = $1
         ORDER BY concept_stable_id`,
        [row.id],
      ),
      this.database.query<RelationshipRow>(
        `SELECT relationship_type, from_concept_stable_id, to_concept_stable_id
         FROM concept_relationships WHERE ontology_version_id = $1
         ORDER BY relationship_type, from_concept_stable_id, to_concept_stable_id`,
        [row.id],
      ),
      this.database.query<EvidenceTypeRow>(
        `SELECT stable_id, display_name, description, source_class, allowed_polarities
         FROM evidence_type_definitions WHERE ontology_version_id = $1 ORDER BY stable_id`,
        [row.id],
      ),
      this.database.query<EvidencePolicyRow>(
        `SELECT concept_stable_id, evidence_type_stable_id, evidence_role, rationale
         FROM concept_evidence_policies WHERE ontology_version_id = $1
         ORDER BY concept_stable_id, evidence_type_stable_id`,
        [row.id],
      ),
    ]);
    return {
      ...versionRecord(row),
      source: {
        version: row.version,
        status: row.status,
        concepts: concepts.rows.map((concept) => ({
          stableId: concept.concept_stable_id,
          displayName: concept.display_name,
          shortDescription: concept.short_description,
          kind: concept.kind,
          difficulty: concept.difficulty,
          status: concept.status,
          aliases: jsonArray(concept.aliases),
          replacementConceptIds: jsonArray(concept.replacement_concept_ids),
          ...(concept.notes === null ? {} : { notes: concept.notes }),
        })),
        relationships: relationships.rows.map((relationship) => ({
          type: relationship.relationship_type,
          fromConceptId: relationship.from_concept_stable_id,
          toConceptId: relationship.to_concept_stable_id,
        })),
        evidenceTypes: evidenceTypes.rows.map((evidence) => ({
          stableId: evidence.stable_id,
          displayName: evidence.display_name,
          description: evidence.description,
          sourceClass: evidence.source_class,
          allowedPolarities: jsonArray(evidence.allowed_polarities),
        })),
        evidencePolicies: evidencePolicies.rows.map((policy) => ({
          conceptStableId: policy.concept_stable_id,
          evidenceTypeStableId: policy.evidence_type_stable_id,
          role: policy.evidence_role,
          rationale: policy.rationale,
        })),
      },
    };
  }

  getLatestPublishedVersion(): Promise<OntologySnapshot | null> {
    return this.getSnapshot('latest');
  }

  getPublishedVersion(version: string): Promise<OntologySnapshot | null> {
    return this.getSnapshot(version);
  }

  async getConcept(
    version: string | 'latest',
    stableId: string,
  ): Promise<OntologyConceptDetail | null> {
    const snapshot = await this.getSnapshot(version);
    return snapshot ? new OntologyRegistry(snapshot.source).getConceptDetail(stableId) : null;
  }

  async getChildren(
    version: string | 'latest',
    stableId: string,
  ): Promise<OntologyConceptSummary[]> {
    return (await this.getConcept(version, stableId))?.children ?? [];
  }

  async getPrerequisites(
    version: string | 'latest',
    stableId: string,
  ): Promise<OntologyConceptSummary[]> {
    return (await this.getConcept(version, stableId))?.prerequisites ?? [];
  }

  async getDependents(
    version: string | 'latest',
    stableId: string,
  ): Promise<OntologyConceptSummary[]> {
    return (await this.getConcept(version, stableId))?.dependents ?? [];
  }

  async getAllowedEvidence(
    version: string | 'latest',
    stableId: string,
  ): Promise<OntologyConceptDetail['allowedEvidence']> {
    return (await this.getConcept(version, stableId))?.allowedEvidence ?? [];
  }

  private async insertConcepts(
    client: QueryClient,
    ontologyVersionId: string,
    source: ChessConceptOntologySource,
  ): Promise<void> {
    for (const concept of source.concepts) {
      await client.query(
        `INSERT INTO concept_identities (stable_id) VALUES ($1)
         ON CONFLICT (stable_id) DO NOTHING`,
        [concept.stableId],
      );
      await client.query(
        `INSERT INTO concept_definitions (
           ontology_version_id, concept_stable_id, display_name, short_description,
           kind, difficulty, status, aliases, replacement_concept_ids, notes
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb, $10)`,
        [
          ontologyVersionId,
          concept.stableId,
          concept.displayName,
          concept.shortDescription,
          concept.kind,
          concept.difficulty,
          concept.status,
          JSON.stringify(concept.aliases),
          JSON.stringify(concept.replacementConceptIds),
          concept.notes ?? null,
        ],
      );
    }
  }

  private async insertEvidenceTypes(
    client: QueryClient,
    ontologyVersionId: string,
    source: ChessConceptOntologySource,
  ): Promise<void> {
    for (const evidence of source.evidenceTypes) {
      await client.query(
        `INSERT INTO evidence_type_definitions (
           ontology_version_id, stable_id, display_name, description,
           source_class, allowed_polarities
         ) VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
        [
          ontologyVersionId,
          evidence.stableId,
          evidence.displayName,
          evidence.description,
          evidence.sourceClass,
          JSON.stringify(evidence.allowedPolarities),
        ],
      );
    }
  }

  private async insertRelationships(
    client: QueryClient,
    ontologyVersionId: string,
    source: ChessConceptOntologySource,
  ): Promise<void> {
    for (const relationship of source.relationships) {
      await client.query(
        `INSERT INTO concept_relationships (
           ontology_version_id, relationship_type,
           from_concept_stable_id, to_concept_stable_id
         ) VALUES ($1, $2, $3, $4)`,
        [
          ontologyVersionId,
          relationship.type,
          relationship.fromConceptId,
          relationship.toConceptId,
        ],
      );
    }
  }

  private async insertEvidencePolicies(
    client: QueryClient,
    ontologyVersionId: string,
    source: ChessConceptOntologySource,
  ): Promise<void> {
    for (const policy of source.evidencePolicies) {
      await client.query(
        `INSERT INTO concept_evidence_policies (
           ontology_version_id, concept_stable_id, evidence_type_stable_id,
           evidence_role, rationale
         ) VALUES ($1, $2, $3, $4, $5)`,
        [
          ontologyVersionId,
          policy.conceptStableId,
          policy.evidenceTypeStableId,
          policy.role,
          policy.rationale,
        ],
      );
    }
  }
}
