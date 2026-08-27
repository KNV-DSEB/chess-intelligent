import { readFile } from 'node:fs/promises';

import { beforeAll, describe, expect, it } from 'vitest';

import {
  OntologyGraph,
  OntologyRegistry,
  OntologyValidator,
  ontologyContentSha256,
  parseOntologySource,
  type ChessConceptOntologySource,
} from './ontology';

let seed: ChessConceptOntologySource;

beforeAll(async () => {
  seed = parseOntologySource(
    JSON.parse(
      await readFile(new URL('../../../ontology/chess/1.0.0.json', import.meta.url), 'utf8'),
    ) as unknown,
  );
});

function fixture(): ChessConceptOntologySource {
  return {
    version: '1.0.0',
    status: 'PUBLISHED',
    concepts: [
      {
        stableId: 'domain.calculation',
        displayName: 'Calculation',
        shortDescription: 'Calculation domain.',
        kind: 'DOMAIN',
        difficulty: 'FOUNDATIONAL',
        status: 'ACTIVE',
        aliases: [],
        replacementConceptIds: [],
      },
      {
        stableId: 'calculation.candidate_moves',
        displayName: 'Candidate Moves',
        shortDescription: 'Generate plausible candidate moves.',
        kind: 'SKILL',
        difficulty: 'BASIC',
        status: 'ACTIVE',
        aliases: ['Candidate generation'],
        replacementConceptIds: [],
      },
    ],
    relationships: [
      {
        type: 'PARENT_OF',
        fromConceptId: 'domain.calculation',
        toConceptId: 'calculation.candidate_moves',
      },
    ],
    evidenceTypes: [
      {
        stableId: 'coach.annotation',
        displayName: 'Coach Annotation',
        description: 'A human coach annotation.',
        sourceClass: 'COACH',
        allowedPolarities: ['POSITIVE', 'NEGATIVE'],
      },
      {
        stableId: 'engine.eval_loss',
        displayName: 'Evaluation Loss',
        description: 'Generic engine evaluation loss.',
        sourceClass: 'ENGINE',
        allowedPolarities: ['NEGATIVE'],
      },
    ],
    evidencePolicies: [
      {
        conceptStableId: 'calculation.candidate_moves',
        evidenceTypeStableId: 'coach.annotation',
        role: 'DIRECT',
        rationale: 'A coach can observe and annotate the candidate process.',
      },
    ],
  };
}

function errorCodes(source: ChessConceptOntologySource): string[] {
  return new OntologyValidator().validate(source).errors.map((issue) => issue.code);
}

function clone(source: ChessConceptOntologySource): ChessConceptOntologySource {
  return structuredClone(source);
}

