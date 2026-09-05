# Coach / Student Intelligence

Task 011 is an Academy-scoped orchestration and read-model layer over immutable Skill Graph and Adaptive Training artifacts:

```text
Academy → Roster → Student Intelligence → Training Assignment
        → Task 010 Attempt/Evidence → explicit Skill Graph → comparable Coach review
```

It does not classify chess, aggregate mastery, generate training items, or create narrative.

## Identity and academy foundation

Migration 012 introduces the smallest foundation because the repository previously had no Academy, User, Student, Coach, membership, assignment, or authentication model.

- `players` remains the canonical chess identity.
- `student_profiles` is one learner profile inside one Academy and explicitly references one Player.
- `academy_memberships` represents the Academy role. V1 uses only `COACH` and `STUDENT`.
- A separate CoachProfile is unnecessary in V1; a COACH membership is the relationship.
- The same Player may be linked by separate StudentProfiles in multiple Academies. No Player is duplicated.

Task 012 replaced the development actor boundary with opaque authenticated sessions and `ACADEMY_RBAC_V1`. Production routes derive the active same-Academy membership on the server; explicit Coach membership IDs remain only behind the non-production internal-development gate for regression fixtures. See `authentication-authorization.md` and the route access catalog.

## Compatible Student Intelligence profile

Roster and detail reads require one explicit profile:

```text
ontologyVersion
skillGraphPolicyVersion
current policyConfigSha256
normalized evidence scope / evidenceScopeSha256
classifier bundle + configuration
classification selection policy
```

The latest successful run is selected only inside that exact tuple, ordered by `asOfDate`, completion time, then immutable ID. A newer V1 graph or different-scope V2 graph cannot replace a requested classical V2 graph. Read requests never create SkillGraphRuns or TrainingPlans.

Coverage reuses persisted Skill Graph denominators and states. Training history separately reports attempt count, distinct first-scored items, first-attempt correct/incorrect counts, mode counts, and last activity. Retries remain visible but do not become independent units.

## Freshness

`SkillGraphFreshness` is `CURRENT`, `REFRESH_AVAILABLE`, or `NO_COMPATIBLE_GRAPH`.

Training freshness selects the exact Task 010 first scored evidence per Player + TrainingItem and checks whether its evidence ID appears in `skill_graph_training_evidence_contributions` for the selected graph. A retry outside the graph does not create a false refresh reason when the first scored item is already represented.

Task 011 does not duplicate Task 009 Game/classification selection. `newGameEvidenceCount` is therefore explicitly unavailable (`null`) in V1 rather than a guessed zero. Refresh remains an explicit call to the existing Skill Graph generation API.

## Comparable progress

`STUDENT_PROGRESS_COMPARISON_V1` compares two explicit immutable run IDs. It requires equal Player, ontology, Skill Graph policy, policy config hash, evidence scope hash, classifier bundle/configuration, and classification selection policy, with non-decreasing `asOfDate`. Evidence snapshots may and normally should differ.

Comparable output contains persisted coverage deltas and concept state/evidence changes. A posterior delta is reported neutrally; it is not automatically labelled improvement or regression. `NO_EVIDENCE → INSUFFICIENT_EVIDENCE` exposes the state transition without manufacturing a zero-percent baseline. Incompatible runs return reason codes and no deltas.

## Assignments

A TrainingAssignment pins:

```text
Academy + StudentProfile + Player + COACH membership
TrainingPlanRun + its baseline SkillGraphRun
immutable selected TrainingItem IDs
TRAINING_ASSIGNMENT_POLICY_V1
```

Composite foreign keys prevent cross-Player, cross-plan, or false-baseline references. At creation, an unscored item is `MEASUREMENT_ELIGIBLE`; a previously scored remediation item is `PRACTICE_ONLY_ALREADY_MEASURED`; a previously scored diagnostic item is rejected.

Completion is a projection over Task 010 attempts for the same Player and item submitted at or after `assignedAt`. Correct and incorrect attempts both complete workflow; correctness remains separate evidence. Attempts before assignment do not complete it, and retries do not add completion. Cancellation preserves assignments, items, attempts, and evidence.

Assignment creation and operational notes write no `concept_evidence_instances` or `training_evidence_instances`. Assigned items link to the existing `/training` solver, which remains the only scoring/evidence path.

## Operational attention

`COACH_ATTENTION_SIGNAL_V1` emits only workflow signals:

- no compatible Skill Graph;
- compatible graph has unselected Task 010 evidence;
- an active assignment is overdue;
- an active assignment has no activity for seven days;
- a completed assignment has evidence available for review.

Signals are not weakness, risk, personality, mastery, or ranking labels.

## Query shape and privacy

Roster pagination defaults to 50 and caps at 100. One bounded SQL statement selects students, window-ranks compatible graphs, aggregates persisted coverage, assignment progress, training activity, and exact training freshness. It does not make one database/HTTP call per Student.

Every Student, assignment, and roster repository path includes `academy_id`; Coach membership checks include the same Academy and exact `COACH` role. Production authentication/RBAC remains the required pre-beta security milestone.
