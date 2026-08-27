import { createHash } from 'node:crypto';

export const CONCEPT_KINDS = [
  'DOMAIN',
  'SKILL',
  'PRINCIPLE',
  'MOTIF',
  'TECHNIQUE',
  'STRUCTURE',
] as const;
export type ConceptKind = (typeof CONCEPT_KINDS)[number];

export const CONCEPT_DIFFICULTIES = [
  'FOUNDATIONAL',
  'BASIC',
  'INTERMEDIATE',
  'ADVANCED',
  'EXPERT',
] as const;
export type ConceptDifficulty = (typeof CONCEPT_DIFFICULTIES)[number];

export const CONCEPT_STATUSES = ['ACTIVE', 'DEPRECATED'] as const;
export type ConceptStatus = (typeof CONCEPT_STATUSES)[number];

export const ONTOLOGY_RELATIONSHIP_TYPES = ['PARENT_OF', 'PREREQUISITE_OF'] as const;
export type OntologyRelationshipType = (typeof ONTOLOGY_RELATIONSHIP_TYPES)[number];

export const EVIDENCE_SOURCE_CLASSES = [
  'ENGINE',
  'POSITION_RULE',
  'DECISION_CLASSIFIER',
  'TRAINING',
  'COACH',
  'ASSESSMENT',
  'GAME',
] as const;
export type EvidenceSourceClass = (typeof EVIDENCE_SOURCE_CLASSES)[number];

export const EVIDENCE_ROLES = ['DIRECT', 'SUPPORTING', 'CONTEXTUAL'] as const;
export type EvidenceRole = (typeof EVIDENCE_ROLES)[number];

export const EVIDENCE_POLARITIES = ['POSITIVE', 'NEGATIVE', 'NEUTRAL'] as const;
export type EvidencePolarity = (typeof EVIDENCE_POLARITIES)[number];

export interface OntologyConceptDefinition {
  stableId: string;
  displayName: string;
  shortDescription: string;
  kind: ConceptKind;
  difficulty: ConceptDifficulty;
  status: ConceptStatus;
  aliases: string[];
  replacementConceptIds: string[];
  notes?: string | undefined;
}

export interface OntologyRelationship {
  type: OntologyRelationshipType;
  fromConceptId: string;
  toConceptId: string;
}

export interface OntologyEvidenceTypeDefinition {
  stableId: string;
  displayName: string;
  description: string;
  sourceClass: EvidenceSourceClass;
  allowedPolarities: EvidencePolarity[];
}

export interface ConceptEvidencePolicy {
  conceptStableId: string;
  evidenceTypeStableId: string;
  role: EvidenceRole;
  rationale: string;
}

export interface ChessConceptOntologySource {
  version: string;
  status: 'PUBLISHED';
  concepts: OntologyConceptDefinition[];
  relationships: OntologyRelationship[];
  evidenceTypes: OntologyEvidenceTypeDefinition[];
  evidencePolicies: ConceptEvidencePolicy[];
}

export type OntologyValidationSeverity = 'ERROR' | 'WARNING';

export interface OntologyValidationIssue {
  severity: OntologyValidationSeverity;
  code: string;
  path: string;
  message: string;
}

export interface OntologyValidationReport {
  valid: boolean;
  version: string;
  conceptCount: number;
  domainCount: number;
  relationshipCount: number;
  prerequisiteCount: number;
  evidenceTypeCount: number;
  evidencePolicyCount: number;
  errors: OntologyValidationIssue[];
  warnings: OntologyValidationIssue[];
}

export interface OntologyVersionRecord {
  version: string;
  status: 'PUBLISHED';
  contentSha256: string;
  publishedAt: string;
}

export interface OntologySnapshot extends OntologyVersionRecord {
  source: ChessConceptOntologySource;
}

export interface OntologyConceptSummary {
  stableId: string;
  displayName: string;
  kind: ConceptKind;
  difficulty: ConceptDifficulty;
  status: ConceptStatus;
}

