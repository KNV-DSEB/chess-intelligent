import { PgDatabase } from '@chess-intelligent/db';
import type { GroundedBriefClaim, GroundedBriefContext } from '@chess-intelligent/domain';

import { buildApp } from '../../apps/api/src/app';
import type {
  GroundedLanguageModel,
  GroundedLanguageModelResult,
} from '../../apps/api/src/grounded-ai-application';

const connectionString = process.env.DATABASE_URL;
const host = process.env.API_HOST ?? '127.0.0.1';
const port = Number(process.env.API_PORT ?? 4000);

if (!connectionString) throw new Error('DATABASE_URL is required.');
if (process.env.TASK016_FAKE_AI_CONFIRM !== 'YES') {
  throw new Error('TASK016_FAKE_AI_CONFIRM=YES is required for the acceptance-only provider.');
}

function permittedRef(context: GroundedBriefContext, kind: string): string {
  const reference = context.permittedEvidenceRefs.find((entry) => entry.kind === kind);
  if (!reference) throw new Error(`The acceptance snapshot has no ${kind} reference.`);
  return reference.ref;
}

const groundedLanguageModel: GroundedLanguageModel = {
  async generate({ context }): Promise<GroundedLanguageModelResult> {
    const concept =
      context.concepts.find((candidate) => candidate.evidenceRefs.length > 0) ??
      context.concepts[0];
    const graphRef = permittedRef(context, 'SKILL_GRAPH_RUN');
    const coverageRef = permittedRef(context, 'COVERAGE_REPORT');
    const conceptRef = concept?.evidenceRefs[0] ?? graphRef;
    const claims: GroundedBriefClaim[] = [
      {
        id: 'coverage-boundary',
        type: 'EVIDENCE_LIMITATION',
        conceptStableId: null,
        statement: `This snapshot classifies ${context.coverage.classifiedDecisions} of ${context.coverage.decisionOccurrences} observed decisions; missing evidence remains unknown.`,
        confidence: 'INSUFFICIENT',
        evidenceRefs: [coverageRef],
      },
    ];
    if (concept) {
      claims.unshift({
        id: 'current-priority',
        type: 'CURRENT_PRIORITY',
        conceptStableId: concept.stableId,
        statement: `${concept.displayName} is the clearest current study target in this bounded snapshot, supported by ${concept.directEvidenceCount} direct evidence occurrence(s).`,
        confidence: concept.evidenceConfidence,
        evidenceRefs: [conceptRef],
      });
      claims.push({
        id: 'next-action',
        type: 'NEXT_ACTION',
        conceptStableId: concept.stableId,
        statement:
          'Inspect the cited game decision, then complete the linked diagnostic practice before reviewing a refreshed Skill Graph.',
        confidence: concept.evidenceConfidence,
        evidenceRefs: [conceptRef, graphRef],
      });
    }
    return {
      provider: 'TASK016_ACCEPTANCE_FAKE',
      model: 'deterministic-grounded-fixture-v1',
      output: {
        headline: 'Evidence-led practice brief',
        summary:
          context.audience === 'COACH'
            ? 'Use the cited decision evidence to choose one bounded review and one follow-up practice action.'
            : 'Start with the cited position, complete the assigned practice, and treat missing evidence as unknown.',
        claims,
        limitations: [
          'This is an acceptance-only deterministic provider.',
          'The brief explains the pinned snapshot and does not create chess or mastery evidence.',
        ],
      },
      usage: { inputTokens: 0, outputTokens: 0 },
    };
  },
};

const database = new PgDatabase(connectionString, {
  applicationName: 'task016-browser-acceptance',
});
const app = await buildApp({
  database,
  logger: true,
  manageDatabaseLifecycle: true,
  webOrigins: [process.env.WEB_ORIGIN ?? 'http://127.0.0.1:3000'],
  secureCookies: false,
  internalDevRoutes: false,
  groundedLanguageModel,
});

await app.listen({ host, port });
