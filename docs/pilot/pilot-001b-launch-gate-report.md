# Pilot 001B launch gate report

Evidence window: 2026-09-12 (Asia/Bangkok).

## Pilot launch result

`PILOT_BLOCKED`

## Deployed release

- Git SHA: frozen input `7fc23e5d0c959dbed8cde75007e0dcc1221b3637`; GHCR remediation SHA is
  the target of `pilot-001-rc4`.
- RC tag: `pilot-001-rc4` after source verification; `pilot-001-rc3` is not moved.
- Final tag: not created.
- Vercel deployment identity: `NOT_RUN`.
- API image: `ghcr.io/knv-dseb/chess-intelligent-api:pilot-001-rc4`; digest
  `PENDING_TAG_WORKFLOW`.
- Worker image: `ghcr.io/knv-dseb/chess-intelligent-worker:pilot-001-rc4`; digest
  `PENDING_TAG_WORKFLOW`.

## Deployment topology

- Vercel Web: source configuration PASS; deployment `NOT_RUN`.
- Backend provider/runtime: Railway selected; long-lived API/Worker services `NOT_DEPLOYED`.
- API hostname: `NOT_PROVISIONED`.
- Managed PostgreSQL: Pilot and separate restore instances `OPERATOR_PROVISIONED`; verification
  `NOT_RUN`.
- SMTP provider: `NOT_PROVISIONED`.
- Stockfish deployment: `NOT_RUN`.
- AI mode: `AI_DISABLED_FOR_PILOT`.

## Vercel Web

- Build: local Next.js production build PASS.
- Deployment: `NOT_RUN`; no project link, CLI/auth, or provider environment exists.
- Hostname: `NOT_PROVISIONED`.
- Git identity: build guard requires `PILOT_RELEASE_SHA === VERCEL_GIT_COMMIT_SHA`.
- Environment: guard accepts only an HTTPS credential-free API origin and rejects secret-like
  `NEXT_PUBLIC_` names.
- Browser result: `NOT_RUN`.

## Backend runtime

- API: compiled artifact and source/static topology PASS; deployment `NOT_RUN`.
- Worker: long-lived compiled artifact preserved with the pinned Stockfish 18 runtime; deployment
  `NOT_RUN`.
- Health: source/test behavior PASS; deployed `/livez` and `/readyz` `NOT_RUN`.
- Image identity: tag-only GHCR publication workflow implemented; actual digests
  `PENDING_TAG_WORKFLOW`.
- Runtime host: Railway selected; services not created/deployed by this task.

## PostgreSQL

- Provider/version: Railway PostgreSQL instances provisioned by the operator; connection/version
  verification `NOT_RUN`.
- Migrations 001–016: local deterministic tests PASS; real PostgreSQL `NOT_RUN`.
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

Login, reload, `/auth/me`, logout, and cross-origin credential behavior are all `NOT_RUN` on
Vercel because no same-site Web/API hostnames exist. Task 015 local/internal-TLS evidence is not
reused as public Pilot evidence.

## Transactional SMTP

- Provider: `NOT_PROVISIONED`.
- Invitation: `NOT_RUN`.
- Password reset: `NOT_RUN`.
- Failure behavior: source and prior acceptance regression PASS; real provider `NOT_RUN`.

## Stockfish / Worker

- Real deployed AnalysisJob: `NOT_RUN`.
- Stockfish image boundary: version 18 compiled for baseline Linux x86-64 from official source
  revision `cb3d4ee9b47d0c5aae855b12379378ea1439675c`; image publication
  `PENDING_TAG_WORKFLOW`.
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

## Remediations applied

1. PostgreSQL verification now applies migration 016, publishes/verifies ontology `1.0.0` by
   canonical hash and 64-concept count, and checks the expanded Pilot table set.
2. Backup/restore manifests now retain stable ID counts/hashes across the full Pilot lineage.
3. `vercel.json`, a deterministic Web build guard, and a Web-free/DB-free backend Compose profile
   were added without changing Fastify, Worker, Stockfish, authentication, or database architecture.
4. A tag-only GHCR workflow now builds the existing compiled API/Worker artifacts from the exact
   triggering commit with a repository-scoped `GITHUB_TOKEN`. The Worker image compiles pinned
   Stockfish 18, retains it as a separate UCI process, and carries its GPL license and corresponding
   source archive.

## Readiness checklist

- PASS: 7.
- FAIL: 0.
- NOT_APPLICABLE: 1.
- NOT_RUN: 26.

All remaining `NOT_RUN` gates are visible in `pilot-001-readiness-checklist.md`.

## Remaining blockers

- Vercel project/auth and stable same-site Web hostname.
- Successful GHCR publication with immutable API/Worker digests, then Railway API/Worker deployment
  and a public API hostname.
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

After rc4 GHCR publication succeeds, the next operator action is Railway deployment using the exact
API and Worker digest references. Vercel, DNS, SMTP, database verification/restore, owners, and the
deployed gates remain separate later actions.

DO NOT START TASK 017.
