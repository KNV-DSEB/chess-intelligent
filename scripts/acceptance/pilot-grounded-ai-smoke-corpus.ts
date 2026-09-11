import {
  GROUNDED_BRIEF_CONTEXT_VERSION,
  type GroundedBriefAudience,
  type GroundedBriefContext,
  type GroundedBriefConceptContext,
} from '../../packages/domain/src/index';

export interface PilotAiSmokeScenario {
  id: string;
  audience: GroundedBriefAudience;
  responseLanguage: 'EN' | 'VI';
  supportState: GroundedBriefConceptContext['supportState'];
  evidenceConfidence: GroundedBriefConceptContext['evidenceConfidence'];
  conceptCount: 1 | 2;
  withTrainingPlan: boolean;
  trainingSupported: boolean;
  progressEvidence: 'RECENT_COMPATIBLE' | 'NO_COMPARABLE_PROGRESS' | 'NONE';
}

export const PILOT_AI_SMOKE_SCENARIOS: readonly PilotAiSmokeScenario[] = [
  {
    id: 'coach-high-confidence-multiple-training-vi',
    audience: 'COACH',
    responseLanguage: 'VI',
    supportState: 'ESTIMATED',
    evidenceConfidence: 'HIGH',
    conceptCount: 2,
    withTrainingPlan: true,
    trainingSupported: true,
    progressEvidence: 'RECENT_COMPATIBLE',
  },
  {
    id: 'student-high-confidence-training-en',
    audience: 'STUDENT',
    responseLanguage: 'EN',
    supportState: 'ESTIMATED',
    evidenceConfidence: 'HIGH',
    conceptCount: 1,
    withTrainingPlan: true,
    trainingSupported: true,
    progressEvidence: 'NONE',
  },
  {
    id: 'coach-moderate-multiple-vi',
    audience: 'COACH',
    responseLanguage: 'VI',
    supportState: 'ESTIMATED',
    evidenceConfidence: 'MODERATE',
    conceptCount: 2,
    withTrainingPlan: false,
    trainingSupported: true,
    progressEvidence: 'NO_COMPARABLE_PROGRESS',
  },
  {
    id: 'student-moderate-no-action-vi',
    audience: 'STUDENT',
    responseLanguage: 'VI',
    supportState: 'ESTIMATED',
    evidenceConfidence: 'MODERATE',
    conceptCount: 1,
    withTrainingPlan: false,
    trainingSupported: false,
    progressEvidence: 'NONE',
  },
  {
    id: 'coach-insufficient-training-en',
    audience: 'COACH',
    responseLanguage: 'EN',
    supportState: 'INSUFFICIENT_EVIDENCE',
    evidenceConfidence: 'LOW',
    conceptCount: 1,
    withTrainingPlan: true,
    trainingSupported: true,
    progressEvidence: 'NONE',
  },
  {
    id: 'student-insufficient-no-action-vi',
    audience: 'STUDENT',
    responseLanguage: 'VI',
    supportState: 'INSUFFICIENT_EVIDENCE',
    evidenceConfidence: 'LOW',
    conceptCount: 1,
    withTrainingPlan: false,
    trainingSupported: false,
    progressEvidence: 'NO_COMPARABLE_PROGRESS',
  },
  {
    id: 'coach-no-evidence-en',
    audience: 'COACH',
    responseLanguage: 'EN',
    supportState: 'NO_EVIDENCE',
    evidenceConfidence: 'LOW',
    conceptCount: 1,
    withTrainingPlan: false,
    trainingSupported: false,
    progressEvidence: 'NONE',
  },
  {
    id: 'student-no-evidence-vi',
    audience: 'STUDENT',
    responseLanguage: 'VI',
    supportState: 'NO_EVIDENCE',
    evidenceConfidence: 'LOW',
    conceptCount: 1,
    withTrainingPlan: false,
    trainingSupported: false,
    progressEvidence: 'NONE',
  },
  {
    id: 'coach-recent-compatible-en',
    audience: 'COACH',
    responseLanguage: 'EN',
    supportState: 'ESTIMATED',
    evidenceConfidence: 'MODERATE',
    conceptCount: 1,
    withTrainingPlan: true,
    trainingSupported: true,
    progressEvidence: 'RECENT_COMPATIBLE',
  },
  {
    id: 'student-recent-compatible-vi',
    audience: 'STUDENT',
    responseLanguage: 'VI',
    supportState: 'ESTIMATED',
    evidenceConfidence: 'MODERATE',
    conceptCount: 1,
    withTrainingPlan: true,
    trainingSupported: true,
    progressEvidence: 'RECENT_COMPATIBLE',
  },
  {
    id: 'coach-no-comparable-progress-vi',
    audience: 'COACH',
    responseLanguage: 'VI',
    supportState: 'ESTIMATED',
    evidenceConfidence: 'MODERATE',
    conceptCount: 2,
    withTrainingPlan: false,
    trainingSupported: true,
    progressEvidence: 'NO_COMPARABLE_PROGRESS',
  },
  {
    id: 'student-no-comparable-progress-en',
    audience: 'STUDENT',
    responseLanguage: 'EN',
    supportState: 'ESTIMATED',
    evidenceConfidence: 'MODERATE',
    conceptCount: 1,
    withTrainingPlan: false,
    trainingSupported: false,
    progressEvidence: 'NO_COMPARABLE_PROGRESS',
  },
] as const;

