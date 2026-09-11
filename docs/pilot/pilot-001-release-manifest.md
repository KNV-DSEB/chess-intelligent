# Pilot 001 release manifest

Status: `PILOT_BLOCKED`

## Immutable source identity

- Task 016 checkpoint: `9986c2730a46a7a41e29a9a262f469fa7f306fe6`
- Pilot release ref: `pilot-001-rc2` (the annotated tag target is the release commit)
- Release version: `pilot-001-rc2`
- Branch: `main`
- Deployment timestamp: `NOT_DEPLOYED`
- Migration boundary: `016_private_academy_pilot.sql`
- Ontology: published `1.0.0`, canonical hash
  `1aa76c4f20f17d9e5ce7d07012e2d66ae15137a97846fc8e166cf1f496df2d8e`; never `latest`
- Classifier: `CONCEPT_CLASSIFIER_BUNDLE_V2` for the Pilot profile
- Training generator: `TACTICAL_TRAINING_ITEM_GENERATOR_V2`
- Skill Graph policy: `SKILL_GRAPH_POLICY_V2`; the exact policy-config hash is pinned by each real
  cohort run and is `NOT_PROVISIONED`
- Grounded brief contracts: context/prompt/artifact V1
- Pilot observation contract: `PILOT_EVENT_V1`
- System coverage: 64 ontology concepts, 13 classifier-observable concepts, 8 trainable tactical
  concepts
- Stockfish: `NOT_VERIFIED_FOR_PILOT_DEPLOYMENT` (Task 015 historical evidence used Stockfish 18)

## Build identity

Production image digests are `NOT_BUILT_FOR_PILOT_ENVIRONMENT`. Record immutable API, Web, Worker,
and migration image digests here after the operator builds the tagged ref. A local source build does
not substitute for image digests.

Local API/Web/Worker build identity: `pnpm build` passed from the rc2 source candidate; recorded at
`2026-09-12T00:05:23+07:00`. This is the Pilot build-record timestamp, not a deployment timestamp.

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

The 2026-09-12 source candidate passed format, lint, typecheck, 227 tests, and the production build.
The real PostgreSQL test remained skipped without an explicit disposable target. Graphify was
refreshed to 3,243 nodes / 6,854 edges and the Pilot instrumentation, grounded-AI composition, and
readiness paths were re-queried. These local results do not satisfy the public deployment, real
provider, email, or separate-restore gates.

The fresh production dependency audit is `NOT_RUN`: the host policy rejected disclosure of the
production dependency manifest to the public npm registry without specific authorization.

The guarded commands require explicit target, acknowledgement, and output variables documented in
the operations guide. Release freeze permits only blocker fixes, security/evidence corrections, and
operator-documentation corrections.
