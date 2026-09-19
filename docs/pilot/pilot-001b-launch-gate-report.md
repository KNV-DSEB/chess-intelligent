# Pilot 001B launch gate report

Evidence window: 2026-09-17 (Asia/Bangkok).

## Pilot launch result

`PILOT_BLOCKED`

## Active release candidate

- Git SHA: `6e2617ea210562b3b2144549efe078a1b5b1dc2b`.
- RC tag: `pilot-001-rc5`; `pilot-001-rc3` and `pilot-001-rc4` are not moved.
- Vercel Web RC: `pilot-001-rc6`; its immutable tag target is the exact deployment identity and no
  prior tag is moved. Backend behavior remains the rc5 behavior in this Web-only remediation.
- Vercel standalone-output RC: `pilot-001-rc7`; rc6 is not moved. This remediation changes only
  Web build output selection.
- Product UX V2 source RC: `pilot-001-rc8`; rc7 is not moved. Local 1440×900, 1024×768, and
  390×844 browser acceptance passes against deterministic acceptance data; no deployed rc8 browser
  evidence is claimed.
- Public product entry source RC: `pilot-001-rc9`; rc8 is not moved. Local API integration,
  production build, and responsive landing/signup browser QA pass. The exact deployed rc9 signup,
  Academy creation, invitation, cookie, and four-role matrix remain `NOT_RUN`.
- Final tag: not created.
- Vercel deployment identity: `NOT_RUN`.
- API image:
  `ghcr.io/knv-dseb/chess-intelligent-api@sha256:22ee3485b956d99b9a2ce08c6a94716079b6932543bdad8158d9f1827d6168bc`.
- Worker image:
  `ghcr.io/knv-dseb/chess-intelligent-worker@sha256:82ebb25489fa8eb8c01a4c7d3fdcf134d43735c2c901e766a83936643621eb9e`;
  it was republished only because the existing immutable release workflow publishes both images,
  with no Worker source or runtime change.

## Deployment topology

- Vercel Web: source configuration PASS; deployment `NOT_RUN`.
- Backend provider/runtime: Railway selected. The API deployment is `ACTIVE`, but the rc4 public
  request returned `Application failed to respond`; rc5 is not deployed by this task.
- API hostname: provisioned by Railway but not recorded in repository evidence.
- Managed PostgreSQL: Pilot and separate restore instances `OPERATOR_PROVISIONED`; verification
  `NOT_RUN`.
- SMTP provider: `NOT_PROVISIONED`.
- Stockfish deployment: `NOT_RUN`.
- AI mode: `AI_DISABLED_FOR_PILOT`.

## Vercel Web

- Rc6 build: Next.js 16.3.1 compilation, TypeScript, page data, static generation, and page
  optimization PASS. Vercel then failed its `onBuildComplete` standalone tracing step with missing
  `.next/next-server.js.nft.json`; this is not a framework-detection or application-compile failure.
- Deployment: `BLOCKED` at the Vercel build-complete adapter; no successful Web deployment is
  claimed.
- Project settings: Root Directory `apps/web`; Framework Preset `Next.js`; Build Command
  `pnpm run build:vercel`; Install Command `corepack enable && pnpm install --frozen-lockfile`;
  Output Directory `.next`; include source files outside the Root Directory enabled.
- Hostname: `NOT_PROVISIONED`.
- Git identity: build guard requires `PILOT_RELEASE_SHA === VERCEL_GIT_COMMIT_SHA`.
- Environment: the browser client uses only `/backend`; Vercel rewrites it to the approved Railway
  API. The guard rejects direct API origins, requires the exact release SHA, and rejects
  secret-like `NEXT_PUBLIC_` names.
- Browser result: `NOT_RUN`.

## Backend runtime

- API: the deployed rc4 process reported `Server listening at http://127.0.0.1:4000`, so Railway
  could not route public traffic to it. Rc5 binds `0.0.0.0` and prefers Railway's `PORT`, falling
  back to the existing configured API port for local operation.
- Worker: long-lived compiled artifact preserved with the pinned Stockfish 18 runtime; deployment
  `NOT_RUN`.
- Health: source/test behavior PASS; deployed `/livez` and `/readyz` remain `NOT_RUN` because rc5
  is not deployed automatically.
- Image identity: tag-only GHCR publication PASS. The rc5 and full-commit-SHA tags resolve to the
  same immutable digest for each image; no `latest` tag is used.