export interface OntologyConceptDetail extends OntologyConceptDefinition {
  ontologyVersion: string;
  parent: OntologyConceptSummary | null;
  children: OntologyConceptSummary[];
  prerequisites: OntologyConceptSummary[];
  dependents: OntologyConceptSummary[];
  allowedEvidence: Array<{
    stableId: string;
    displayName: string;
    description: string;
    sourceClass: EvidenceSourceClass;
    allowedPolarities: EvidencePolarity[];
    role: EvidenceRole;
    rationale: string;
  }>;
}

export class OntologyValidationError extends Error {
  constructor(readonly report: OntologyValidationReport) {
    super(
      `Ontology ${report.version || '(unknown)'} is invalid: ${report.errors
        .map((issue) => `${issue.code} at ${issue.path}: ${issue.message}`)
        .join('; ')}`,
    );
    this.name = 'OntologyValidationError';
  }
}

const STABLE_ID_SEGMENT = '[a-z][a-z0-9]*(?:_[a-z0-9]+)*';
const STABLE_ID_PATTERN = new RegExp(`^${STABLE_ID_SEGMENT}(?:\\.${STABLE_ID_SEGMENT})+$`, 'u');
const VERSION_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/u;
const DIFFICULTY_RANK: Readonly<Record<ConceptDifficulty, number>> = {
  FOUNDATIONAL: 0,
  BASIC: 1,
  INTERMEDIATE: 2,
  ADVANCED: 3,
  EXPERT: 4,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function sortedUnique(values: readonly string[]): string[] {
  return [...new Set(values)].sort(compareText);
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function cyclePath(
  nodes: readonly string[],
  edges: ReadonlyMap<string, readonly string[]>,
): string[] | null {
  const state = new Map<string, 'VISITING' | 'VISITED'>();
  const stack: string[] = [];
  const visit = (node: string): string[] | null => {
    if (state.get(node) === 'VISITING') {
      const index = stack.indexOf(node);
      return [...stack.slice(index), node];
    }
    if (state.get(node) === 'VISITED') return null;
    state.set(node, 'VISITING');
    stack.push(node);
    for (const next of edges.get(node) ?? []) {
      const cycle = visit(next);
      if (cycle) return cycle;
    }
    stack.pop();
    state.set(node, 'VISITED');
    return null;
  };
  for (const node of nodes) {
    const cycle = visit(node);
    if (cycle) return cycle;
  }
  return null;
}

function forbiddenRatingPath(value: unknown, path = '$'): string | null {
  if (Array.isArray(value)) {
    for (const [index, entry] of value.entries()) {
      const found = forbiddenRatingPath(entry, `${path}[${index}]`);
      if (found) return found;
    }
    return null;
  }
  if (!isRecord(value)) return null;
  for (const [key, entry] of Object.entries(value)) {
    if (['minimumelo', 'maximumelo', 'recommendedrating'].includes(key.toLowerCase())) {
      return `${path}.${key}`;
    }
    const found = forbiddenRatingPath(entry, `${path}.${key}`);
    if (found) return found;
  }
  return null;
}

export class OntologyValidator {
  validate(source: ChessConceptOntologySource): OntologyValidationReport {
    const issues: OntologyValidationIssue[] = [];
    const add = (
      severity: OntologyValidationSeverity,
      code: string,
      path: string,
      message: string,
    ): void => {
      issues.push({ severity, code, path, message });
    };
    if (!VERSION_PATTERN.test(source.version)) {
      add('ERROR', 'INVALID_VERSION', 'version', 'Use MAJOR.MINOR.PATCH with no prefixes.');
    }
    if (source.status !== 'PUBLISHED') {
      add('ERROR', 'INVALID_STATUS', 'status', 'Task 007 supports PUBLISHED ontologies only.');
    }

    const forbidden = forbiddenRatingPath(source);
    if (forbidden) {
      add(
        'ERROR',
        'ELO_COUPLING_NOT_ALLOWED',
        forbidden,
        'Ontology difficulty is pedagogical metadata and cannot contain Elo/rating fields.',
      );
    }

    const conceptById = new Map<string, OntologyConceptDefinition>();
    for (const [index, concept] of source.concepts.entries()) {
      const path = `concepts[${index}]`;
      if (!STABLE_ID_PATTERN.test(concept.stableId)) {
        add(
          'ERROR',
          'INVALID_CONCEPT_ID',
          `${path}.stableId`,
          'Use a lowercase namespaced stable ID.',
        );
      }
      if (conceptById.has(concept.stableId)) {
        add('ERROR', 'DUPLICATE_CONCEPT_ID', `${path}.stableId`, `Duplicate ${concept.stableId}.`);
      } else {
        conceptById.set(concept.stableId, concept);
      }
      if (!CONCEPT_KINDS.includes(concept.kind)) {
        add(
          'ERROR',
          'INVALID_CONCEPT_KIND',
          `${path}.kind`,
          `Unknown concept kind ${concept.kind}.`,
        );
      }
      if (!CONCEPT_DIFFICULTIES.includes(concept.difficulty)) {
        add(
          'ERROR',
          'INVALID_CONCEPT_DIFFICULTY',
          `${path}.difficulty`,
          `Unknown concept difficulty ${concept.difficulty}.`,
        );
      }
      if (!CONCEPT_STATUSES.includes(concept.status)) {
        add(
          'ERROR',
          'INVALID_CONCEPT_STATUS',
          `${path}.status`,
          `Unknown status ${concept.status}.`,
        );
      }
      if (!concept.displayName.trim()) {
        add('ERROR', 'MISSING_DISPLAY_NAME', `${path}.displayName`, 'Display name is required.');
      }
      if (
        concept.kind !== 'DOMAIN' &&
        concept.status === 'ACTIVE' &&
        !concept.shortDescription.trim()
      ) {
        add(
          'ERROR',
          'MISSING_DESCRIPTION',
          `${path}.shortDescription`,
          'Every active non-domain concept needs a concise description.',
        );
      }
      if (
        new Set(concept.aliases.map((alias) => alias.toLocaleLowerCase())).size !==
        concept.aliases.length
      ) {
        add('ERROR', 'DUPLICATE_ALIAS', `${path}.aliases`, 'Aliases must be unique per concept.');
      }
      if (concept.status === 'ACTIVE' && concept.replacementConceptIds.length > 0) {
        add(
          'ERROR',
          'ACTIVE_CONCEPT_REPLACEMENT',
          `${path}.replacementConceptIds`,
          'Only deprecated concepts may declare replacements.',
        );
      }
      if (concept.replacementConceptIds.includes(concept.stableId)) {
        add(
          'ERROR',
          'SELF_REPLACEMENT',
          `${path}.replacementConceptIds`,
          'A deprecated concept cannot replace itself.',
        );
      }
    }

    for (const [index, concept] of source.concepts.entries()) {
      for (const replacement of concept.replacementConceptIds) {
        if (!conceptById.has(replacement)) {
          add(
            'ERROR',
            'DANGLING_REPLACEMENT',
            `concepts[${index}].replacementConceptIds`,
            `Replacement ${replacement} does not exist.`,
          );
        }
      }
    }

    const relationshipKeys = new Set<string>();
    const parentByChild = new Map<string, string[]>();
    const hierarchyEdges = new Map<string, string[]>();
    const prerequisiteEdges = new Map<string, string[]>();
    for (const [index, relationship] of source.relationships.entries()) {
      const path = `relationships[${index}]`;
      const key = `${relationship.type}:${relationship.fromConceptId}:${relationship.toConceptId}`;
      if (relationshipKeys.has(key)) {
        add('ERROR', 'DUPLICATE_RELATIONSHIP', path, `Duplicate relationship ${key}.`);
      }
      relationshipKeys.add(key);
      if (!ONTOLOGY_RELATIONSHIP_TYPES.includes(relationship.type)) {
        add('ERROR', 'INVALID_RELATIONSHIP_TYPE', `${path}.type`, 'Unknown relationship type.');
      }
      if (!conceptById.has(relationship.fromConceptId)) {
        add(
          'ERROR',
          'DANGLING_RELATIONSHIP_FROM',
          `${path}.fromConceptId`,
          'Concept does not exist.',
        );
      }
      if (!conceptById.has(relationship.toConceptId)) {
        add('ERROR', 'DANGLING_RELATIONSHIP_TO', `${path}.toConceptId`, 'Concept does not exist.');
      }
      if (relationship.fromConceptId === relationship.toConceptId) {
        add(
          'ERROR',
          relationship.type === 'PREREQUISITE_OF'
            ? 'SELF_PREREQUISITE'
            : 'SELF_HIERARCHY_RELATIONSHIP',
          path,
          'A concept cannot relate to itself in this relationship.',
        );
      }
      if (relationship.type === 'PARENT_OF') {
        const parents = parentByChild.get(relationship.toConceptId) ?? [];
        parents.push(relationship.fromConceptId);
        parentByChild.set(relationship.toConceptId, parents);
        const children = hierarchyEdges.get(relationship.fromConceptId) ?? [];
        children.push(relationship.toConceptId);
        hierarchyEdges.set(relationship.fromConceptId, children);
      } else {
        const dependents = prerequisiteEdges.get(relationship.fromConceptId) ?? [];
        dependents.push(relationship.toConceptId);
        prerequisiteEdges.set(relationship.fromConceptId, dependents);
        const prerequisite = conceptById.get(relationship.fromConceptId);
        const dependent = conceptById.get(relationship.toConceptId);
        if (
          prerequisite &&
          dependent &&
          DIFFICULTY_RANK[prerequisite.difficulty] > DIFFICULTY_RANK[dependent.difficulty]
        ) {
          add(
            'WARNING',
            'PREREQUISITE_DIFFICULTY_INVERSION',
            path,
            `${prerequisite.stableId} is harder than dependent ${dependent.stableId}; review the edge.`,
          );
        }
      }
    }

    const conceptIds = [...conceptById.keys()];
    const hierarchyCycle = cyclePath(conceptIds, hierarchyEdges);
    if (hierarchyCycle) {
      add(
        'ERROR',
        'HIERARCHY_CYCLE',
        'relationships',
        `Hierarchy cycle: ${hierarchyCycle.join(' -> ')}.`,
      );
    }
    const prerequisiteCycle = cyclePath(conceptIds, prerequisiteEdges);
    if (prerequisiteCycle) {
      add(
        'ERROR',
        'PREREQUISITE_CYCLE',
        'relationships',
        `Prerequisite cycle: ${prerequisiteCycle.join(' -> ')}.`,
      );
    }

    for (const concept of source.concepts) {
      const parents = parentByChild.get(concept.stableId) ?? [];
      if (concept.kind === 'DOMAIN' && parents.length > 0) {
        add(
          'ERROR',
          'DOMAIN_HAS_PARENT',
          `concept:${concept.stableId}`,
          'Top-level domains cannot have a parent.',
        );
      }
      if (concept.kind !== 'DOMAIN' && parents.length !== 1) {
        add(
          'ERROR',
          parents.length > 1 ? 'MULTIPLE_PRIMARY_PARENTS' : 'MISSING_PRIMARY_PARENT',
          `concept:${concept.stableId}`,
          `A non-domain concept requires exactly one parent; found ${parents.length}.`,
        );
      }
      if (concept.kind !== 'DOMAIN' && parents.length === 1 && !hierarchyCycle) {
        const visited = new Set<string>();
        let current: OntologyConceptDefinition | undefined = concept;
        while (current && current.kind !== 'DOMAIN' && !visited.has(current.stableId)) {
          visited.add(current.stableId);
          const parentId: string | undefined = parentByChild.get(current.stableId)?.[0];
          current = parentId ? conceptById.get(parentId) : undefined;
        }
        if (!current || current.kind !== 'DOMAIN') {
          add(
            'ERROR',
            'UNREACHABLE_FROM_DOMAIN',
            `concept:${concept.stableId}`,
            'Concept is not reachable from a top-level domain.',
          );
        }
      }
    }

    const evidenceById = new Map<string, OntologyEvidenceTypeDefinition>();
    for (const [index, evidence] of source.evidenceTypes.entries()) {
      const path = `evidenceTypes[${index}]`;
      if (!STABLE_ID_PATTERN.test(evidence.stableId)) {
        add('ERROR', 'INVALID_EVIDENCE_ID', `${path}.stableId`, 'Use a lowercase namespaced ID.');
      }
      if (evidenceById.has(evidence.stableId)) {
        add(
          'ERROR',
          'DUPLICATE_EVIDENCE_ID',
          `${path}.stableId`,
          `Duplicate ${evidence.stableId}.`,
        );
      } else {
        evidenceById.set(evidence.stableId, evidence);
      }
      if (!EVIDENCE_SOURCE_CLASSES.includes(evidence.sourceClass)) {
        add(
          'ERROR',
          'INVALID_EVIDENCE_SOURCE_CLASS',
          `${path}.sourceClass`,
          'Unknown source class.',
        );
      }
      if (
        evidence.allowedPolarities.length === 0 ||
        evidence.allowedPolarities.some((polarity) => !EVIDENCE_POLARITIES.includes(polarity))
      ) {
        add(
          'ERROR',
          'INVALID_EVIDENCE_POLARITIES',
          `${path}.allowedPolarities`,
          'At least one known evidence polarity is required.',
        );
      }
      if (new Set(evidence.allowedPolarities).size !== evidence.allowedPolarities.length) {
        add(
          'ERROR',
          'DUPLICATE_EVIDENCE_POLARITY',
          `${path}.allowedPolarities`,
          'Allowed evidence polarities must be unique.',
        );
      }
    }

    const policyKeys = new Set<string>();
    const policiesByConcept = new Map<string, ConceptEvidencePolicy[]>();
    for (const [index, policy] of source.evidencePolicies.entries()) {
      const path = `evidencePolicies[${index}]`;
      const key = `${policy.conceptStableId}:${policy.evidenceTypeStableId}`;
      if (policyKeys.has(key)) {
        add('ERROR', 'DUPLICATE_EVIDENCE_POLICY', path, `Duplicate policy ${key}.`);
      }
      policyKeys.add(key);
      const concept = conceptById.get(policy.conceptStableId);
      if (!concept) {
        add(
          'ERROR',
          'UNKNOWN_POLICY_CONCEPT',
          `${path}.conceptStableId`,
          'Concept does not exist.',
        );
      }
      if (!evidenceById.has(policy.evidenceTypeStableId)) {
        add(
          'ERROR',
          'UNKNOWN_POLICY_EVIDENCE_TYPE',
          `${path}.evidenceTypeStableId`,
          'Evidence type does not exist.',
        );
      }
      if (!EVIDENCE_ROLES.includes(policy.role)) {
        add('ERROR', 'INVALID_EVIDENCE_ROLE', `${path}.role`, 'Unknown evidence role.');
      }
      if (!policy.rationale.trim()) {
        add(
          'ERROR',
          'MISSING_POLICY_RATIONALE',
          `${path}.rationale`,
          'Policy rationale is required.',
        );
      }
      if (
        ['engine.eval_loss', 'engine.severe_eval_loss'].includes(policy.evidenceTypeStableId) &&
        policy.role === 'DIRECT' &&
        concept?.kind !== 'DOMAIN'
      ) {
        add(
          'ERROR',
          'GENERIC_ENGINE_EVIDENCE_CANNOT_BE_DIRECT',
          path,
          'Generic engine loss cannot directly prove a specific chess concept.',
        );
      }
      if (concept?.status === 'DEPRECATED') {
        add(
          'WARNING',
          'DEPRECATED_CONCEPT_POLICY',
          path,
          'Review whether a deprecated concept should receive evidence in this version.',
        );
      }
      const conceptPolicies = policiesByConcept.get(policy.conceptStableId) ?? [];
      conceptPolicies.push(policy);
      policiesByConcept.set(policy.conceptStableId, conceptPolicies);
    }

    for (const concept of source.concepts) {
      const isLeaf = (hierarchyEdges.get(concept.stableId) ?? []).length === 0;
      if (concept.status === 'ACTIVE' && concept.kind !== 'DOMAIN' && isLeaf) {
        const hasMeaningfulPath = (policiesByConcept.get(concept.stableId) ?? []).some(
          (policy) => policy.role === 'DIRECT' || policy.role === 'SUPPORTING',
        );
        if (!hasMeaningfulPath) {
          add(
            'ERROR',
            'LEAF_WITHOUT_MEANINGFUL_EVIDENCE',
            `concept:${concept.stableId}`,
            'Active learnable leaves require DIRECT or SUPPORTING allowed evidence.',
          );
        }
      }
    }

    const errors = issues.filter((issue) => issue.severity === 'ERROR');
    const warnings = issues.filter((issue) => issue.severity === 'WARNING');
    return {
      valid: errors.length === 0,
      version: source.version,
      conceptCount: source.concepts.length,
      domainCount: source.concepts.filter((concept) => concept.kind === 'DOMAIN').length,
      relationshipCount: source.relationships.length,
      prerequisiteCount: source.relationships.filter(
        (relationship) => relationship.type === 'PREREQUISITE_OF',
      ).length,
      evidenceTypeCount: source.evidenceTypes.length,
      evidencePolicyCount: source.evidencePolicies.length,
      errors,
      warnings,
    };
  }

  assertValid(source: ChessConceptOntologySource): OntologyValidationReport {
    const report = this.validate(source);
    if (!report.valid) throw new OntologyValidationError(report);
    return report;
  }
}

export function parseOntologySource(value: unknown): ChessConceptOntologySource {
  if (!isRecord(value)) {
    throw new Error('Ontology source must be a JSON object.');
  }
  for (const property of ['concepts', 'relationships', 'evidenceTypes', 'evidencePolicies']) {
    if (!Array.isArray(value[property])) {
      throw new Error(`Ontology source property ${property} must be an array.`);
    }
  }
  if (typeof value.version !== 'string' || typeof value.status !== 'string') {
    throw new Error('Ontology source requires string version and status fields.');
  }
  const requireRecord = (entry: unknown, path: string): Record<string, unknown> => {
    if (!isRecord(entry)) throw new Error(`Ontology source ${path} must be an object.`);
    return entry;
  };
  const requireString = (record: Record<string, unknown>, property: string, path: string): void => {
    if (typeof record[property] !== 'string') {
      throw new Error(`Ontology source ${path}.${property} must be a string.`);
    }
  };
  const requireStringArray = (
    record: Record<string, unknown>,
    property: string,
    path: string,
  ): void => {
    if (
      !Array.isArray(record[property]) ||
      record[property].some((entry) => typeof entry !== 'string')
    ) {
      throw new Error(`Ontology source ${path}.${property} must be an array of strings.`);
    }
  };
  const concepts = value.concepts as unknown[];
  const relationships = value.relationships as unknown[];
  const evidenceTypes = value.evidenceTypes as unknown[];
  const evidencePolicies = value.evidencePolicies as unknown[];
  for (const [index, entry] of concepts.entries()) {
    const path = `concepts[${index}]`;
    const record = requireRecord(entry, path);
    for (const property of [
      'stableId',
      'displayName',
      'shortDescription',
      'kind',
      'difficulty',
      'status',
    ]) {
      requireString(record, property, path);
    }
    requireStringArray(record, 'aliases', path);
    requireStringArray(record, 'replacementConceptIds', path);
    if (record.notes !== undefined) requireString(record, 'notes', path);
  }
  for (const [index, entry] of relationships.entries()) {
    const path = `relationships[${index}]`;
    const record = requireRecord(entry, path);
    for (const property of ['type', 'fromConceptId', 'toConceptId']) {
      requireString(record, property, path);
    }
  }
  for (const [index, entry] of evidenceTypes.entries()) {
    const path = `evidenceTypes[${index}]`;
    const record = requireRecord(entry, path);
    for (const property of ['stableId', 'displayName', 'description', 'sourceClass']) {
      requireString(record, property, path);
    }
    requireStringArray(record, 'allowedPolarities', path);
  }
  for (const [index, entry] of evidencePolicies.entries()) {
    const path = `evidencePolicies[${index}]`;
    const record = requireRecord(entry, path);
    for (const property of ['conceptStableId', 'evidenceTypeStableId', 'role', 'rationale']) {
      requireString(record, property, path);
    }
  }
  const source = value as unknown as ChessConceptOntologySource;
  new OntologyValidator().assertValid(source);
  return source;
}

export function canonicalizeOntology(
  source: ChessConceptOntologySource,
): ChessConceptOntologySource {
  return {
    version: source.version,
    status: source.status,
    concepts: source.concepts
      .map((concept) => ({
        stableId: concept.stableId,
        displayName: concept.displayName,
        shortDescription: concept.shortDescription,
        kind: concept.kind,
        difficulty: concept.difficulty,
        status: concept.status,
        aliases: sortedUnique(concept.aliases),
        replacementConceptIds: sortedUnique(concept.replacementConceptIds),
        ...(concept.notes === undefined ? {} : { notes: concept.notes }),
      }))
      .sort((left, right) => compareText(left.stableId, right.stableId)),
    relationships: source.relationships
      .map((relationship) => ({
        type: relationship.type,
        fromConceptId: relationship.fromConceptId,
        toConceptId: relationship.toConceptId,
      }))
      .sort(
        (left, right) =>
          compareText(left.type, right.type) ||
          compareText(left.fromConceptId, right.fromConceptId) ||
          compareText(left.toConceptId, right.toConceptId),
      ),
    evidenceTypes: source.evidenceTypes
      .map((evidence) => ({
        stableId: evidence.stableId,
        displayName: evidence.displayName,
        description: evidence.description,
        sourceClass: evidence.sourceClass,
        allowedPolarities: [...evidence.allowedPolarities].sort(compareText),
      }))
      .sort((left, right) => compareText(left.stableId, right.stableId)),
    evidencePolicies: source.evidencePolicies
      .map((policy) => ({
        conceptStableId: policy.conceptStableId,
        evidenceTypeStableId: policy.evidenceTypeStableId,
        role: policy.role,
        rationale: policy.rationale,
      }))
      .sort(
        (left, right) =>
          compareText(left.conceptStableId, right.conceptStableId) ||
          compareText(left.evidenceTypeStableId, right.evidenceTypeStableId),
      ),
  };
}

export function ontologyCanonicalJson(source: ChessConceptOntologySource): string {
  return JSON.stringify(canonicalizeOntology(source));
}

export function ontologyContentSha256(source: ChessConceptOntologySource): string {
  return createHash('sha256').update(ontologyCanonicalJson(source), 'utf8').digest('hex');
}

export class OntologyGraph {
  private readonly concepts: Map<string, OntologyConceptDefinition>;
  private readonly parentByChild = new Map<string, string>();
  private readonly childrenByParent = new Map<string, string[]>();
  private readonly prerequisitesByDependent = new Map<string, string[]>();
  private readonly dependentsByPrerequisite = new Map<string, string[]>();

  constructor(readonly source: ChessConceptOntologySource) {
    this.concepts = new Map(source.concepts.map((concept) => [concept.stableId, concept]));
    for (const relationship of source.relationships) {
      if (relationship.type === 'PARENT_OF') {
        this.parentByChild.set(relationship.toConceptId, relationship.fromConceptId);
        const children = this.childrenByParent.get(relationship.fromConceptId) ?? [];
        children.push(relationship.toConceptId);
        this.childrenByParent.set(relationship.fromConceptId, children);
      } else {
        const prerequisites = this.prerequisitesByDependent.get(relationship.toConceptId) ?? [];
        prerequisites.push(relationship.fromConceptId);
        this.prerequisitesByDependent.set(relationship.toConceptId, prerequisites);
        const dependents = this.dependentsByPrerequisite.get(relationship.fromConceptId) ?? [];
        dependents.push(relationship.toConceptId);
        this.dependentsByPrerequisite.set(relationship.fromConceptId, dependents);
      }
    }
  }

  getConcept(stableId: string): OntologyConceptDefinition | null {
    return this.concepts.get(stableId) ?? null;
  }

  getParent(stableId: string): OntologyConceptDefinition | null {
    const parentId = this.parentByChild.get(stableId);
    return parentId ? (this.concepts.get(parentId) ?? null) : null;
  }

  getChildren(stableId: string): OntologyConceptDefinition[] {
    return this.definitions(this.childrenByParent.get(stableId) ?? []);
  }

  getPrerequisites(stableId: string): OntologyConceptDefinition[] {
    return this.definitions(this.prerequisitesByDependent.get(stableId) ?? []);
  }

  getDependents(stableId: string): OntologyConceptDefinition[] {
    return this.definitions(this.dependentsByPrerequisite.get(stableId) ?? []);
  }

  getTopLevelDomain(stableId: string): OntologyConceptDefinition | null {
    let current = this.getConcept(stableId);
    const visited = new Set<string>();
    while (current && current.kind !== 'DOMAIN' && !visited.has(current.stableId)) {
      visited.add(current.stableId);
      current = this.getParent(current.stableId);
    }
    return current?.kind === 'DOMAIN' ? current : null;
  }

  getDescendantIds(stableId: string): string[] {
    const descendants: string[] = [];
    const pending = [...(this.childrenByParent.get(stableId) ?? [])];
    while (pending.length > 0) {
      const current = pending.shift()!;
      descendants.push(current);
      pending.push(...(this.childrenByParent.get(current) ?? []));
    }
    return descendants;
  }

  private definitions(ids: readonly string[]): OntologyConceptDefinition[] {
    return ids
      .flatMap((id) => {
        const concept = this.concepts.get(id);
        return concept ? [concept] : [];
      })
      .sort((left, right) => left.displayName.localeCompare(right.displayName));
  }
}

function summary(concept: OntologyConceptDefinition): OntologyConceptSummary {
  return {
    stableId: concept.stableId,
    displayName: concept.displayName,
    kind: concept.kind,
    difficulty: concept.difficulty,
    status: concept.status,
  };
}

export class OntologyRegistry {
  readonly graph: OntologyGraph;

  constructor(readonly source: ChessConceptOntologySource) {
    new OntologyValidator().assertValid(source);
    this.graph = new OntologyGraph(source);
  }

  hasActiveConcept(stableId: string): boolean {
    return this.graph.getConcept(stableId)?.status === 'ACTIVE';
  }

  isEvidenceAllowed(conceptStableId: string, evidenceTypeStableId: string): boolean {
    return this.source.evidencePolicies.some(
      (policy) =>
        policy.conceptStableId === conceptStableId &&
        policy.evidenceTypeStableId === evidenceTypeStableId,
    );
  }

  getConceptDetail(stableId: string): OntologyConceptDetail | null {
    const concept = this.graph.getConcept(stableId);
    if (!concept) return null;
    const evidenceById = new Map(
      this.source.evidenceTypes.map((evidence) => [evidence.stableId, evidence]),
    );
    return {
      ...concept,
      ontologyVersion: this.source.version,
      parent: this.graph.getParent(stableId) ? summary(this.graph.getParent(stableId)!) : null,
      children: this.graph.getChildren(stableId).map(summary),
      prerequisites: this.graph.getPrerequisites(stableId).map(summary),
      dependents: this.graph.getDependents(stableId).map(summary),
      allowedEvidence: this.source.evidencePolicies
        .filter((policy) => policy.conceptStableId === stableId)
        .flatMap((policy) => {
          const evidence = evidenceById.get(policy.evidenceTypeStableId);
          return evidence ? [{ ...evidence, role: policy.role, rationale: policy.rationale }] : [];
        })
        .sort(
          (left, right) =>
            EVIDENCE_ROLES.indexOf(left.role) - EVIDENCE_ROLES.indexOf(right.role) ||
            left.stableId.localeCompare(right.stableId),
        ),
    };
  }
}