function uuid(suffix: number): string {
  return `00000000-0000-4000-8000-${String(suffix).padStart(12, '0')}`;
}

export function buildPilotAiSmokeContext(
  index: number,
  scenario = PILOT_AI_SMOKE_SCENARIOS[index % PILOT_AI_SMOKE_SCENARIOS.length]!,
): GroundedBriefContext {
  const graphId = uuid(index + 300);
  const planId = scenario.withTrainingPlan ? uuid(index + 400) : null;
  const coverageRef = `coverage-report:synthetic-${index}`;
  const graphRef = `skill-graph:${graphId}`;
  const trainingRef = `training-evidence:synthetic-${index}`;
  const permittedEvidenceRefs: GroundedBriefContext['permittedEvidenceRefs'] = [
    { ref: graphRef, kind: 'SKILL_GRAPH_RUN' },
    { ref: coverageRef, kind: 'COVERAGE_REPORT' },
  ];
  if (planId) permittedEvidenceRefs.push({ ref: `training-plan:${planId}`, kind: 'TRAINING_PLAN' });
  if (scenario.progressEvidence === 'RECENT_COMPATIBLE') {
    permittedEvidenceRefs.push({ ref: trainingRef, kind: 'TRAINING_EVIDENCE' });
  }

  const conceptIds = ['tactics.fork', 'tactics.pin'].slice(0, scenario.conceptCount);
  const concepts = conceptIds.map((stableId, conceptIndex): GroundedBriefConceptContext => {
    const conceptRef = `concept-evidence:synthetic-${index}-${conceptIndex + 1}`;
    const hasEvidence = scenario.supportState !== 'NO_EVIDENCE';
    const evidenceRefs = hasEvidence ? [conceptRef] : [];
    if (hasEvidence) permittedEvidenceRefs.push({ ref: conceptRef, kind: 'CONCEPT_EVIDENCE' });
    if (hasEvidence && scenario.progressEvidence === 'RECENT_COMPATIBLE') {
      evidenceRefs.push(trainingRef);
    }
    const estimated = scenario.supportState === 'ESTIMATED';
    return {
      stableId,
      displayName: stableId === 'tactics.fork' ? 'Fork' : 'Pin',
      supportState: scenario.supportState,
      masteryBand: estimated ? 'DEVELOPING' : null,
      evidenceConfidence: scenario.evidenceConfidence,
      posteriorMean: estimated ? 0.45 + ((index + conceptIndex) % 5) / 20 : null,
      directEvidenceCount: hasEvidence ? (estimated ? 4 + (index % 4) : 1) : 0,
      effectiveEvidenceMass: hasEvidence ? (estimated ? 2.5 + (index % 3) : 0.4) : 0,
      evidenceRefs,
      trainingSupported: scenario.trainingSupported,
    };
  });

  const lowCoverage = scenario.supportState !== 'ESTIMATED';
  return {
    contextVersion: GROUNDED_BRIEF_CONTEXT_VERSION,
    audience: scenario.audience,
    academyId: uuid(1),
    studentProfileId: uuid(index + 100),
    player: { id: uuid(index + 200) },
    source: {
      skillGraphRunId: graphId,
      trainingPlanRunId: planId,
      ontologyVersion: '1.0.0',
      classifierBundleVersion: 'CONCEPT_CLASSIFIER_BUNDLE_V2',
      skillGraphPolicyVersion: 'SKILL_GRAPH_POLICY_V2',
      asOfDate: '2026-09-11',
    },
    coverage: {
      reportVersion: 'CONCEPT_COVERAGE_REPORT_V1',
      classifierSupported: 13,
      trainable: 8,
      decisionOccurrences: 8 + index,
      classifiedDecisions: lowCoverage
        ? scenario.supportState === 'NO_EVIDENCE'
          ? 0
          : 1
        : 6 + index,
      engineBackedDecisions: lowCoverage
        ? scenario.supportState === 'NO_EVIDENCE'
          ? 0
          : 1
        : 5 + index,
      masteryEligibleEvidence: lowCoverage ? 0 : 3 + (index % 5),
    },
    concepts,
    permittedEvidenceRefs,
  };
}

export function pilotAiSmokeSystemPrompt(scenario: PilotAiSmokeScenario): string {
  const language =
    scenario.responseLanguage === 'VI'
      ? 'Trả lời bằng tiếng Việt tự nhiên, ngắn gọn, phù hợp với người dùng học viện cờ vua.'
      : 'Write in concise, natural English for the intended academy audience.';
  const progress =
    scenario.progressEvidence === 'RECENT_COMPATIBLE'
      ? 'A training-evidence reference is present; do not infer a progress direction beyond its structured facts.'
      : scenario.progressEvidence === 'NO_COMPARABLE_PROGRESS'
        ? 'No comparable progress fact is present; state that limitation instead of inventing progress.'
        : 'Do not introduce a progress claim unless the supplied context supports one.';
  return `Use only supplied structured facts. Cite permitted evidenceRefs. Missing evidence is uncertainty. ${language} ${progress} Return the required JSON only.`;
}