describe('Task 007 canonical ontology seed', () => {
  it('publishes a valid, useful academy vocabulary without Elo coupling', () => {
    const report = new OntologyValidator().validate(seed);
    expect(report).toMatchObject({
      valid: true,
      version: '1.0.0',
      conceptCount: 64,
      domainCount: 7,
      prerequisiteCount: 24,
      evidenceTypeCount: 12,
      evidencePolicyCount: 190,
    });
    expect(seed.concepts.map((concept) => concept.stableId)).toEqual(
      expect.arrayContaining([
        'calculation.candidate_moves',
        'tactics.deflection',
        'strategy.piece_activity',
        'endgame.rook_activity',
        'endgame.lucena',
        'endgame.philidor',
      ]),
    );
    expect(JSON.stringify(seed)).not.toMatch(/minimumElo|maximumElo|recommendedRating/u);
  });

  it('traverses hierarchy, prerequisites, and resolved evidence policies', () => {
    const graph = new OntologyGraph(seed);
    expect(graph.getTopLevelDomain('endgame.lucena')?.stableId).toBe('domain.endgame');
    expect(
      graph.getPrerequisites('endgame.triangulation').map((concept) => concept.stableId),
    ).toEqual(['endgame.opposition']);
    expect(
      graph.getDependents('endgame.king_activity').map((concept) => concept.stableId),
    ).toContain('endgame.opposition');

    const detail = new OntologyRegistry(seed).getConceptDetail('tactics.deflection');
    expect(detail?.allowedEvidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ stableId: 'position.tactical_motif', role: 'DIRECT' }),
        expect.objectContaining({ stableId: 'engine.eval_loss', role: 'CONTEXTUAL' }),
      ]),
    );
  });

  it('hashes canonical meaning deterministically despite source array order', () => {
    const reordered = clone(seed);
    reordered.concepts.reverse();
    reordered.relationships.reverse();
    reordered.relationships = reordered.relationships.map((relationship) => ({
      toConceptId: relationship.toConceptId,
      fromConceptId: relationship.fromConceptId,
      type: relationship.type,
    }));
    reordered.evidenceTypes.reverse();
    reordered.evidenceTypes = reordered.evidenceTypes.map((evidence) => ({
      allowedPolarities: evidence.allowedPolarities,
      sourceClass: evidence.sourceClass,
      description: evidence.description,
      displayName: evidence.displayName,
      stableId: evidence.stableId,
    }));
    reordered.evidencePolicies.reverse();
    reordered.evidencePolicies = reordered.evidencePolicies.map((policy) => ({
      rationale: policy.rationale,
      role: policy.role,
      evidenceTypeStableId: policy.evidenceTypeStableId,
      conceptStableId: policy.conceptStableId,
    }));
    for (const concept of reordered.concepts) {
      concept.aliases.reverse();
      concept.replacementConceptIds.reverse();
    }
    for (const evidence of reordered.evidenceTypes) evidence.allowedPolarities.reverse();
    expect(ontologyContentSha256(reordered)).toBe(ontologyContentSha256(seed));
  });
});

