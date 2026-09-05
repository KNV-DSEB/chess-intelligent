import type {
  AcademyRepository,
  PlayerSkillGraphRepository,
  PlayerSkillGraphRunRecord,
  StudentProfileRecord,
  TrainingAssignmentRecord,
} from '@chess-intelligent/db';
import {
  CLASSIFICATION_SELECTION_VERSION,
  CONCEPT_CLASSIFIER_BUNDLE_VERSION,
  SKILL_GRAPH_POLICY_V2_VERSION,
  compareStudentProgress,
  conceptClassifierConfigurationSha256,
  deriveCoachAttentionSignals,
  deriveTrainingAssignmentProgress,
  deterministicSha256,
  normalizeSkillGraphScope,
  projectSkillGraphFreshness,
  skillGraphPolicyConfigSha256,
  skillGraphV2PolicyConfigSha256,
  type ComparableSkillGraphRun,
  type OntologySnapshot,
  type PlayerSkillGraphScopeInput,
  type StudentIntelligenceProfile,
  type SKILL_GRAPH_POLICY_VERSION,
  type TrainingAssignmentProgress,
  type AcademyMembershipRoleV1,
} from '@chess-intelligent/domain';

export const ACADEMY_AUTHORIZATION_STATUS = 'AUTHENTICATED_ACADEMY_RBAC_V1' as const;

export interface AcademyOntologyReader {
  getPublishedVersion(version: string): Promise<OntologySnapshot | null>;
}

export interface AcademyIntelligenceProfileInput {
  ontologyVersion: string;
  skillGraphPolicyVersion: typeof SKILL_GRAPH_POLICY_VERSION | typeof SKILL_GRAPH_POLICY_V2_VERSION;
  scope?: PlayerSkillGraphScopeInput | undefined;
}

export class AcademyApplicationError extends Error {
  constructor(
    readonly code:
      | 'STUDENT_PROFILE_NOT_FOUND'
      | 'SKILL_GRAPH_RUN_NOT_FOUND'
      | 'ONTOLOGY_NOT_FOUND'
      | 'TRAINING_ASSIGNMENT_NOT_FOUND',
    message: string,
  ) {
    super(message);
    this.name = 'AcademyApplicationError';
  }
}

