# Grounded brief V1

## Provider contract

The provider receives a fixed system instruction and one GROUNDED_BRIEF_CONTEXT_V1 JSON object.
It returns JSON only. No tool use, web retrieval, chess calculation, or database access is granted.

## Claim contract

Each claim includes a unique ID, controlled type, optional stable concept ID, bounded statement,
confidence, and one or more permitted evidence references. Server validation is authoritative.

Coach wording may emphasize review and assignment actions. Student wording may emphasize the next
practice step. Neither audience may turn uncertainty into a negative label or present AI as chess
authority.

## Operational states

- AI_UNAVAILABLE: no provider configured; core product unaffected.
- AI_PROVIDER_FAILED: provider call failed; no artifact persisted.
- AI_OUTPUT_INVALID: response violated the grounded contract; no artifact persisted.
- success: append-only artifact with exact snapshot lineage.

V1 readiness uses deterministic fake-provider tests. No live provider, credential, or quality
claim is required for the private pilot gate.
