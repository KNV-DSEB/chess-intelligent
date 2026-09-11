# Pilot 001 — private Academy launch plan

## Objective

Freeze the verified Task 016 baseline, add the minimum observable pilot layer, connect one real
Grounded AI provider through the existing validated boundary, and produce an evidence-based launch
decision for one Academy, two Coaches, and six to ten Students over two to three weeks.

This milestone is release work. It does not add speculative learning features and it does not start
Task 017.

## Baseline

- Task 016 checkpoint: `9986c2730a46a7a41e29a9a262f469fa7f306fe6` on `main`.
- Baseline `pnpm check`: 40 files / 207 tests passed; 5 files / 6 opt-in tests skipped.
- Baseline `pnpm build`: passed.
- Baseline `git diff --check`: passed after excluding local agent-skill payloads.
- Task 015 production evidence remains historical qualification evidence, not proof of the future
  pilot deployment.

## Architecture boundary

```text
authenticated User + exact Academy actor
  -> existing capability / Student-self authorization
  -> existing product action and immutable artifact
  -> PilotApplication (scope and resource validation)
  -> PilotRepository (append-only observation or feedback)
```

Pilot events and feedback are operational observations only. They never call classification,
mastery aggregation, training evidence creation, assignment generation, identity mutation, consent
mutation, or security-audit writers.

## Delivery sequence

1. Add migration 016 with append-only `pilot_events`, `coach_review_feedback`, and
   `ai_claim_feedback` tables, exact Academy/User/membership/resource lineage, controlled values,
   idempotency keys, and supporting indexes.
2. Add domain contracts for the event taxonomy, feedback vocabularies, explicit metric
   denominators, and Student operational readiness states.
3. Add one tenant-aware repository/application boundary and attach server-authoritative events to
   AI generation, plan/assignment creation, Skill Graph refresh, training item start/first attempt,
   item completion, assignment completion, and progress review.
4. Add narrowly constrained client-event routes for Coach evidence drill-down/return and Student
   assignment open. Validate the referenced artifact, claim, evidence ref, assignment, and Student
   scope before persistence.
5. Add Coach priority agreement and Coach/Student AI usefulness controls. Persist IDs and controlled
   values only; never names, notes, credentials, PGNs, or raw provider payloads.
6. Add an OpenAI Responses API adapter using strict Structured Outputs, `store: false`, a bounded
   timeout, no tools/retrieval, compact Task 016 context, and the unchanged server validator. Pin
   provider/model by environment and keep disabled-provider behavior intact.
7. Add a lawful synthetic 24-context provider smoke corpus plus a guarded runner that records
   validation, latency, token usage, estimated cost, claims, and rejection classes without private
   pilot data.
8. Add an explicit-target aggregate export for weekly pilot metrics and support-log reconciliation.
9. Add the release manifest, runbooks, readiness checklist, Coach/Student guides, interview scripts,
   weekly review, support log, and change-control templates.
10. Run unit/type/static checks, clean and upgrade real-PostgreSQL migration gates, tenant attacks,
    provider fallback/safety tests, focused responsive browser QA, full `pnpm check`, full build,
    secret scan, Graphify update/path proof, release commit/tag, and push if ordinary authorization
    and credentials permit.

## Provider decision

The production adapter targets OpenAI `gpt-5.6-terra` through `POST /v1/responses`. Official OpenAI
documentation currently identifies it as the intelligence/cost-balanced model, lists multilingual
text and Structured Outputs support, and exposes it through the Responses API. The deployment must
pin the configured model ID and release manifest; a returned provider model ID is retained on every
artifact. A real call is `NOT_RUN` until an operator supplies an authorized API key. Missing AI
configuration leaves all core Academy workflows available.

## Launch decision rules

- `PILOT_READY_TO_START`: every hard gate passed on the actual pilot topology.
- `PILOT_READY_TO_START_WITH_NON_BLOCKING_RISKS`: every hard gate passed; only bounded coverage,
  latency/cost, manual onboarding, cohort-size, browser, or diagnostic-diversity risks remain.
- `PILOT_BLOCKED`: any tenant/ownership/authentication/lineage/release/secret/backup/public-TLS gate
  fails or remains unverified, or mandatory AI is unsafe/unavailable.

Synthetic acceptance evidence must never be reported as human pilot validation. Task 017 will be
defined only after real pilot evidence is reviewed.