describe('Task 007 ontology validation', () => {
  it('reports malformed source structure before semantic validation', () => {
    const malformed = fixture() as unknown as { concepts: Array<Record<string, unknown>> };
    delete malformed.concepts[1]!.aliases;
    expect(() => parseOntologySource(malformed)).toThrow(
      'concepts[1].aliases must be an array of strings',
    );
  });

  it('rejects malformed and duplicate stable identities', () => {
    const malformed = fixture();
    malformed.concepts[1]!.stableId = 'Candidate Moves';
    expect(errorCodes(malformed)).toContain('INVALID_CONCEPT_ID');

    const duplicate = fixture();
    duplicate.concepts.push(clone(duplicate).concepts[1]!);
    expect(errorCodes(duplicate)).toContain('DUPLICATE_CONCEPT_ID');
  });

  it('rejects dangling, absent, and multiple hierarchy parents', () => {
    const dangling = fixture();
    dangling.relationships[0]!.fromConceptId = 'domain.unknown';
    expect(errorCodes(dangling)).toContain('DANGLING_RELATIONSHIP_FROM');

    const absent = fixture();
    absent.relationships = [];
    expect(errorCodes(absent)).toContain('MISSING_PRIMARY_PARENT');

    const multiple = fixture();
    multiple.concepts.push({
      ...multiple.concepts[0]!,
      stableId: 'domain.decision',
      displayName: 'Decision',
    });
    multiple.relationships.push({
      type: 'PARENT_OF',
      fromConceptId: 'domain.decision',
      toConceptId: 'calculation.candidate_moves',
    });
    expect(errorCodes(multiple)).toContain('MULTIPLE_PRIMARY_PARENTS');
  });

  it('detects hierarchy and prerequisite cycles, self edges, and dangling prerequisites', () => {
    const hierarchyCycle = fixture();
    hierarchyCycle.relationships.push({
      type: 'PARENT_OF',
      fromConceptId: 'calculation.candidate_moves',
      toConceptId: 'domain.calculation',
    });
    expect(errorCodes(hierarchyCycle)).toContain('HIERARCHY_CYCLE');

    const prerequisiteCycle = fixture();
    prerequisiteCycle.concepts.push({
      ...prerequisiteCycle.concepts[1]!,
      stableId: 'calculation.visualization',
      displayName: 'Visualization',
    });
    prerequisiteCycle.relationships.push(
      {
        type: 'PARENT_OF',
        fromConceptId: 'domain.calculation',
        toConceptId: 'calculation.visualization',
      },
      {
        type: 'PREREQUISITE_OF',
        fromConceptId: 'calculation.candidate_moves',
        toConceptId: 'calculation.visualization',
      },
      {
        type: 'PREREQUISITE_OF',
        fromConceptId: 'calculation.visualization',
        toConceptId: 'calculation.candidate_moves',
      },
    );
    prerequisiteCycle.evidencePolicies.push({
      ...prerequisiteCycle.evidencePolicies[0]!,
      conceptStableId: 'calculation.visualization',
    });
    expect(errorCodes(prerequisiteCycle)).toContain('PREREQUISITE_CYCLE');

    const self = fixture();
    self.relationships.push({
      type: 'PREREQUISITE_OF',
      fromConceptId: 'calculation.candidate_moves',
      toConceptId: 'calculation.candidate_moves',
    });
    expect(errorCodes(self)).toContain('SELF_PREREQUISITE');

    const dangling = fixture();
    dangling.relationships.push({
      type: 'PREREQUISITE_OF',
      fromConceptId: 'calculation.unknown',
      toConceptId: 'calculation.candidate_moves',
    });
    expect(errorCodes(dangling)).toContain('DANGLING_RELATIONSHIP_FROM');
  });

  it('enforces evidence registry and policy semantics', () => {
    const unknown = fixture();
    unknown.evidencePolicies[0]!.evidenceTypeStableId = 'coach.unknown';
    expect(errorCodes(unknown)).toContain('UNKNOWN_POLICY_EVIDENCE_TYPE');

    const duplicate = fixture();
    duplicate.evidencePolicies.push({ ...duplicate.evidencePolicies[0]! });
    expect(errorCodes(duplicate)).toContain('DUPLICATE_EVIDENCE_POLICY');

    const engineAsProof = fixture();
    engineAsProof.evidencePolicies.push({
      conceptStableId: 'calculation.candidate_moves',
      evidenceTypeStableId: 'engine.eval_loss',
      role: 'DIRECT',
      rationale: 'This invalid fixture treats a generic loss as specific proof.',
    });
    expect(errorCodes(engineAsProof)).toContain('GENERIC_ENGINE_EVIDENCE_CANNOT_BE_DIRECT');
  });

  it('rejects rating fields and warns on inverted pedagogical difficulty', () => {
    const ratingCoupled = fixture() as ChessConceptOntologySource & { minimumElo?: number };
    ratingCoupled.minimumElo = 1800;
    expect(errorCodes(ratingCoupled)).toContain('ELO_COUPLING_NOT_ALLOWED');

    const inverted = fixture();
    inverted.concepts.push({
      ...inverted.concepts[1]!,
      stableId: 'calculation.visualization',
      displayName: 'Visualization',
      difficulty: 'FOUNDATIONAL',
    });
    inverted.concepts[1]!.difficulty = 'ADVANCED';
    inverted.relationships.push(
      {
        type: 'PARENT_OF',
        fromConceptId: 'domain.calculation',
        toConceptId: 'calculation.visualization',
      },
      {
        type: 'PREREQUISITE_OF',
        fromConceptId: 'calculation.candidate_moves',
        toConceptId: 'calculation.visualization',
      },
    );
    inverted.evidencePolicies.push({
      ...inverted.evidencePolicies[0]!,
      conceptStableId: 'calculation.visualization',
    });
    expect(
      new OntologyValidator().validate(inverted).warnings.map((issue) => issue.code),
    ).toContain('PREREQUISITE_DIFFICULTY_INVERSION');
  });
});
