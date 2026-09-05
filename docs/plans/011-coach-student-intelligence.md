# Task 011 implementation plan

## Repository decision

The repository has no Academy, User, StudentProfile, CoachProfile, Assignment, authentication, or authorization foundation. Migration 012 therefore adds the smallest academy model instead of creating a parallel version of an existing one:

- `academies`;
- `academy_memberships` with only `COACH` and `STUDENT` roles;
- `student_profiles` with an explicit canonical `players.id` link;
- `training_assignments` and immutable `training_assignment_items`.

A CoachProfile is unnecessary in V1 because academy-scoped coach membership is sufficient. A membership ID is an internal development identity, not an authenticated principal. Routes enforce relational academy and role boundaries, but the product remains `AUTHORIZATION_NOT_PRODUCTION_READY` until a later authentication/RBAC milestone.

## Trusted boundaries

- Task 011 reads immutable Task 009/010 Skill Graph, TrainingPlan, TrainingItem, TrainingAttempt, and TrainingEvidence records.
- Assignment creation never writes concept or training evidence and never recalculates mastery.
- Assignment completion is derived from Task 010 attempts for the same Player and TrainingItem submitted at or after `assignedAt`.
- Progress comparison is pure domain logic over two explicit Skill Graph runs and their persisted concept states.
- Roster and Student Intelligence select the latest graph matching one explicit ontology, Skill Graph policy/configuration, classifier semantics, and normalized evidence scope.
- GET/read paths never create Skill Graphs or TrainingPlans.

## Implementation sequence

1. Add versioned domain policies for progress comparability, assignment measurement/completion, freshness, and coach attention signals, with pure tests.
2. Add migration 012 and a bounded Academy repository projection. Preserve canonical Player identity and enforce immutable Task 010 references with foreign keys.
3. Add application orchestration and academy-scoped Fastify routes using explicit coach membership IDs until production authentication exists.
4. Add `/academy`, `/academy/students/[id]`, and `/academy/assignments/[id]`; link assigned items back to the existing `/training` solver.
5. Add PGlite integration coverage for isolation, compatible-run selection, assignments, attempts/evidence, freshness, and progress.
6. Update architecture, policy, project context, and agent invariants; then run full static, migration, regression, build, browser, Graphify, and environment verification.

## Query shape

The roster is one bounded SQL projection with pagination, window-ranked compatible Skill Graphs, aggregated assignment progress, training activity, and exact training-evidence freshness. It does not issue one repository/HTTP query per Student. Student detail uses a small fixed number of bounded projections because it addresses one Student, not an unbounded roster.

## Non-goals

No AI, generated report, mastery override, leaderboard, notifications, guardian workflow, coach-authored puzzle, automatic graph/plan generation, new classifier, new engine search, or academy-scale scoring is introduced.
