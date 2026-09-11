import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, extname } from 'node:path';

import { OpenAiGroundedLanguageModel } from '../../apps/api/src/openai-grounded-language-model';
import {
  GROUNDED_BRIEF_CONTEXT_VERSION,
  GROUNDED_BRIEF_PROMPT_VERSION,
  validateGroundedBriefOutput,
  type GroundedBriefContext,
} from '@chess-intelligent/domain';

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function percentile(values: number[], quantile: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * quantile) - 1)]!;
}

function syntheticContext(index: number): GroundedBriefContext {
  const lowCoverage = index % 3 === 0;
  const stableId = index % 2 === 0 ? 'tactics.fork' : 'tactics.pin';
  const evidenceRef = `concept-evidence:synthetic-${index}`;
  return {
    contextVersion: GROUNDED_BRIEF_CONTEXT_VERSION,
    audience: index % 2 === 0 ? 'COACH' : 'STUDENT',
    academyId: '00000000-0000-4000-8000-000000000001',
    studentProfileId: `00000000-0000-4000-8000-${String(index + 100).padStart(12, '0')}`,
    player: { id: `00000000-0000-4000-8000-${String(index + 200).padStart(12, '0')}` },
    source: {
      skillGraphRunId: `00000000-0000-4000-8000-${String(index + 300).padStart(12, '0')}`,
      trainingPlanRunId: null,
      ontologyVersion: '1.1.0',
      classifierBundleVersion: 'CONCEPT_CLASSIFIER_BUNDLE_V2',
      skillGraphPolicyVersion: 'SKILL_GRAPH_POLICY_V2',
      asOfDate: '2026-09-11',
    },
    coverage: {
      reportVersion: 'CONCEPT_COVERAGE_REPORT_V1',
      classifierSupported: 13,
      trainable: 8,
      decisionOccurrences: 8 + index,
      classifiedDecisions: lowCoverage ? 1 : 6 + index,
      engineBackedDecisions: lowCoverage ? 1 : 5 + index,
      masteryEligibleEvidence: lowCoverage ? 0 : 3 + (index % 5),
    },
    concepts: [
      {
        stableId,
        displayName: stableId === 'tactics.fork' ? 'Fork' : 'Pin',
        supportState: lowCoverage ? 'INSUFFICIENT_EVIDENCE' : 'ESTIMATED',
        masteryBand: lowCoverage ? null : 'DEVELOPING',
        evidenceConfidence: lowCoverage ? 'LOW' : 'MODERATE',
        posteriorMean: lowCoverage ? null : 0.45 + (index % 5) / 20,
        directEvidenceCount: lowCoverage ? 1 : 4 + (index % 4),
        effectiveEvidenceMass: lowCoverage ? 0.4 : 2.5 + (index % 3),
        evidenceRefs: [evidenceRef],
        trainingSupported: true,
      },
    ],
    permittedEvidenceRefs: [
      { ref: evidenceRef, kind: 'CONCEPT_EVIDENCE' },
      {
        ref: `skill-graph:00000000-0000-4000-8000-${String(index + 300).padStart(12, '0')}`,
        kind: 'SKILL_GRAPH_RUN',
      },
    ],
  };
}

