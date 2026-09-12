# Pilot 001 operations

## Scope and owners

Run one Academy for two Coaches and six to ten Students for two to three weeks. Name a release
owner, Academy operations owner, security contact, support owner, backup owner, and AI review owner
before provisioning.

## Provisioning order

1. Deploy the exact tagged Web commit through `vercel.json`, and deploy digest-pinned API/Worker
   images through `docker-compose.pilot-backend.yml`. Use stable same-site Web/API hostnames.
2. Run migration `016_private_academy_pilot.sql` as the one-shot migration job, then publish the
   pinned ontology before API/Worker startup.
3. Configure a real transactional SMTP service and verify invitation/password-reset delivery.
4. Create exactly one Pilot Academy; bootstrap the first Owner through the guarded CLI.
5. Invite operational users and Students. Link each StudentProfile to the intended canonical Player;
   do not use Player identity for login.
6. Complete guardian-consent attestations where the product gate requires them.
7. Verify game, analysis, classification, and explicit Skill Graph readiness for every Student.
8. Enable AI only after the real-provider synthetic smoke is reviewed. Otherwise keep it disabled.

## Daily checks

- `/livez` is process-level and `/readyz` confirms database/schema availability.
- API and Worker pool errors are monitored; protected requests must fail closed during outage.
- review failed AI attempts by outcome only; never log prompts, tokens, raw output, cookies, or PII.
- record support incidents in the support log and classify severity/owner/status.
- check invitation delivery, analysis queue age, and unhandled browser/API errors.

## Weekly metric export

Set `PILOT_METRICS_EXPORT_CONFIRM=YES`, `PILOT_DATABASE_URL`, `PILOT_ACADEMY_ID`,
`PILOT_METRICS_FROM`, `PILOT_METRICS_TO`, `PILOT_METRICS_OUTPUT`, and the manually reconciled
`PILOT_SUPPORT_INCIDENT_COUNT`; then run `pnpm pilot:metrics`. Store JSON and CSV in the
operator-controlled evidence location, not the repository.

Metrics are workflow/usage observations. They do not establish learning effectiveness.

## Disable and incident response

- AI kill switch: set `GROUNDED_AI_PROVIDER=DISABLED` and redeploy API. Structured intelligence,
  training, assignments, and evidence remain available.
- Suspected tenant or credential exposure: stop affected ingress, preserve logs/audit provenance,
  rotate credentials, and follow the production incident runbook.
- Database incident: preserve the source database, restore the latest viable dump into a separate
  database, verify integrity, then decide recovery. Never claim backup success from dump creation.
- Schema/authorization dependency failure: keep readiness failed and protected operations closed.
