# Task 015 production topology and four-role browser gate closure

## Mission

Close only the two release boundaries left open by Task 014: execute the
repository's production Docker Compose topology and execute the complete
OWNER/ADMIN/COACH/STUDENT browser matrix through the deployed HTTPS boundary.
This task does not expand learning coverage or implement Task 016.

## Evidence boundary

- Run PostgreSQL, one-shot migrations, API, Worker, Web, SMTP sink, and HTTPS
  reverse proxy through `docker-compose.production.yml`.
- Use an operator-supplied Linux Stockfish 18 executable mounted read-only into
  the Worker container. Engine evidence must retain the normal immutable
  provenance and exact-history rules.
- Bootstrap the first Owner through the supported CLI, not manual SQL.
- Drive each role from an independent browser profile/cookie jar. Browser UI is
  used for every workflow the product exposes; direct HTTPS calls are reserved
  for explicit denied-boundary assertions and evidence inspection.
- Persist no raw password, session, invitation, or reset token in committed
  evidence. Runtime credentials and artifacts remain ignored.

## Gate sequence

| Gate                | Execution                                                                            | Pass condition                                                                                                    | Evidence                                              |
| ------------------- | ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| Host recovery       | Start Docker Desktop without reset/prune                                             | Linux engine and Compose respond                                                                                  | Docker versions plus recovery note                    |
| Static topology     | Render Compose config with explicit acceptance env                                   | No unresolved values; only the HTTPS proxy binds host ports; Mailpit inspection stays inside the isolated network | Sanitized config and port inventory                   |
| Image build         | Build API, Worker, Web images                                                        | Build succeeds; production processes do not use `tsx`/watchers                                                    | Dockerfiles, image process inspection                 |
| Clean boot          | `docker compose up --build -d` from an empty project-scoped volume set               | migration exits 0; long-lived services healthy                                                                    | `docker compose ps`, health endpoints, migration rows |
| Failure semantics   | Exercise PostgreSQL, SMTP, and invalid Stockfish boundaries without weakening checks | readiness/protected requests fail closed; API/Worker survive or recover as documented                             | HTTP results, service status, sanitized logs          |
| Engine job          | Submit one real analysis job to the Compose Worker                                   | immutable run succeeds with Stockfish 18 provenance and exact states                                              | API/database projection and Worker logs               |
| Academy bootstrap   | Run Owner bootstrap CLI inside the production image                                  | Owner/User/Academy/membership identities are distinct and usable                                                  | sanitized CLI result and login                        |
| Role browser matrix | Four isolated Chrome contexts execute allowed and denied role workflows              | all required workflows and denials match `ACADEMY_RBAC_V1`; no shared-cookie shortcut                             | acceptance result per role/action                     |
| Browser quality     | Repeat authentication/navigation at desktop and 375 px                               | no console exception, mixed content, horizontal overflow, unlabeled primary form, or broken reload/logout         | CDP observations and screenshots if useful            |
| Security provenance | Inspect audit and lineage after the matrix                                           | tenant/permission denials are audited; attempts/evidence preserve exact ownership and lineage; no secret appears  | sanitized counts and stable identifiers               |
| Repository checks   | `pnpm check` and `pnpm build`                                                        | both pass after any blocker remediation                                                                           | command output                                        |

## Four-role matrix

### OWNER

- Login, reload, and logout.
- View roster and Student detail.
- Create invitation and assignment.
- Perform permitted membership changes.
- Verify last-active-Owner protection remains enforced.

### ADMIN

- Login and view roster/Student intelligence.
- Create invitation and assignment and perform permitted membership changes.
- Confirm Owner-only or forbidden transitions are denied.

### COACH

- Login, view roster/detail/progress, create and cancel an assignment.
- Confirm invitation, membership mutation, security-audit access, and Student
  attempt impersonation are denied.

### STUDENT

- Login and view only own intelligence, assignments, and training item.
- Submit a training attempt and observe the resulting state/evidence without
  receiving accepted moves before the attempt.
- Confirm roster, other-Student detail, assignment creation, audit access, and
  foreign item/Academy identifiers are denied.

## Remediation rules

- Fix only defects required to make an existing gate executable or correct.
- Never weaken Academy, Student ownership, Origin/cookie, readiness, or evidence
  lineage predicates.
- Rerun the failed gate and the closest regressions after each fix.
- Record unavailable or unauthorized evidence as such. A network dependency
  audit remains `NOT_AUTHORIZED` unless the user explicitly authorizes registry
  disclosure.

## Deliverables and decision

- Update the production topology, operational scripts, UI, tests, and runbooks
  only where gate execution proves a blocker.
- Create `docs/operations/task-015-production-topology-browser-gate-report.md`
  with environment, commands, PASS/FAIL/NOT_RUN evidence, remediations, residual
  risks, and one exact decision:
  `PRODUCTION_GATE_PASSED`,
  `PRODUCTION_GATE_PASSED_WITH_NON_BLOCKING_RISKS`, or
  `PRODUCTION_GATE_BLOCKED`.
- Update `docs/operations/production-release-checklist.md` and
  `PROJECT_CONTEXT.md` to the same decision. Do not begin Task 016 here.
