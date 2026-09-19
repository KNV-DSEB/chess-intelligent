# Pilot 001 readiness checklist

Overall result: `PILOT_BLOCKED`

Evidence window: 2026-09-12 (Asia/Bangkok).

## Gate matrix

| Gate                                              | Status         | Evidence / smallest next action                                                                                                                   |
| ------------------------------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| rc2 identity preserved                            | PASS           | Local tag target and remote tag object match; `pilot-001-rc2` still resolves to `5c110007764075eff0725122b860f4555f180a73`.                       |
| Pilot 001D source remediation                     | PASS           | Public entry, same-origin `/backend`, account-only signup, Owner onboarding, invitation role pinning, and migration 017 have regression coverage. |
| Repository check                                  | PASS           | 45 test files and 230 tests passed; 5 files/6 tests remain explicit real-runtime skips.                                                           |
| Production build                                  | PASS           | All workspace packages, Next.js, API, and Worker built successfully.                                                                              |
| Vercel build boundary                             | PASS           | Local guard requires the same-origin `/backend` browser boundary and equal expected/deployed full Git SHAs.                                       |
| Vercel production deployment                      | NOT_RUN        | No Vercel project link, CLI/auth, production URL, or environment configuration is available.                                                      |
| Immutable Vercel deployment identity              | NOT_RUN        | Requires deployment ID, timestamp, URL, and observed Git SHA from the actual production deployment.                                               |
| API/Worker image digests                          | NOT_RUN        | Docker Engine is stopped and no registry access exists.                                                                                           |
| Backend container host                            | NOT_RUN        | No provider/runtime or host credential has been selected.                                                                                         |
| Managed PostgreSQL                                | NOT_RUN        | No explicit Pilot, clean-rehearsal, or restore PostgreSQL URL exists.                                                                             |
| Migrations 001–017 on real PostgreSQL             | NOT_RUN        | Source gate is corrected; production conclusions still require the designated real server.                                                        |
| Ontology 1.0.0 / 64 publication                   | NOT_RUN        | Verifier now checks version/hash/count, but no real target was available.                                                                         |
| Backup and separate restore                       | NOT_RUN        | No Pilot database, separate empty restore database, or PostgreSQL client tools are available.                                                     |
| Trusted public Web/API HTTPS                      | NOT_RUN        | No DNS hostname or public certificate was provisioned.                                                                                            |
| Web ↔ API cookie/Origin/CORS/CSRF                 | NOT_RUN        | Source/static controls pass; actual Vercel `/backend` proxy, host-only cookie, and exact-Origin behavior still require deployed browser proof.    |
| Transactional invitation/reset email              | NOT_RUN        | No SMTP provider/configuration or designated inbox exists.                                                                                        |
| Tagged-deployment Stockfish job                   | NOT_RUN        | No backend deployment or compatible operator binary exists.                                                                                       |
| AI mode                                           | NOT_APPLICABLE | Explicit decision: `AI_DISABLED_FOR_PILOT`; no fake provider will be used with humans.                                                            |
| AI-disabled product fallback                      | PASS           | Existing regression coverage preserves structured intelligence, evidence, training, and assignments.                                              |
| Pilot Academy provisioned                         | NOT_RUN        | No deployed database/Owner bootstrap target exists.                                                                                               |
| Operational owners                                | NOT_RUN        | Release, security, support, and backup humans/channels are not assigned.                                                                          |
| Two Coach accounts                                | NOT_RUN        | Cohort has not been provisioned.                                                                                                                  |
| Six–ten Student accounts                          | NOT_RUN        | Cohort has not been provisioned.                                                                                                                  |
| StudentProfile → Player and consent review        | NOT_RUN        | Real cohort does not exist.                                                                                                                       |
| Student data readiness                            | NOT_RUN        | No cohort game/analysis/classification/Skill Graph runs exist.                                                                                    |
| Four-role deployed browser matrix                 | NOT_RUN        | Task 015 local internal-TLS evidence is historical, not evidence for this tagged public topology.                                                 |
| Tenant/ownership/impersonation/consent regression | NOT_RUN        | Source integration tests pass; actual deployed boundary remains required.                                                                         |
| Pilot events and feedback                         | NOT_RUN        | Source tests pass; deployed acceptance has not run.                                                                                               |
| Full deployed Coach/Student loop                  | NOT_RUN        | Requires provisioned tagged infrastructure and independent sessions.                                                                              |
| Pilot metric preflight export                     | NOT_RUN        | Export implementation passes tests; no designated Pilot Academy/date window exists.                                                               |
| Desktop/mobile browser smoke                      | NOT_RUN        | No Vercel production deployment exists.                                                                                                           |
| Secret audit                                      | PASS           | No real credential was loaded; release-eligible source uses placeholders only. Deployment env/log audit remains part of the deployed gate.        |
| Production dependency audit                       | NOT_RUN        | Public registry manifest disclosure was not specifically authorized.                                                                              |
| Incident/backup readiness                         | NOT_RUN        | Runbooks exist; real owners, storage, backup, restore, and measured recovery remain absent.                                                       |

## Hard launch blockers

- [ ] deploy the exact replacement RC to the production Vercel hostname and verify the same-origin
      `/backend` proxy plus host-only session cookie in a real browser;
- [ ] provide a registry and long-lived Linux backend runtime, build/push API and Worker images, and
      record immutable digests;
- [ ] provide the managed Pilot PostgreSQL plus separate clean-rehearsal and restore targets;
- [ ] configure DNS/public TLS, exact Web origin, and transactional SMTP;
- [ ] assign release, security, support, and backup owners;
- [ ] provision the Academy/cohort and execute the deployed four-role security and learning loop;
- [ ] take and separately restore the preflight backup, then take the pre-human-launch backup.

## Preserved source evidence

- Pilot event/feedback tables remain append-only and Academy-scoped.
- Browser events remain limited to approved open/navigation observations.
- State-changing workflow outcomes remain server-authored.
- Pilot metrics expose explicit denominators and do not claim learning effectiveness.
- Missing games, analysis, graph, or evidence remains operational unknown/readiness, not mastery.
- AI provider failure/disablement cannot create an artifact or block the core structured workflow.

## Launch rule

Do not invite Pilot users and do not create `pilot-v0.1.0` until every hard launch blocker has
dated evidence from the actual tagged deployment. Do not start Task 017.
