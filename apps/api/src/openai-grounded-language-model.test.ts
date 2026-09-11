import { describe, expect, it, vi } from 'vitest';

import {
  GROUNDED_BRIEF_CONTEXT_VERSION,
  type GroundedBriefContext,
} from '@chess-intelligent/domain';

import { OpenAiGroundedLanguageModel } from './openai-grounded-language-model';

const context: GroundedBriefContext = {
  contextVersion: GROUNDED_BRIEF_CONTEXT_VERSION,
  audience: 'COACH' as const,
  academyId: 'academy-1',
  studentProfileId: 'student-1',
  player: { id: 'player-1' },
  source: {
    skillGraphRunId: 'graph-1',
    trainingPlanRunId: null,
    ontologyVersion: '1.0.0',
    classifierBundleVersion: 'CONCEPT_CLASSIFIER_BUNDLE_V2',
    skillGraphPolicyVersion: 'SKILL_GRAPH_POLICY_V2',
    asOfDate: '2026-09-11',
  },
  coverage: {
    reportVersion: 'CONCEPT_COVERAGE_REPORT_V1',
    classifierSupported: 13,
    trainable: 8,
    decisionOccurrences: 10,
    classifiedDecisions: 8,
    engineBackedDecisions: 8,
    masteryEligibleEvidence: 4,
  },
  concepts: [],
  permittedEvidenceRefs: [{ ref: 'skill-graph:graph-1', kind: 'SKILL_GRAPH_RUN' as const }],
};

describe('OpenAiGroundedLanguageModel', () => {
  it('uses a non-stored strict structured Responses request and records token cost', async () => {
    let requestInit: RequestInit | undefined;
    const request = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      requestInit = init;
      return new Response(
        JSON.stringify({
          model: 'gpt-5.6-terra-2026-08-01',
          output: [
            {
              type: 'message',
              content: [
                {
                  type: 'output_text',
                  text: JSON.stringify({
                    headline: 'Bounded brief',
                    summary: 'Evidence is limited.',
                    claims: [],
                    limitations: ['No concepts met the evidence boundary.'],
                  }),
                },
              ],
            },
          ],
          usage: { input_tokens: 100, output_tokens: 20, total_tokens: 120 },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    });
    const provider = new OpenAiGroundedLanguageModel({
      apiKey: 'test-only',
      baseUrl: 'https://api.openai.com/v1/',
      model: 'gpt-5.6-terra',
      timeoutMs: 5_000,
      inputUsdPerMillion: 2,
      outputUsdPerMillion: 12,
      fetch: request as typeof fetch,
    });
    const result = await provider.generate({
      promptVersion: 'GROUNDED_BRIEF_PROMPT_V1',
      systemPrompt: 'Use only the supplied evidence.',
      context,
    });
    const body = JSON.parse(String(requestInit?.body)) as Record<string, unknown>;
    expect(body).toMatchObject({ model: 'gpt-5.6-terra', store: false });
    expect(body).not.toHaveProperty('tools');
    expect(body.text).toMatchObject({ format: { type: 'json_schema', strict: true } });
    expect(requestInit?.headers).toMatchObject({ authorization: 'Bearer test-only' });
    expect(result).toMatchObject({
      provider: 'OPENAI_RESPONSES',
      model: 'gpt-5.6-terra-2026-08-01',
      usage: { inputTokens: 100, outputTokens: 20, totalTokens: 120, estimatedCostMicros: 440 },
    });
  });

  it('returns a sanitized provider failure without exposing the response body', async () => {
    const provider = new OpenAiGroundedLanguageModel({
      apiKey: 'secret-never-in-error',
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-5.6-terra',
      timeoutMs: 5_000,
      inputUsdPerMillion: 2,
      outputUsdPerMillion: 12,
      fetch: vi.fn(
        async () => new Response('private provider body', { status: 429 }),
      ) as typeof fetch,
    });
    await expect(
      provider.generate({
        promptVersion: 'GROUNDED_BRIEF_PROMPT_V1',
        systemPrompt: 'bounded',
        context,
      }),
    ).rejects.toThrow('HTTP 429');
  });
});
