# Task 012 — Academy Production Foundation V1 plan

## Pre-implementation security trace

| Current path                            | Current actor source                                 | Existing scope check                     | Task 012 boundary                                                                            |
| --------------------------------------- | ---------------------------------------------------- | ---------------------------------------- | -------------------------------------------------------------------------------------------- |
| Academy roster                          | `coachMembershipId` query                            | same-Academy `COACH` lookup              | authenticated membership with `ROSTER_READ`                                                  |
| Student Intelligence                    | `coachMembershipId` query + Student path ID          | same-Academy Coach and Student lookup    | `STUDENT_INTELLIGENCE_READ`; Student may read only their own profile                         |
| Student assignments / assignment detail | `coachMembershipId` query                            | same-Academy Coach and assignment lookup | `ASSIGNMENT_READ`; Student self projection is ownership-derived                              |
| Assignment create/cancel                | `coachMembershipId` body/query                       | repository same-Academy Coach check      | `ASSIGNMENT_WRITE`; persisted actor membership comes from session                            |
| Student progress comparison             | `coachMembershipId`, Academy and Student IDs in body | Coach + Student Player comparison        | `STUDENT_INTELLIGENCE_READ`; actor derived from session                                      |
| TrainingAttempt                         | client `playerId` body + TrainingItem path ID        | item Player equals supplied Player       | authenticated `STUDENT` → StudentProfile → Player must equal item Player                     |
| TrainingItem/Plan/Attempt reads         | resource ID only                                     | no authenticated ownership               | Student self ownership; non-Student generic use is internal-development only                 |
| TrainingPlan generation                 | client Player + SkillGraphRun                        | graph belongs to supplied Player         | internal-development only in V1; Academy workflows consume existing immutable plans          |
| Skill Graph generation/read             | client Player/run IDs                                | artifact-level Player checks only        | internal-development only for generic mutation; Academy/Student reads use scoped projections |
| Academy/membership/Student creation     | no actor                                             | relational integrity only                | Academy bootstrap CLI or `MEMBERSHIP_MANAGE` within authenticated Academy                    |

The existing Graphify graph predates Tasks 010–011. It identifies `buildApp()` as the HTTP composition boundary but contains no Academy, StudentProfile, membership, User, or session nodes. Direct source and migration inspection is authoritative for this plan.

## Identity and migration strategy

- `users` is the application identity and owns one separate `user_credentials` row.
- `academy_memberships.user_id` is nullable so Task 011 memberships remain unclaimed until bootstrap/invitation. Existing membership IDs, StudentProfiles, and assignment lineage are preserved.
- Membership roles expand to `OWNER`, `ADMIN`, `COACH`, `STUDENT`; lifecycle is `ACTIVE` or `DISABLED`.
- `student_profiles` remains the exact Academy learner → canonical Player link. Student self-service resolves User → active STUDENT membership → StudentProfile → Player; the client cannot select Player identity.
- One active membership per User + Academy is enforced with a partial unique index.
- Existing Task 011 assignment actor columns are retained for lineage, while their allowed roles expand to OWNER/ADMIN/COACH and new writes receive a server-derived membership.

## Security components

1. Pure versioned policies in `packages/domain`: email/password, session, rate-limit, invitation, RBAC, origin, audit metadata, and consent state.
2. Migration `013_academy_production_foundation.sql`: Users, credentials, sessions, login attempts, invitations, audit events, consent records, membership/User binding, lifecycle, indexes, and append-only audit enforcement.
3. Small persistence boundaries in `packages/db`: authentication/session; invitation/membership; audit/consent. Do not add these responsibilities to `AcademyRepository`.
4. Application services in `apps/api`: password hashing/token generation, auth lifecycle, Academy security administration, and centralized authenticated principal/capability resolution.
5. Fastify hooks/helpers parse the opaque cookie once, enforce authenticated mutation origins, set security headers, and return consistent 401/403 errors.

## Route migration

- Public: health, published ontology reads, login, invitation acceptance.
- Authenticated: `/auth/me`, logout, password change, session revoke-all.
- Academy protected: invitations, memberships, consent, audit, roster, Student Intelligence, progress and assignment workflows.
- Student self: own intelligence/assignments and exact owned TrainingItem/Attempt reads/writes.
- Internal development only in production: direct Academy fixture creation, generic Skill Graph generation, TrainingPlan generation, analysis/classification/import write surfaces and arbitrary Player artifact exploration where explicitly catalogued.

No client membership/User/role/Player identifier establishes actor identity. Resource IDs remain acceptable only when checked against the authenticated Academy or Student ownership chain.

## Consent and audit

- `requiresGuardianConsent=false` derives `NOT_REQUIRED`; true with no record derives `PENDING`; latest append-only record derives `GRANTED` or `REVOKED`.
- Invitation acceptance may bind the Student User while consent is pending, but scored attempts remain blocked until `GRANTED`.
- Academy-recorded consent is a product access boundary, not verified guardian identity or a legal-compliance claim.
- Security mutations append sanitized audit events transactionally where practical. Passwords, credential hashes, raw/hash session tokens, raw/hash invitation tokens, and cookie values are rejected from audit metadata.

## Verification strategy

- Pure domain tests cover the full role/capability matrix, password/email/rate/origin/consent policies, and audit secret rejection.
- PGlite security integration covers migration 001→013 and 012→013 preservation, owner bootstrap, login/session/logout/password change/rate limit, invitation claim/revoke/expiry/double-use/wrong-email, last-owner protection, actor derivation, Student ownership, Coach/Admin/Owner attempt denial, consent gating, audit safety, cross-Academy same-Player isolation, and Task 010/011 regressions.
- Production Next build and browser QA cover login/invitation/role navigation when the browser runtime works.
- Real PostgreSQL and the opt-in benchmark are run only when Docker/PostgreSQL is available; otherwise they remain explicit release blockers.
