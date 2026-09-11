import type { GroundedBriefContext } from '@chess-intelligent/domain';

import type { GroundedLanguageModel, GroundedLanguageModelResult } from './grounded-ai-application';

const GROUNDED_BRIEF_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['headline', 'summary', 'claims', 'limitations'],
  properties: {
    headline: { type: 'string', minLength: 1, maxLength: 160 },
    summary: { type: 'string', minLength: 1, maxLength: 800 },
    claims: {
      type: 'array',
      maxItems: 12,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'type', 'conceptStableId', 'statement', 'confidence', 'evidenceRefs'],
        properties: {
          id: { type: 'string', minLength: 1, maxLength: 100 },
          type: {
            type: 'string',
            enum: ['CURRENT_PRIORITY', 'EVIDENCE_LIMITATION', 'RECENT_CHANGE', 'NEXT_ACTION'],
          },
          conceptStableId: { type: ['string', 'null'] },
          statement: { type: 'string', minLength: 1, maxLength: 500 },
          confidence: {
            type: 'string',
            enum: ['INSUFFICIENT', 'LOW', 'MODERATE', 'HIGH'],
          },
          evidenceRefs: {
            type: 'array',
            minItems: 1,
            items: { type: 'string', minLength: 1, maxLength: 300 },
          },
        },
      },
    },
    limitations: {
      type: 'array',
      maxItems: 8,
      items: { type: 'string', minLength: 1, maxLength: 500 },
    },
  },
} as const;

interface OpenAiResponse {
  model?: string;
  output?: Array<{
    type?: string;
    content?: Array<{ type?: string; text?: string }>;
  }>;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    total_tokens?: number;
    input_tokens_details?: { cached_tokens?: number };
  };
}

export interface OpenAiGroundedLanguageModelOptions {
  apiKey: string;
  baseUrl: string;
  model: string;
  timeoutMs: number;
  inputUsdPerMillion: number;
  outputUsdPerMillion: number;
  fetch?: typeof fetch;
}

function outputText(response: OpenAiResponse): string {
  for (const item of response.output ?? []) {
    if (item.type !== 'message') continue;
    for (const content of item.content ?? []) {
      if (content.type === 'output_text' && content.text) return content.text;
    }
  }
  throw new Error('The provider response did not contain structured output text.');
}

function compactContext(context: GroundedBriefContext): string {
  return `Produce one grounded academy brief for this exact immutable context:\n${JSON.stringify(context)}`;
}

export class OpenAiGroundedLanguageModel implements GroundedLanguageModel {
  private readonly request: typeof fetch;

  constructor(private readonly options: OpenAiGroundedLanguageModelOptions) {
    this.request = options.fetch ?? fetch;
  }

  async generate(
    input: Parameters<GroundedLanguageModel['generate']>[0],
  ): Promise<GroundedLanguageModelResult> {
    const response = await this.request(`${this.options.baseUrl.replace(/\/$/u, '')}/responses`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${this.options.apiKey}`,
        'content-type': 'application/json',
      },
      signal: AbortSignal.timeout(this.options.timeoutMs),
      body: JSON.stringify({
        model: this.options.model,
        instructions: input.systemPrompt,
        input: compactContext(input.context),
        max_output_tokens: 2_000,
        store: false,
        text: {
          format: {
            type: 'json_schema',
            name: 'grounded_brief_artifact_v1',
            strict: true,
            schema: GROUNDED_BRIEF_JSON_SCHEMA,
          },
        },
      }),
    });
    if (!response.ok) {
      throw new Error(`OpenAI Responses request failed with HTTP ${response.status}.`);
    }
    const body = (await response.json()) as OpenAiResponse;
    const inputTokens = body.usage?.input_tokens ?? 0;
    const outputTokens = body.usage?.output_tokens ?? 0;
    return {
      provider: 'OPENAI_RESPONSES',
      model: body.model ?? this.options.model,
      output: JSON.parse(outputText(body)) as unknown,
      usage: {
        inputTokens,
        cachedInputTokens: body.usage?.input_tokens_details?.cached_tokens ?? 0,
        outputTokens,
        totalTokens: body.usage?.total_tokens ?? inputTokens + outputTokens,
        estimatedCostMicros: Math.round(
          inputTokens * this.options.inputUsdPerMillion +
            outputTokens * this.options.outputUsdPerMillion,
        ),
      },
    };
  }
}
