# Pilot 001 release manifest

Status: `PILOT_BLOCKED`

## Immutable source identity

- Task 016 checkpoint: `9986c2730a46a7a41e29a9a262f469fa7f306fe6`
- Pilot release ref: `pilot-001-rc1` (the annotated tag target is the release commit)
- Release version: `pilot-001-rc1`
- Branch: `main`
- Deployment timestamp: `NOT_DEPLOYED`
- Migration boundary: `016_private_academy_pilot.sql`
- Ontology: explicit published version selected by the Academy profile; never `latest`
- Classifier: `CONCEPT_CLASSIFIER_BUNDLE_V2` for the Pilot profile
- Skill Graph policy: `SKILL_GRAPH_POLICY_V2`
- Grounded brief contracts: context/prompt/artifact V1
- Pilot observation contract: `PILOT_EVENT_V1`

## Build identity

Production image digests are `NOT_BUILT_FOR_PILOT_ENVIRONMENT`. Record immutable API, Web, Worker,
and migration image digests here after the operator builds the tagged ref. A local source build does
not substitute for image digests.

## Configuration boundary

- `APP_ENV=production`
- `INTERNAL_DEV_ROUTES=false`
- `AUTO_MIGRATE=false`
- exact HTTPS `ALLOWED_ORIGINS` and `PUBLIC_WEB_BASE_URL`
- production SMTP with TLS and credentials; Mailpit is not accepted
- `GROUNDED_AI_PROVIDER=OPENAI` only after the synthetic smoke passes; otherwise `DISABLED`
- model, timeout, and price inputs are explicit environment values
- no secret value belongs in this manifest

## Verification commands

```text
pnpm check
pnpm build
pnpm verify:production
pnpm pilot:ai-smoke
pnpm pilot:metrics
pnpm db:backup
pnpm db:restore:verify
```

The 2026-09-11 source candidate passed format, lint, typecheck, 223 tests, and the production build.
The real PostgreSQL test remained skipped without an explicit disposable target. Graphify was
refreshed to 3,237 nodes / 6,835 edges and the Pilot instrumentation, grounded-AI composition, and
readiness paths were re-queried. These local results do not satisfy the public deployment, real
provider, email, or separate-restore gates.

The fresh production dependency audit is `NOT_RUN`: the host policy rejected disclosure of the
production dependency manifest to the public npm registry without specific authorization.

The guarded commands require explicit target, acknowledgement, and output variables documented in
the operations guide. Release freeze permits only blocker fixes, security/evidence corrections, and
operator-documentation corrections.
