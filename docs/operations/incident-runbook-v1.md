# Incident runbook V1

Preserve request IDs, timestamps, affected Academy IDs, release commit, and sanitized error classes. Never copy passwords, cookies, raw/digested tokens, SMTP credentials, database URLs, or private keys into tickets or chat.

## Database unavailable

Confirm `/livez` remains alive and `/readyz` is 503. Stop accepting traffic, verify network/credentials/storage, and ensure authorization failures did not become allow. Restore service, confirm current migration, then run authenticated smoke tests.

## Migration failure

Drain writes, retain the failing migration name, verify it was not recorded as applied, and follow `database-migration-runbook.md`. Use the verified pre-migration dump; do not patch production history or improvise a down migration.

## Session or authentication incident

Disable the affected User or membership as appropriate, revoke sessions, inspect append-only audit events by request ID, rotate exposed infrastructure secrets, and verify no raw credential/token was logged. A Player ID never identifies an actor.

## SMTP failure

Keep existing authenticated workflows available. Invitation/reset requests must record failed delivery without exposing provider details or raw tokens. Repair provider configuration and issue a new invitation/reset; do not recover a raw token from persistence because none exists.

## Worker or Stockfish failure

API/Web should remain healthy. Stop Worker restarts if the executable/configuration is broken, preserve bounded job failure provenance, restore the executable, verify Worker health, then run one real UCI job. Never replace engine truth with an LLM.

## Cross-tenant security suspicion

Treat as a release blocker. Disable affected write paths or take the service out of rotation, preserve logs/audit/request IDs, reproduce with two independent Academy sessions, and inspect every Academy predicate. Do not weaken or remove tenant joins during diagnosis.

## Backup or restore incident

Do not call a dump a backup until separate restore verification succeeds. Protect all dump/manifest files as sensitive application data. Record measured restore time; V1 has no contractual RPO/RTO guarantee.
