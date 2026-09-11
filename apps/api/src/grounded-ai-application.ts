import type {
  AcademyRepository,
  GroundedAiArtifactRecord,
  GroundedAiRepository,
  TrainingRepository,
} from '@chess-intelligent/db';
import {
  GROUNDED_BRIEF_ARTIFACT_VERSION,
  GROUNDED_BRIEF_CONTEXT_VERSION,
  GROUNDED_BRIEF_PROMPT_VERSION,
  groundedBriefContextSha256,
  validateGroundedBriefOutput,
  type GroundedBriefAudience,
  type GroundedBriefContext,
} from '@chess-intelligent/domain';

import type { ConceptCoverageApplicationService } from './concept-coverage-application';
import type { PlayerSkillGraphApplicationService } from './player-skill-graph-application';

export const GROUNDED_BRIEF_SYSTEM_PROMPT = `
You write a short academy chess learning brief from one structured JSON snapshot.
Use only the supplied concepts, states, counts, and evidence references.
Every claim must cite one or more permitted evidenceRefs.
Never infer psychology, weakness, strength, chess truth, legal moves, engine truth, or a best move.
Missing or insufficient evidence is uncertainty, never negative performance evidence.
Return only GROUNDED_BRIEF_ARTIFACT_V1 JSON with headline, summary, claims, and limitations.
`.trim();

export interface GroundedLanguageModelResult {
  provider: string;
  model: string;
  output: unknown;
  usage?: Record<string, number> | undefined;
}

export interface GroundedLanguageModel {
  generate(input: {
    promptVersion: typeof GROUNDED_BRIEF_PROMPT_VERSION;
    systemPrompt: string;
    context: GroundedBriefContext;
  }): Promise<GroundedLanguageModelResult>;
}

export type GroundedAiApplicationErrorCode =
  | 'AI_UNAVAILABLE'
  | 'AI_PROVIDER_FAILED'
  | 'AI_OUTPUT_INVALID'
  | 'STUDENT_PROFILE_NOT_FOUND'
  | 'SKILL_GRAPH_CONTEXT_MISMATCH'
  | 'TRAINING_PLAN_CONTEXT_MISMATCH'
  | 'AI_ARTIFACT_NOT_FOUND';

export class GroundedAiApplicationError extends Error {
  constructor(
    readonly code: GroundedAiApplicationErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'GroundedAiApplicationError';
  }
}

