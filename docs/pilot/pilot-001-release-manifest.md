# Pilot 001 release manifest

Status: `PILOT_BLOCKED`

## Immutable source identity

- Frozen input release: `pilot-001-rc3` resolves to
  `7fc23e5d0c959dbed8cde75007e0dcc1221b3637`; the tag is not moved.
- GHCR publication remediation release: `pilot-001-rc4` resolves to
  `37386cc86266e6ce7fd3dec8e2763c607287e0ac`; the tag is not moved.
- Active Railway API bind remediation release: `pilot-001-rc5`; the exact source commit and image
  digest are captured after the tag-triggered publication workflow completes. Neither rc3 nor rc4
  is moved.
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
- Backend provider/runtime: Railway selected. The rc4 API deployment reached `ACTIVE`, but its
  public endpoint failed to respond because the process bound `127.0.0.1:4000`; rc5 corrects only
  that listener boundary. Worker deployment state is not changed by this remediation.
- `docker-compose.pilot-backend.yml` preserves the digest-pinned Fastify/Worker boundary and
  excludes Web/PostgreSQL.
- Managed PostgreSQL: Pilot and separate restore instances are `OPERATOR_PROVISIONED`; migration,
  connectivity, and restore integrity remain `NOT_RUN` in this evidence window.
- Transactional SMTP: `NOT_PROVISIONED`.
- Public Web/API hostnames: `NOT_PROVISIONED`.

## Image and engine identity

- Previously published rc4 API image:
  `ghcr.io/knv-dseb/chess-intelligent-api@sha256:76bac9de4ae64aae0c9d13b6029f811ac6c792373537add4eb5b33dbc35bd7d7`.
- Previously published rc4 Worker image:
  `ghcr.io/knv-dseb/chess-intelligent-worker@sha256:005f913899b1624724c362cc92ae34bb1c77c5305317c1614e8f9d448463439e`.
- Active rc5 API image: `PENDING_TAG_WORKFLOW`.
- Mechanically republished rc5 Worker image: `PENDING_TAG_WORKFLOW`; no Worker source or runtime
  behavior changes are part of rc5.
- Stockfish build identity: version 18, official source revision
  `cb3d4ee9b47d0c5aae855b12379378ea1439675c`, baseline `linux/amd64`; executable hash and reported
  version remain run provenance and are verified when the deployed Worker executes a job.

The backend profile requires repository plus SHA-256 digest components and cannot silently fall
back to a mutable application image tag. The rc4 tag workflow used the repository-scoped
`GITHUB_TOKEN`; no PAT or registry credential is committed. Release and full-commit-SHA tags resolve
to the same digests above.

GitHub Actions run
[`34699286530`](https://github.com/KNV-DSEB/chess-intelligent/actions/runs/34699286530) completed
successfully. Anonymous GHCR manifest reads returned HTTP 200 for both packages, which verifies that
the packages are visible/pullable and that the immutable digest references exist. OCI config
inspection confirmed `linux/amd64`, the compiled API/Worker commands, and exact source, revision,
and version labels.

## Local source verification

Recorded at `2026-09-12T08:57:02+07:00`:

- `pnpm check`: PASS — 45 files and 231 tests passed; 5 files and
  6 tests remained behind explicit real-runtime prerequisites.
- `pnpm build`: PASS — Next.js, API, Worker, and all workspace package builds completed.
- `git diff --check`: PASS.
- GitHub Actions CI for both `main` and `pilot-001-rc4`: PASS.
- GitHub Actions Docker builds for API and Worker: PASS; both images were pushed to GHCR.
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
