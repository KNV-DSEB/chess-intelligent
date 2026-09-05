# Academy benchmark V1

## Task 014 execution evidence

Status: `PASS` for the existing valid Academy operational scale.

Evidence was rerun on 2026-09-04 (Asia/Bangkok) against the explicitly named
disposable database `task014_benchmark_20260903` on PostgreSQL 17.11. The host
was Windows 11 build 26200 with Node.js v24.11.1 and pnpm 11.19.0. The final
rerun used local port 55415 after the earlier acceptance server had been stopped.

The guarded command was:

```text
ACADEMY_BENCHMARK_CONFIRM=YES
ACADEMY_BENCHMARK_DATABASE_URL=<task014_benchmark_20260903 PostgreSQL URL>
ACADEMY_BENCHMARK_SEED=YES
pnpm benchmark:academy
```

Credentials are intentionally omitted.

## Dataset

| Observation                 |  Count |
| --------------------------- | -----: |
| Academies                   |      1 |
| Students                    |  1,000 |
| staff                       |     50 |
| sessions                    |  1,050 |
| invitations                 |  2,000 |
| password-reset observations |  2,000 |
| security audit events       | 10,000 |
| Assignments                 |      0 |
| TrainingAttempts            |      0 |

The benchmark seed deliberately does not fabricate Assignments or
TrainingAttempts without valid Task 004/008/009/010 lineage.

## Repeated query results

Each row used 20 samples and one `EXPLAIN (ANALYZE, BUFFERS)`.

| Query                                    | Median (ms) | P95 (ms) | Observed plan                                               |
| ---------------------------------------- | ----------: | -------: | ----------------------------------------------------------- |
| session authentication                   |       0.395 |    0.745 | unique token-hash index, six shared-buffer hits             |
| User → active Academy membership         |       0.297 |    0.469 | normalized-email and active membership indexes              |
| authenticated roster, first page         |       0.627 |    0.777 | Academy roster index plus membership PK lookups             |
| authenticated roster, page at offset 900 |       1.199 |    1.371 | bounded 1,000-row hash join and in-memory sort              |
| Student self-intelligence identity       |       0.504 |    0.695 | email, membership, and StudentProfile indexes               |
| active assignments for Student           |       0.389 |    0.549 | Student history index; benchmark fixture returned zero rows |
| Academy invitation list                  |       0.919 |    1.250 | bounded 2,000-row scan and top-N sort                       |
| security audit page                      |       0.294 |    0.416 | Academy audit-list index                                    |
| password-reset throttle lookup           |       0.254 |    0.330 | backward index-only scan                                    |

No measured query was pathological at this scale. The later roster page and
invitation list use bounded scans that are acceptable for the observed data, but
they are future keyset-pagination/index candidates if Academy size grows
materially. No index was added speculatively.

## Supplemental valid-learning plan review

The separate production-like learning fixture contains two canonical Games, two
AnalysisRuns, two ClassificationRuns, 63 ConceptEvidence instances, two
SkillGraphRuns, one TrainingPlan, three TrainingItems, two Assignments, six
TrainingAttempts, and six TrainingEvidence instances.

Two required plans not represented by the operational benchmark were measured
there:

- compatible SkillGraph selection used
  `player_skill_graph_runs_compatible_profile_idx`, two buffer hits, and
  completed in 0.795 ms;
- Student TrainingItem ownership used Academy/User/Student/Assignment/item
  indexes and completed in 2.175 ms.

The ownership plan preserves every Academy, membership, Student, Player,
Assignment, and TrainingItem predicate.

## Storage observation

| Relation                  | Total bytes |
| ------------------------- | ----------: |
| `academy_invitations`     |   1,351,680 |
| `academy_memberships`     |     778,240 |
| `auth_sessions`           |     688,128 |
| `password_reset_requests` |     827,392 |
| `security_audit_events`   |   3,932,160 |
| `student_profiles`        |     630,784 |

## Scope and limitations

The requested 10,000-Assignment / 50,000-Attempt learning target was not
generated because the reusable benchmark seeder does not yet replicate complete
independent engine/classification/ontology lineage at that scale. The exact
valid learning scale achieved is reported above. This lower learning scale is a
non-blocking capacity uncertainty, not evidence that the measured queries are
slow.

Correct tenant, ownership, compatibility, and evidence-lineage predicates were
not removed or weakened for benchmark speed.