export class GroundedAiApplicationService {
  constructor(
    private readonly artifacts: GroundedAiRepository,
    private readonly academies: AcademyRepository,
    private readonly skillGraphs: PlayerSkillGraphApplicationService,
    private readonly training: TrainingRepository,
    private readonly coverage: ConceptCoverageApplicationService,
    private readonly provider: GroundedLanguageModel | null,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async generate(input: {
    academyId: string;
    studentProfileId: string;
    skillGraphRunId: string;
    trainingPlanRunId?: string | null | undefined;
    audience: GroundedBriefAudience;
  }): Promise<GroundedAiArtifactRecord> {
    if (!this.provider) {
      throw new GroundedAiApplicationError(
        'AI_UNAVAILABLE',
        'Grounded AI briefing is not configured. The learning platform remains available.',
      );
    }
    const student = await this.academies.getStudentProfile(input.academyId, input.studentProfileId);
    if (!student) {
      throw new GroundedAiApplicationError(
        'STUDENT_PROFILE_NOT_FOUND',
        'The StudentProfile does not belong to the requested Academy.',
      );
    }
    const graph = await this.skillGraphs.getRun(input.skillGraphRunId);
    if (graph.run.playerId !== student.playerId) {
      throw new GroundedAiApplicationError(
        'SKILL_GRAPH_CONTEXT_MISMATCH',
        'The Skill Graph does not belong to the Academy Student Player.',
      );
    }
    const plan = input.trainingPlanRunId
      ? await this.training.getPlan(input.trainingPlanRunId)
      : null;
    if (
      input.trainingPlanRunId &&
      (!plan ||
        plan.playerId !== student.playerId ||
        plan.skillGraphRunId !== graph.run.id ||
        plan.ontologyVersion !== graph.run.ontologyVersion)
    ) {
      throw new GroundedAiApplicationError(
        'TRAINING_PLAN_CONTEXT_MISMATCH',
        'The TrainingPlan is not pinned to the requested Student Skill Graph.',
      );
    }
    const report = await this.coverage.getReport(graph.run.ontologyVersion);
    const reportById = new Map(report.entries.map((entry) => [entry.stableId, entry]));
    const ranked = graph.concepts
      .filter((concept) => reportById.get(concept.conceptStableId)?.trainingSupported)
      .sort(
        (left, right) =>
          Number(left.status === 'NO_EVIDENCE') - Number(right.status === 'NO_EVIDENCE') ||
          Number(left.status === 'INSUFFICIENT_EVIDENCE') -
            Number(right.status === 'INSUFFICIENT_EVIDENCE') ||
          (left.posteriorMean ?? 1) - (right.posteriorMean ?? 1) ||
          left.conceptStableId.localeCompare(right.conceptStableId),
      )
      .slice(0, 6);
    const details = await Promise.all(
      ranked.map((concept) => this.skillGraphs.getConcept(graph.run.id, concept.conceptStableId)),
    );
    const graphRef = `skill-graph:${graph.run.id}`;
    const coverageRef = `coverage:${report.version}`;
    const planRef = plan ? `training-plan:${plan.id}` : null;
    const permitted = new Map<
      string,
      GroundedBriefContext['permittedEvidenceRefs'][number]['kind']
    >([
      [graphRef, 'SKILL_GRAPH_RUN'],
      [coverageRef, 'COVERAGE_REPORT'],
      ...(planRef ? ([[planRef, 'TRAINING_PLAN']] as const) : []),
    ]);
    const concepts = details.map((detail) => {
      const exactRefs = [
        ...detail.contributions.flatMap((entry) =>
          entry.evidence.map(
            (evidence) => `concept-evidence:${evidence.conceptEvidenceInstanceId}`,
          ),
        ),
        ...detail.trainingContributions.map(
          (entry) => `training-evidence:${entry.trainingEvidenceInstanceId}`,
        ),
      ];
      for (const ref of exactRefs) {
        permitted.set(ref, ref.startsWith('training-') ? 'TRAINING_EVIDENCE' : 'CONCEPT_EVIDENCE');
      }
      const coverageEntry = reportById.get(detail.state.conceptStableId);
      return {
        stableId: detail.state.conceptStableId,
        displayName: detail.state.displayName,
        supportState:
          coverageEntry?.classifierBundleVersion === null
            ? ('SYSTEM_UNSUPPORTED' as const)
            : detail.state.status,
        masteryBand: detail.state.masteryBand,
        evidenceConfidence: detail.state.evidenceConfidence,
        posteriorMean: detail.state.displayPosteriorMean,
        directEvidenceCount: detail.state.rawPositiveCount + detail.state.rawNegativeCount,
        effectiveEvidenceMass: detail.state.effectiveEvidenceMass,
        evidenceRefs: exactRefs.length > 0 ? exactRefs : [graphRef, coverageRef],
        trainingSupported: coverageEntry?.trainingSupported ?? false,
      };
    });
    const context: GroundedBriefContext = {
      contextVersion: GROUNDED_BRIEF_CONTEXT_VERSION,
      audience: input.audience,
      academyId: input.academyId,
      studentProfileId: student.id,
      player: { id: student.playerId },
      source: {
        skillGraphRunId: graph.run.id,
        trainingPlanRunId: plan?.id ?? null,
        ontologyVersion: graph.run.ontologyVersion,
        classifierBundleVersion: graph.run.classifierBundleVersion,
        skillGraphPolicyVersion: graph.run.skillGraphPolicyVersion,
        asOfDate: graph.run.asOfDate,
      },
      coverage: {
        reportVersion: report.version,
        classifierSupported: report.counts.classifierSupported,
        trainable: report.counts.trainable,
        decisionOccurrences: graph.coverage.decisionOccurrences,
        classifiedDecisions: graph.coverage.classifiedDecisions,
        engineBackedDecisions: graph.coverage.engineBackedDecisions,
        masteryEligibleEvidence: graph.coverage.masteryEligibleEvidence,
      },
      concepts,
      permittedEvidenceRefs: [...permitted.entries()]
        .map(([ref, kind]) => ({ ref, kind }))
        .sort((left, right) => left.ref.localeCompare(right.ref)),
    };
    const started = this.now().valueOf();
    let response: GroundedLanguageModelResult;
    try {
      response = await this.provider.generate({
        promptVersion: GROUNDED_BRIEF_PROMPT_VERSION,
        systemPrompt: GROUNDED_BRIEF_SYSTEM_PROMPT,
        context,
      });
    } catch (error) {
      throw new GroundedAiApplicationError(
        'AI_PROVIDER_FAILED',
        'The AI provider failed. No artifact was persisted.',
        { cause: error },
      );
    }
    let output;
    try {
      output = validateGroundedBriefOutput(context, response.output);
    } catch (error) {
      throw new GroundedAiApplicationError(
        'AI_OUTPUT_INVALID',
        'The AI output failed grounding validation. No artifact was persisted.',
        { cause: error },
      );
    }
    return this.artifacts.create({
      academyId: input.academyId,
      studentProfileId: student.id,
      playerId: student.playerId,
      ontologyVersion: graph.run.ontologyVersion,
      audience: input.audience,
      sourceSkillGraphRunId: graph.run.id,
      sourceTrainingPlanRunId: plan?.id ?? null,
      contextVersion: GROUNDED_BRIEF_CONTEXT_VERSION,
      promptVersion: GROUNDED_BRIEF_PROMPT_VERSION,
      artifactVersion: GROUNDED_BRIEF_ARTIFACT_VERSION,
      provider: response.provider,
      model: response.model,
      inputSnapshotSha256: groundedBriefContextSha256(context),
      inputSnapshot: context,
      validatedOutput: output,
      usage: response.usage ?? {},
      latencyMs: Math.max(0, this.now().valueOf() - started),
    });
  }

  async get(
    academyId: string,
    studentProfileId: string,
    artifactId: string,
  ): Promise<GroundedAiArtifactRecord> {
    const artifact = await this.artifacts.getForAcademy(academyId, studentProfileId, artifactId);
    if (!artifact) {
      throw new GroundedAiApplicationError(
        'AI_ARTIFACT_NOT_FOUND',
        'No grounded AI artifact exists in this Academy Student scope.',
      );
    }
    return artifact;
  }
}