export class AcademyApplicationService {
  constructor(
    private readonly academy: AcademyRepository,
    private readonly skillGraphs: PlayerSkillGraphRepository,
    private readonly ontologies: AcademyOntologyReader,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async createAcademy(name: string) {
    return {
      academy: await this.academy.createAcademy(name),
      authorizationStatus: ACADEMY_AUTHORIZATION_STATUS,
    };
  }

  async createMembership(input: {
    academyId: string;
    role: AcademyMembershipRoleV1;
    displayName: string;
  }) {
    return {
      membership: await this.academy.createMembership(input),
      authorizationStatus: ACADEMY_AUTHORIZATION_STATUS,
    };
  }

  async createStudentProfile(input: {
    academyId: string;
    membershipId: string;
    playerId: string;
    requiresGuardianConsent?: boolean | undefined;
  }) {
    return {
      student: await this.academy.createStudentProfile(input),
      authorizationStatus: ACADEMY_AUTHORIZATION_STATUS,
    };
  }

  async getRoster(input: {
    academyId: string;
    coachMembershipId: string;
    profile: AcademyIntelligenceProfileInput;
    limit: number;
    offset: number;
  }) {
    await this.academy.requireCoachMembership(input.academyId, input.coachMembershipId);
    const profile = await this.profile(input.profile);
    const rows = await this.academy.listRoster({
      academyId: input.academyId,
      profile,
      limit: input.limit,
      offset: input.offset,
    });
    const asOfDate = this.asOfDate();
    return {
      academyId: input.academyId,
      authorizationStatus: ACADEMY_AUTHORIZATION_STATUS,
      profile,
      pagination: {
        limit: input.limit,
        offset: input.offset,
        total: rows[0]?.totalStudents ?? 0,
      },
      students: rows.map((row) => {
        const freshness = projectSkillGraphFreshness({
          hasCompatibleGraph: Boolean(row.skillGraph),
          newTrainingEvidenceCount: row.newTrainingEvidenceCount,
          newGameEvidenceCount: null,
        });
        const activeAssignments = row.activeAssignment
          ? [
              {
                overdue:
                  row.activeAssignment.dueAt !== null && asOfDate > row.activeAssignment.dueAt,
              },
            ]
          : [];
        return {
          student: row.student,
          skillGraph: row.skillGraph,
          freshness: {
            status: freshness,
            newTrainingEvidenceCount: row.newTrainingEvidenceCount,
            newGameEvidenceCount: null,
          },
          activeAssignment: row.activeAssignment,
          lastTrainingAt: row.lastTrainingAt,
          attentionSignals: deriveCoachAttentionSignals({
            freshness,
            activeAssignments,
            latestActiveAssignmentAt: row.activeAssignment?.assignedAt ?? null,
            lastTrainingAt: row.lastTrainingAt,
            completedAssignmentReviewAvailable: row.completedAssignmentReviewAvailable,
            asOfDate,
          }),
        };
      }),
      interpretation: 'OPERATIONAL_ROSTER_NOT_STUDENT_RANKING',
    };
  }

  async getStudentIntelligence(input: {
    academyId: string;
    studentProfileId: string;
    coachMembershipId: string;
    profile: AcademyIntelligenceProfileInput;
    authorizationAlreadyEnforced?: boolean | undefined;
  }) {
    if (!input.authorizationAlreadyEnforced) {
      await this.academy.requireCoachMembership(input.academyId, input.coachMembershipId);
    }
    const student = await this.requireStudent(input.academyId, input.studentProfileId);
    const profile = await this.profile(input.profile);
    const [runId, trainingSummary, assignments, trainingPlans] = await Promise.all([
      this.academy.findLatestCompatibleSkillGraphRunId(student.playerId, profile),
      this.academy.getTrainingSummary(student.playerId),
      this.academy.listStudentAssignments(input.academyId, input.studentProfileId),
      this.academy.listAssignableTrainingPlans(student.playerId),
    ]);
    const graph = runId ? await this.requireGraph(runId) : null;
    const states = graph ? await this.skillGraphs.getConceptStates(graph.id) : [];
    const newTrainingEvidenceCount = graph
      ? await this.academy.countNewTrainingEvidence({
          skillGraphRunId: graph.id,
          playerId: student.playerId,
          ontologyVersion: graph.ontologyVersion,
        })
      : 0;
    const freshness = projectSkillGraphFreshness({
      hasCompatibleGraph: Boolean(graph),
      newTrainingEvidenceCount,
      newGameEvidenceCount: null,
    });
    const assignmentViews = assignments.map((assignment) => this.assignmentView(assignment));
    const active = assignmentViews.filter((assignment) => assignment.progress.status === 'ACTIVE');
    const completedReviewAvailable =
      freshness === 'REFRESH_AVAILABLE' &&
      assignmentViews.some((assignment) => assignment.progress.status === 'COMPLETED');
    return {
      authorizationStatus: ACADEMY_AUTHORIZATION_STATUS,
      profile,
      student,
      player: {
        id: student.playerId,
        displayName: student.playerDisplayName,
        fideId: student.fideId,
      },
      skillGraph: graph
        ? {
            run: graph,
            coverage: {
              ...graph.coverage,
              trainingMeasurementUnits: graph.selectedTrainingItemCount,
              estimatedConcepts: states.filter((state) => state.status === 'ESTIMATED').length,
              insufficientConcepts: states.filter(
                (state) => state.status === 'INSUFFICIENT_EVIDENCE',
              ).length,
              noEvidenceConcepts: states.filter((state) => state.status === 'NO_EVIDENCE').length,
            },
          }
        : null,
      freshness: {
        status: freshness,
        newTrainingEvidenceCount,
        newGameEvidenceCount: null,
        refreshIsExplicit: true,
      },
      trainingSummary,
      trainingPlans,
      assignments: assignmentViews,
      attentionSignals: deriveCoachAttentionSignals({
        freshness,
        activeAssignments: active.map((assignment) => ({
          overdue: assignment.progress.overdue,
        })),
        latestActiveAssignmentAt:
          active
            .map((assignment) => assignment.assignment.assignedAt)
            .sort()
            .at(-1) ?? null,
        lastTrainingAt: trainingSummary.lastTrainingAt,
        completedAssignmentReviewAvailable: completedReviewAvailable,
        asOfDate: this.asOfDate(),
      }),
      recentLearningActivity: {
        lastTrainingAt: trainingSummary.lastTrainingAt,
        attemptCount: trainingSummary.attemptCount,
        independentTrainingItemCount: trainingSummary.distinctScoredItems,
      },
      interpretation: 'READS_EXISTING_SKILL_GRAPH_AND_TRAINING_EVIDENCE_NO_MASTERY_RECALCULATION',
    };
  }

  async compareProgress(input: {
    academyId: string;
    studentProfileId: string;
    coachMembershipId: string;
    fromSkillGraphRunId: string;
    toSkillGraphRunId: string;
  }) {
    await this.academy.requireCoachMembership(input.academyId, input.coachMembershipId);
    const student = await this.requireStudent(input.academyId, input.studentProfileId);
    const [fromRun, toRun] = await Promise.all([
      this.requireGraph(input.fromSkillGraphRunId),
      this.requireGraph(input.toSkillGraphRunId),
    ]);
    const belongsToStudent =
      fromRun.playerId === student.playerId && toRun.playerId === student.playerId;
    const [fromStates, toStates] = belongsToStudent
      ? await Promise.all([
          this.skillGraphs.getConceptStates(fromRun.id),
          this.skillGraphs.getConceptStates(toRun.id),
        ])
      : [[], []];
    const result = compareStudentProgress(
      this.comparisonRun(fromRun, fromStates),
      this.comparisonRun(toRun, toStates),
    );
    if (!belongsToStudent && !result.comparabilityReasons.includes('DIFFERENT_PLAYER')) {
      result.comparisonStatus = 'NOT_COMPARABLE';
      result.comparabilityReasons = ['DIFFERENT_PLAYER'];
      result.coverageDelta = null;
      result.conceptTransitions = [];
    }
    return {
      student: { id: student.id, playerId: student.playerId },
      ...result,
      interpretation:
        'NEUTRAL_ESTIMATE_EVIDENCE_AND_STATE_CHANGE_NOT_AUTOMATIC_IMPROVEMENT_OR_REGRESSION',
    };
  }

  async createAssignment(input: {
    academyId: string;
    studentProfileId: string;
    coachMembershipId: string;
    trainingPlanRunId: string;
    baselineSkillGraphRunId: string;
    trainingItemIds: readonly string[];
    dueAt?: string | null | undefined;
    note?: string | null | undefined;
  }) {
    const assignment = await this.academy.createTrainingAssignment(input);
    return {
      authorizationStatus: ACADEMY_AUTHORIZATION_STATUS,
      ...this.assignmentView(assignment),
      evidenceCreatedByAssignment: 0,
      noteEvidenceCreated: 0,
    };
  }

  async getStudentAssignments(input: {
    academyId: string;
    studentProfileId: string;
    coachMembershipId: string;
    authorizationAlreadyEnforced?: boolean | undefined;
  }) {
    if (!input.authorizationAlreadyEnforced) {
      await this.academy.requireCoachMembership(input.academyId, input.coachMembershipId);
    }
    await this.requireStudent(input.academyId, input.studentProfileId);
    const assignments = await this.academy.listStudentAssignments(
      input.academyId,
      input.studentProfileId,
    );
    return {
      authorizationStatus: ACADEMY_AUTHORIZATION_STATUS,
      assignments: assignments.map((assignment) => this.assignmentView(assignment)),
    };
  }

  async getAssignment(input: {
    academyId: string;
    assignmentId: string;
    coachMembershipId: string;
  }) {
    await this.academy.requireCoachMembership(input.academyId, input.coachMembershipId);
    const assignment = await this.academy.getTrainingAssignment(
      input.academyId,
      input.assignmentId,
    );
    if (!assignment) {
      throw new AcademyApplicationError(
        'TRAINING_ASSIGNMENT_NOT_FOUND',
        'The assignment does not belong to the requested Academy.',
      );
    }
    return {
      authorizationStatus: ACADEMY_AUTHORIZATION_STATUS,
      ...this.assignmentView(assignment),
    };
  }

  async cancelAssignment(input: {
    academyId: string;
    assignmentId: string;
    coachMembershipId: string;
  }) {
    const assignment = await this.academy.cancelTrainingAssignment(input);
    return {
      authorizationStatus: ACADEMY_AUTHORIZATION_STATUS,
      ...this.assignmentView(assignment),
    };
  }

  private assignmentView(assignment: TrainingAssignmentRecord): {
    assignment: TrainingAssignmentRecord;
    progress: TrainingAssignmentProgress;
    itemLinks: Array<{ trainingItemId: string; href: string }>;
  } {
    const progress = deriveTrainingAssignmentProgress({
      playerId: assignment.playerId,
      assignedAt: assignment.assignedAt,
      dueAt: assignment.dueAt,
      cancelledAt: assignment.cancelledAt,
      asOfDate: this.asOfDate(),
      items: assignment.items.map((item) => ({
        assignmentItemId: item.id,
        trainingItemId: item.trainingItemId,
        measurementStatus: item.measurementStatus,
        attempts: item.firstPostAssignmentAttempt
          ? [
              {
                id: item.firstPostAssignmentAttempt.id,
                trainingItemId: item.trainingItemId,
                playerId: assignment.playerId,
                submittedAt: item.firstPostAssignmentAttempt.submittedAt,
                result: item.firstPostAssignmentAttempt.result,
                attemptNumber: item.firstPostAssignmentAttempt.attemptNumber,
              },
            ]
          : [],
      })),
    });
    return {
      assignment,
      progress,
      itemLinks:
        progress.status === 'CANCELLED'
          ? []
          : assignment.items.map((item) => ({
              trainingItemId: item.trainingItemId,
              href: `/training?item=${item.trainingItemId}`,
            })),
    };
  }

  private comparisonRun(
    run: PlayerSkillGraphRunRecord,
    states: Awaited<ReturnType<PlayerSkillGraphRepository['getConceptStates']>>,
  ): ComparableSkillGraphRun {
    return {
      id: run.id,
      playerId: run.playerId,
      ontologyVersion: run.ontologyVersion,
      classifierBundleVersion: run.classifierBundleVersion,
      classifierConfigSha256: run.classifierConfigSha256,
      classificationSelectionPolicyVersion: run.classificationSelectionPolicyVersion,
      skillGraphPolicyVersion: run.skillGraphPolicyVersion,
      policyConfigSha256: run.policyConfigSha256,
      evidenceScopeSha256: deterministicSha256(run.evidenceScope),
      evidenceSnapshotSha256: run.evidenceSnapshotSha256,
      asOfDate: run.asOfDate,
      coverage: {
        canonicalGames: run.coverage.canonicalGames,
        decisionOccurrences: run.coverage.decisionOccurrences,
        classifiedDecisions: run.coverage.classifiedDecisions,
        engineBackedDecisions: run.coverage.engineBackedDecisions,
        masteryEligibleEvidence: run.coverage.masteryEligibleEvidence,
        trainingIndependentUnits: run.selectedTrainingItemCount,
      },
      concepts: states.map((state) => ({
        conceptStableId: state.conceptStableId,
        status: state.status,
        posteriorMean: state.posteriorMean,
        effectiveEvidenceMass: state.effectiveEvidenceMass,
        positiveEvidenceMass: state.positiveEvidenceMass,
        negativeEvidenceMass: state.negativeEvidenceMass,
        independentEvidenceUnitCount: state.independentEvidenceUnitCount,
        evidenceConfidence: state.evidenceConfidence,
        masteryBand: state.masteryBand,
      })),
    };
  }

  private async profile(
    input: AcademyIntelligenceProfileInput,
  ): Promise<StudentIntelligenceProfile> {
    const ontology = await this.ontologies.getPublishedVersion(input.ontologyVersion);
    if (!ontology) {
      throw new AcademyApplicationError(
        'ONTOLOGY_NOT_FOUND',
        `Published ontology ${input.ontologyVersion} does not exist.`,
      );
    }
    const classifierConfigSha256 = conceptClassifierConfigurationSha256();
    const identity = {
      ontologyVersion: ontology.version,
      classifierBundleVersion: CONCEPT_CLASSIFIER_BUNDLE_VERSION,
      classifierConfigSha256,
      classificationSelectionPolicyVersion: CLASSIFICATION_SELECTION_VERSION,
    };
    const evidenceScope = normalizeSkillGraphScope(input.scope);
    return {
      ...identity,
      skillGraphPolicyVersion: input.skillGraphPolicyVersion,
      policyConfigSha256:
        input.skillGraphPolicyVersion === SKILL_GRAPH_POLICY_V2_VERSION
          ? skillGraphV2PolicyConfigSha256(identity)
          : skillGraphPolicyConfigSha256(identity),
      evidenceScope,
      evidenceScopeSha256: deterministicSha256(evidenceScope),
    };
  }

  private async requireStudent(
    academyId: string,
    studentProfileId: string,
  ): Promise<StudentProfileRecord> {
    const student = await this.academy.getStudentProfile(academyId, studentProfileId);
    if (!student) {
      throw new AcademyApplicationError(
        'STUDENT_PROFILE_NOT_FOUND',
        'The StudentProfile does not belong to the requested Academy.',
      );
    }
    return student;
  }

  private async requireGraph(runId: string): Promise<PlayerSkillGraphRunRecord> {
    const run = await this.skillGraphs.getRun(runId);
    if (!run) {
      throw new AcademyApplicationError(
        'SKILL_GRAPH_RUN_NOT_FOUND',
        `Successful Skill Graph run ${runId} does not exist.`,
      );
    }
    return run;
  }

  private asOfDate(): string {
    return this.now().toISOString().slice(0, 10);
  }
}
