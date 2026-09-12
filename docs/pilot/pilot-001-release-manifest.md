# Pilot 001 release manifest

Status: `PILOT_BLOCKED`

## Immutable source identity

- Frozen input release: `pilot-001-rc2` resolves to
  `5c110007764075eff0725122b860f4555f180a73`; the tag was not moved.
- Pilot 001B remediation release: `pilot-001-rc3` (the annotated tag target is the final
  remediation commit).
- Branch: `main`.
- Deployment timestamp: `NOT_DEPLOYED`.
- Migration boundary: `016_private_academy_pilot.sql`.
- Ontology: published `1.0.0`, canonical hash
  `1aa76c4f20f17d9e5ce7d07012e2d66ae15137a97846fc8e166cf1f496df2d8e`; never `latest`.
- Classifier: `CONCEPT_CLASSIFIER_BUNDLE_V2` for the Pilot profile.
- Training generator: `TACTICAL_TRAINING_ITEM_GENERATOR_V2`.
- Skill Graph policy: `SKILL_GRAPH_POLICY_V2`; each real cohort run must pin its exact policy
  configuration hash.
- Grounded brief contracts: context/prompt/artifact V1.
- Pilot observation contract: `PILOT_EVENT_V1`.
- System coverage: 64 ontology concepts, 13 classifier-observable concepts, 8 trainable tactical
  concepts.
- AI mode: `AI_DISABLED_FOR_PILOT`.

## Deployment topology

- Vercel Web: `NOT_DEPLOYED`; `vercel.json` builds only `apps/web` and rejects a missing/drifted
  release SHA or non-HTTPS API origin.
- Backend provider/runtime: `NOT_PROVISIONED`; `docker-compose.pilot-backend.yml` preserves
  long-lived Fastify/Worker/Stockfish and excludes Web/PostgreSQL.
- Managed PostgreSQL: `NOT_PROVISIONED`.
- Transactional SMTP: `NOT_PROVISIONED`.
- Public Web/API hostnames: `NOT_PROVISIONED`.

## Image and engine identity

- API image digest: `NOT_BUILT`.
- Worker image digest: `NOT_BUILT`.
- Stockfish version/hash/architecture: `NOT_VERIFIED_FOR_PILOT_DEPLOYMENT`.

The backend profile requires repository plus SHA-256 digest components and cannot silently fall
back to a mutable application image tag. The Docker Engine was unavailable on the release host, and
no registry/container-host credential existed, so no image or deployment identity is claimed.

## Local source verification

Recorded at `2026-09-12T08:57:02+07:00`:

- `pnpm check -- --maxWorkers=4 --reporter=dot`: PASS — 45 files and 230 tests passed; 5 files and
  6 tests remained behind explicit real-runtime prerequisites.
- `pnpm build`: PASS — Next.js, API, Worker, and all workspace package builds completed.
- backend-only Compose interpolation: PASS with the committed placeholder template; this is static
  configuration evidence.
- Vercel release/API-origin guard: PASS with a synthetic HTTPS origin and the local source SHA.
- real PostgreSQL, deployment, browser, SMTP, Stockfish, and restore gates: `NOT_RUN` because no
  explicit targets/credentials were available.

The production PostgreSQL verifier now applies migrations 001–016, publishes and verifies ontology
`1.0.0`/64 concepts against its canonical hash, and requires every Pilot lineage table. The
backup/restore manifest now covers exact-history state, classification, training items, Grounded AI
artifacts, Pilot events, and both feedback tables.

## Configuration boundary

- Vercel: `NEXT_PUBLIC_API_URL` is the only required public value; `PILOT_RELEASE_SHA` and
  `VERCEL_GIT_COMMIT_SHA` must match.
- Backend: `APP_ENV=production`, `INTERNAL_DEV_ROUTES=false`, `AUTO_MIGRATE=false`, exact
  `WEB_PUBLIC_ORIGIN`, Secure cookie mode, real SMTP, external encrypted PostgreSQL, and
  digest-pinned API/Worker images.
- Vercel Preview origins are never implicitly trusted by production API.
- No secret value belongs in this manifest.

The fresh production dependency audit remains `NOT_RUN`: disclosure of the private production
dependency manifest to the public npm registry was not specifically authorized.
