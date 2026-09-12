# Pilot 001 grounded AI provider smoke

Status: `NOT_APPLICABLE_AI_DISABLED_FOR_PILOT`

## Boundary under test

The production adapter uses the OpenAI Responses API with strict JSON Schema output, `store: false`,
no tools, a bounded output budget, a timeout, sanitized HTTP errors, and server validation through
`validateGroundedBriefOutput`. Only validated output may be persisted.

Configured model default: `gpt-5.6-terra`. The provider-reported model identifier is retained in each
artifact; operators must record the exact returned identifier in the smoke artifact.

## Synthetic suite

`pnpm pilot:ai-smoke` generates 24 synthetic, non-PII Coach/Student snapshots by default. The
12-scenario matrix repeats deterministically and covers high/moderate/insufficient/no evidence,
single/multiple concepts, trainable/no-action contexts, present/absent TrainingPlans, recent
compatible/no-comparable progress evidence, both audiences, and English/Vietnamese response
instructions. It accepts 20–50 cases and reports:

- generation success, provider failure, validation rejection, and retry counts;
- p50/p95 latency;
- input/output tokens and estimated micro-USD cost;
- validated claim count;
- per-case scenario, audience, language, outcome, and validated output for human quality review.

Schema validity is not a Vietnamese-quality verdict. Every successful Vietnamese output and the
Coach/Student audience distinction remain `HUMAN_REVIEW_REQUIRED` in the generated report.

Required variables: `PILOT_AI_SMOKE_CONFIRM=YES`, `PILOT_AI_SMOKE_OUTPUT`, and
`GROUNDED_AI_API_KEY`. Provider/model/timeout/pricing variables use the production names.

## Launch acceptance

- no private pilot data is sent during smoke;
- zero foreign evidence references may persist;
- prohibited psychology, weakness, certainty, or move-authority text is rejected;
- the platform continues normally when the provider is disabled or fails;
- the review owner signs off on latency and cost from the generated JSON.

No live result is claimed in this document. A dated smoke JSON from the selected release and real
provider is a hard launch prerequisite only when AI is enabled.

On 2026-09-12, `GROUNDED_AI_API_KEY` and provider selection were absent on the release host. Pilot
001B therefore explicitly selected `AI_DISABLED_FOR_PILOT`: no billable request was attempted, no
synthetic result artifact was created, and no deterministic fake provider may be used with human
Pilot users. The structured intelligence/training/assignment workflow remains the launch path.