if (process.env.PILOT_AI_SMOKE_CONFIRM !== 'YES') {
  throw new Error(
    'Set PILOT_AI_SMOKE_CONFIRM=YES only after approving a real-provider synthetic smoke run and its cost.',
  );
}
const outputPath = required('PILOT_AI_SMOKE_OUTPUT');
if (extname(outputPath).toLowerCase() !== '.json') {
  throw new Error('PILOT_AI_SMOKE_OUTPUT must be an explicit .json path.');
}
const caseCount = Number(process.env.PILOT_AI_SMOKE_CASES ?? '24');
if (!Number.isInteger(caseCount) || caseCount < 20 || caseCount > 50) {
  throw new Error('PILOT_AI_SMOKE_CASES must be an integer from 20 through 50.');
}
const model = process.env.GROUNDED_AI_MODEL ?? 'gpt-5.6-terra';
const provider = new OpenAiGroundedLanguageModel({
  apiKey: required('GROUNDED_AI_API_KEY'),
  baseUrl: process.env.GROUNDED_AI_BASE_URL ?? 'https://api.openai.com/v1',
  model,
  timeoutMs: Number(process.env.GROUNDED_AI_TIMEOUT_MS ?? '30000'),
  inputUsdPerMillion: Number(process.env.GROUNDED_AI_INPUT_USD_PER_MILLION ?? '2'),
  outputUsdPerMillion: Number(process.env.GROUNDED_AI_OUTPUT_USD_PER_MILLION ?? '12'),
});
const results: Array<{
  caseId: string;
  audience: 'COACH' | 'STUDENT';
  outcome: 'SUCCESS' | 'PROVIDER_FAILED' | 'VALIDATION_REJECTED';
  latencyMs: number;
  claimCount: number;
  inputTokens: number;
  outputTokens: number;
  estimatedCostMicros: number;
}> = [];

for (let index = 0; index < caseCount; index += 1) {
  const context = syntheticContext(index);
  const started = performance.now();
  try {
    const response = await provider.generate({
      promptVersion: GROUNDED_BRIEF_PROMPT_VERSION,
      systemPrompt:
        'Use only the supplied structured facts. Cite permitted evidenceRefs. Missing evidence is uncertainty. Return the required JSON only.',
      context,
    });
    try {
      const validated = validateGroundedBriefOutput(context, response.output);
      results.push({
        caseId: `synthetic-${index + 1}`,
        audience: context.audience,
        outcome: 'SUCCESS',
        latencyMs: Math.round(performance.now() - started),
        claimCount: validated.claims.length,
        inputTokens: response.usage?.inputTokens ?? 0,
        outputTokens: response.usage?.outputTokens ?? 0,
        estimatedCostMicros: response.usage?.estimatedCostMicros ?? 0,
      });
    } catch {
      results.push({
        caseId: `synthetic-${index + 1}`,
        audience: context.audience,
        outcome: 'VALIDATION_REJECTED',
        latencyMs: Math.round(performance.now() - started),
        claimCount: 0,
        inputTokens: response.usage?.inputTokens ?? 0,
        outputTokens: response.usage?.outputTokens ?? 0,
        estimatedCostMicros: response.usage?.estimatedCostMicros ?? 0,
      });
    }
  } catch {
    results.push({
      caseId: `synthetic-${index + 1}`,
      audience: context.audience,
      outcome: 'PROVIDER_FAILED',
      latencyMs: Math.round(performance.now() - started),
      claimCount: 0,
      inputTokens: 0,
      outputTokens: 0,
      estimatedCostMicros: 0,
    });
  }
}

const successful = results.filter((result) => result.outcome === 'SUCCESS');
const report = {
  version: 'PILOT_GROUNDED_AI_SMOKE_V1',
  syntheticOnly: true,
  provider: 'OPENAI_RESPONSES',
  configuredModel: model,
  generatedAt: new Date().toISOString(),
  caseCount,
  metrics: {
    success: successful.length,
    providerFailures: results.filter((result) => result.outcome === 'PROVIDER_FAILED').length,
    validationRejections: results.filter((result) => result.outcome === 'VALIDATION_REJECTED')
      .length,
    retries: 0,
    p50LatencyMs: percentile(
      results.map((result) => result.latencyMs),
      0.5,
    ),
    p95LatencyMs: percentile(
      results.map((result) => result.latencyMs),
      0.95,
    ),
    inputTokens: results.reduce((sum, result) => sum + result.inputTokens, 0),
    outputTokens: results.reduce((sum, result) => sum + result.outputTokens, 0),
    estimatedCostMicros: results.reduce((sum, result) => sum + result.estimatedCostMicros, 0),
    claims: results.reduce((sum, result) => sum + result.claimCount, 0),
  },
  results,
};
await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
process.stdout.write(
  `${JSON.stringify({ status: 'PILOT_AI_SMOKE_COMPLETE', outputPath, ...report.metrics })}\n`,
);