- Publication evidence: GitHub Actions run
  [`35215919935`](https://github.com/KNV-DSEB/chess-intelligent/actions/runs/35215919935)
  completed successfully; anonymous manifest reads confirmed both packages are public and the
  digest references exist.
- Runtime host: Railway selected; this remediation publishes rc5 but does not change the Railway
  deployment automatically.

## PostgreSQL

- Provider/version: Railway PostgreSQL instances provisioned by the operator; connection/version
  verification `NOT_RUN`.
- Migrations 001–017: local deterministic tests PASS; real PostgreSQL `NOT_RUN`.
- Ontology publication: real verifier now publishes and verifies `1.0.0`, canonical hash, and 64
  definitions; real target `NOT_RUN`.
- Connection behavior: bounded pool/source regression PASS; managed runtime `NOT_RUN`.

## Backup / restore

- Backup: `NOT_RUN`.
- Separate restore: `NOT_RUN`.
- Integrity: manifest coverage now includes exact-history, classification, training item, Grounded
  AI, Pilot event, and feedback identities.
- Duration: unavailable.

## Public HTTPS

- Web TLS: `NOT_RUN`.
- API TLS: `NOT_RUN`.
- Cookie: source policy PASS; deployed observation `NOT_RUN`.
- Origin/CSRF/CORS: exact configured origin retained; deployed browser `NOT_RUN`.
- Mixed content: `NOT_RUN`.

## Web ↔ API session behavior

Signup, Academy creation, invitation acceptance, login, reload, `/auth/me`, logout, and exact-Origin
behavior are all `NOT_RUN` on the deployed RC9. Local same-origin `/backend` and integration evidence
is not reused as public Pilot evidence.

## Transactional SMTP

- Provider: `NOT_PROVISIONED`.
- Invitation: `NOT_RUN`.
- Password reset: `NOT_RUN`.
- Failure behavior: source and prior acceptance regression PASS; real provider `NOT_RUN`.

## Stockfish / Worker

- Real deployed AnalysisJob: `NOT_RUN`.
- Stockfish image boundary: version 18 compiled for baseline Linux x86-64 from official source
  revision `cb3d4ee9b47d0c5aae855b12379378ea1439675c`; Worker image publication PASS.
- Stockfish executable hash/reported version: recorded by the Worker on the first deployed run;
  `NOT_RUN`.
- Exact-history provenance: source and Task 015 historical acceptance PASS; new deployment
  `NOT_RUN`.
- Worker status: not deployed.

## AI mode

`AI_DISABLED_FOR_PILOT`

## Real AI smoke

Not applicable. No real provider credential is configured, no provider request was sent, and fake
provider output will not be shown to human Pilot users. Core structured intelligence, evidence,
training, and assignments remain available.

## AI safety

Source regression preserves server validation and the rule that invalid or provider-failed output
persists nothing. No AI artifact is enabled in the Pilot profile.

## AI privacy

No provider payload was sent. The disabled configuration sends no Academy, Student, email, guardian,
session, credential, audit, or learning context to an AI provider.

## Operational owners

- Release: `UNASSIGNED`.
- Security: `UNASSIGNED`.
- Support: `UNASSIGNED`.
- Backup: `UNASSIGNED`.
- AI review: not applicable while AI is disabled.

## Pilot Academy

`NOT_PROVISIONED`.

## Coach cohort

0 of required 2 Coaches provisioned.

## Student cohort

0 of required 6–10 Students provisioned:

- READY: 0.
- READY_WITH_LOW_COVERAGE: 0.
- NOT_READY_NO_GAMES: 0.
- NOT_READY_NO_ANALYSIS: 0.
- NOT_READY_NO_SKILL_GRAPH: 0.

These are zero cohort records, not readiness classifications of real Students.

## Four-role browser matrix

- OWNER: `NOT_RUN`.
- ADMIN: `NOT_RUN`.
- COACH: `NOT_RUN`.
- STUDENT: `NOT_RUN`.

Independent cookie contexts remain mandatory.

## Security regression

- Tenant isolation: source integration PASS; deployed `NOT_RUN`.
- Student ownership: source integration PASS; deployed `NOT_RUN`.
- Operational-role impersonation: source integration PASS; deployed `NOT_RUN`.
- Consent: source integration PASS; deployed `NOT_RUN`.
- Session behavior: source integration PASS; deployed `NOT_RUN`.

## Pilot events

Append-only schema, client/server authority, deduplication, and source tests PASS. Actual deployed
event acceptance is `NOT_RUN`.

## Coach agreement feedback

Append-only exact-lineage source behavior PASS. Deployed UI/persistence behavior is `NOT_RUN`.

## AI usefulness feedback

Not applicable because AI is disabled.

## Full deployed dry run

`NOT_RUN`. No claim is made for Coach → evidence → feedback → TrainingPlan → Assignment → Student
Attempt → TrainingEvidence → Skill Graph refresh → Coach progress → metric export on the public
topology.

## Evidence lineage

Source and Task 015 historical acceptance preserve exact lineage. The backup/restore manifest now
covers every UUID-bearing table in the required deployed learning chain. Deployed Pilot lineage is
`NOT_RUN`.

## Pilot metric export

Implementation/regression PASS. Preflight export is `NOT_RUN` because no Pilot Academy/date window
exists; no data is described as real Pilot usage.

## Responsive smoke

- Desktop 1440×900: Vercel deployment `NOT_RUN`.
- Mobile 390×844: Vercel deployment `NOT_RUN`.
- Tablet 1024×768: `NOT_RUN`.

## Secret audit

Local release-eligible source PASS: no real deployment credential was loaded or added. Public Vercel
environment and backend runtime-log inspection remain `NOT_RUN`.

## Backup / incident readiness

Runbooks and guarded tooling exist. Launch readiness is `NOT_RUN` until owners are assigned and one
actual backup is restored into a separate empty managed PostgreSQL database with integrity equality.

## Runtime defects discovered

1. Real PostgreSQL verification still expected only migrations 001–015 and would reject the current
   001–016 schema.
2. Backup/restore manifest omitted exact-history, classification, TrainingItem, Grounded AI, Pilot
   event, and feedback tables required by the Pilot lineage gate.
3. The repository had only the Task 015 single-host Web/API topology; it had no Vercel release-SHA
   guard or backend-only digest-pinned profile.
4. The backend had no GHCR publication workflow, and the Worker image depended on a host bind mount
   that cannot provide a self-contained Railway runtime.
5. The production API bootstrap passed the default `API_HOST=127.0.0.1` and `API_PORT=4000`
   directly to Fastify, ignoring Railway's `PORT` environment variable.
6. The Vercel project was rooted at `./`, so framework detection inspected the repository-root
   package, where Next.js intentionally is not a dependency, instead of `apps/web/package.json`.
7. After the monorepo root correction, rc6 compiled successfully but `output: 'standalone'`
   caused the Next.js 16.3.1/Vercel adapter to request absent
   `.next/next-server.js.nft.json` during `onBuildComplete`.

## Remediations applied

1. PostgreSQL verification now applies migration 017, publishes/verifies ontology `1.0.0` by
   canonical hash and 64-concept count, and checks the expanded Pilot table set.
2. Backup/restore manifests now retain stable ID counts/hashes across the full Pilot lineage.
3. `vercel.json`, a deterministic Web build guard, and a Web-free/DB-free backend Compose profile
   were added without changing Fastify, Worker, Stockfish, authentication, or database architecture.
4. A tag-only GHCR workflow now builds the existing compiled API/Worker artifacts from the exact
   triggering commit with a repository-scoped `GITHUB_TOKEN`. The Worker image compiles pinned
   Stockfish 18, retains it as a separate UCI process, and carries its GPL license and corresponding
   source archive.
5. The API listener now binds `0.0.0.0`, uses `Number(process.env.PORT ?? API_PORT)`, and rejects an
   invalid platform port before listening. Focused tests cover fallback, Railway override, and
   invalid values; database, auth, CORS, session, Worker, and Stockfish behavior are unchanged.
6. The Vercel project boundary now lives at `apps/web`; an app-local wrapper invokes the canonical
   repository release guard, `.next` is relative to that app root, and Vercel's supported
   outside-root source inclusion keeps the pnpm workspace and `packages/ui` available.
7. Rc7 uses Vercel's standard `VERCEL` indicator to omit standalone output only on Vercel.
   Non-Vercel builds retain standalone output for the existing Web container; no generated trace
   file is fabricated and the release guard remains unchanged.

## Readiness checklist

- PASS: 7.
- FAIL: 0.
- NOT_APPLICABLE: 1.
- NOT_RUN: 26.

All remaining `NOT_RUN` gates are visible in `pilot-001-readiness-checklist.md`.

## Remaining blockers

- Apply the recorded Vercel app-root settings, deploy the exact `pilot-001-rc9` commit, and verify
  the same-origin `/backend` proxy on the stable production Web hostname.
- Replacement of the current Railway `pilot-api` rc4 image with the immutable rc5 API digest,
  plus deployed API health verification; Worker deployment verification remains separate.
- Verified connectivity/migrations on the provisioned Pilot PostgreSQL plus a separate restore into
  the provisioned restore PostgreSQL.
- Real transactional SMTP and designated inboxes.
- Successful deployed Worker job proving the embedded Stockfish 18 version/hash and exact-history
  persistence.
- Release, security, support, and backup owners.
- Pilot Academy/cohort provisioning and every deployed browser/learning/backup gate.

## Remaining non-blocking risks

- Tactical-heavy learning coverage and conservative false negatives.
- Manual onboarding and a small cohort.
- Chrome-centered browser coverage.
- Production dependency audit remains `NOT_RUN` without specific external-disclosure
  authorization.

## Human pilot protocol

After every hard gate passes: 1 Academy, 2 Coaches, 6–10 Students, 2–3 weeks. Do not make causal
learning-effectiveness claims.

## Project Context

`PROJECT_CONTEXT.md`, the release manifest, readiness checklist, operations runbook, database
runbook, change log, AI mode record, and durable `AGENTS.md` invariants were updated.

## Next step

For the Web blocker, the next operator action is setting `PILOT_RELEASE_SHA` to the immutable
`pilot-001-rc7` tag target and creating a new Vercel Production deployment from that exact SHA
without changing the recorded project settings. Railway, DNS, SMTP, database verification/restore,
owners, and the deployed gates remain separate later actions.

DO NOT START TASK 017.
