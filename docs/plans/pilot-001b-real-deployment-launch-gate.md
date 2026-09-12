# Pilot 001B real deployment and launch gate plan

Status: `SOURCE_REMEDIATION_VERIFIED_EXTERNAL_GATES_BLOCKED`

## Release boundary

- Frozen input release: `pilot-001-rc2` at
  `5c110007764075eff0725122b860f4555f180a73`.
- `pilot-001-rc2` is immutable. Any source remediation creates a new commit and RC tag.
- No Task 017 work, feature expansion, architecture rewrite, or fake production evidence is in
  scope.

## Execution order

1. Verify local and remote RC identity and inspect only the presence of deployment credentials.
2. Trace the existing deployment, cookie/Origin, SMTP, migration, restore, Worker, Stockfish, and
   Pilot evidence boundaries through Graphify, then confirm them in source and tests.
3. Remediate only release blockers found during that inspection:
   - add a Vercel Web build boundary pinned to an explicit release SHA and HTTPS API origin;
   - add a backend-only container topology that requires digest-pinned API/Worker images and an
     external PostgreSQL URL;
   - bring real-PostgreSQL and backup/restore verification through migration 016 and the Pilot
     lineage tables.
4. Run repository checks, production build, static deployment configuration validation, and every
   real boundary for which an explicit safe target and credential exists.
5. If source changes pass, commit, push, and create a new immutable RC. Never move rc2.
6. Deploy the exact new RC only when Vercel, container registry/host, managed PostgreSQL, DNS, SMTP,
   and operator ownership are explicitly available. Record immutable deployment and image IDs.
7. Run the separate restore, deployed four-role browser/security matrix, real Worker/Stockfish job,
   full Coach/Student loop, preflight metrics export, responsive smoke, and pre-launch backup.

## Evidence rules

- Local build/PGlite/static checks remain source evidence, never deployed-environment evidence.
- Missing external access remains `NOT_RUN`; failed gates remain `FAIL`.
- AI mode is explicitly `AI_DISABLED_FOR_PILOT` unless an authorized real-provider smoke passes.
- No stable `pilot-v0.1.0` tag is created while any hard launch gate is unresolved.

## Current execution constraints

The initial host audit found no Vercel/container-provider credentials, no managed PostgreSQL target,
no SMTP configuration, no Pilot hostname, no Stockfish path, and a stopped Docker Engine. The work
therefore proceeds through source remediation and local verification, while all real deployment
gates remain blocked until those operator-owned boundaries are supplied.
