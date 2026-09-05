# Production-like deployment runbook

## Topology

```text
Browser
  → Caddy HTTPS
      ├─ /api/* → Fastify API → PostgreSQL
      └─ /*      → Next.js Web
                         PostgreSQL ← Worker → external Stockfish process
                         API → SMTP provider
```

`docker-compose.production.yml` is the V1 staging/production-like profile. PostgreSQL and Worker have no public port. Mailpit is bound to loopback for local acceptance only. Only Caddy exposes public HTTP/HTTPS ports.

The Node containers run as the image's unprivileged `node` user. The official PostgreSQL image owns its data process. Caddy requires its image-default privileges to bind low ports; deployment operators must verify the actual runtime user/capability policy on their host.

## Configuration

1. Copy `.env.production.example` to an operator-controlled file outside source control.
2. Replace every placeholder. Use a URL-safe/percent-encoded application database password.
3. Production requires Secure cookies, exact `ALLOWED_ORIGINS`, `PUBLIC_WEB_BASE_URL`, SMTP delivery, `AUTO_MIGRATE=false`, and internal routes disabled.
4. Provide a real executable Stockfish file at `STOCKFISH_HOST_PATH`. The repository does not bundle it.
5. For public deployment, replace Caddy's local `tls internal` acceptance configuration with the operator's trusted public certificate/ACME policy. Internal-CA success is not public TLS proof.

Never commit `.env`, TLS private keys, SMTP credentials, database URLs, dumps, or restore manifests.

## Build and first boot

```text
pnpm install --frozen-lockfile
pnpm check
pnpm build
docker compose --env-file <operator env> -f docker-compose.production.yml build
docker compose --env-file <operator env> -f docker-compose.production.yml up -d postgres mailpit
docker compose --env-file <operator env> -f docker-compose.production.yml run --rm migrate
docker compose --env-file <operator env> -f docker-compose.production.yml up -d api worker web proxy
```

Run `academy:bootstrap-owner` inside the API image with `ACADEMY_BOOTSTRAP_PASSWORD` injected only for that process. The CLI is conflict-safe: it rejects an existing User email or active Owner rather than silently replacing identity.

## Verification order

1. `GET /livez` returns process liveness.
2. `GET /readyz` returns current PostgreSQL/schema status.
3. SMTP acceptance receives invitation and password-reset messages; application logs contain no token URL.
4. Inspect the real HTTPS `Set-Cookie`: `Secure; HttpOnly; SameSite=Lax; Path=/`, `__Host-` name, no `Domain`.
5. Verify allowed and foreign Origin mutations, credentialed CORS, response headers, and no mixed-content browser requests.
6. Run separate OWNER/ADMIN/COACH/STUDENT sessions and the route-access matrix.
7. Run cross-tenant, same-Player/two-Academy, direct-ID, and Coach impersonation denials.
8. Run one assignment → Student attempt → TrainingEvidence → explicit Skill Graph V2 refresh.
9. Run the backup/restore rehearsal and Academy benchmark.

## Failure and rollback

- PostgreSQL unavailable: `/readyz` must be 503; authentication/authorization fails closed. Do not route traffic.
- SMTP unavailable: invitation/reset delivery fails visibly in audit/delivery state; existing authenticated workflows may continue.
- Stockfish unavailable: Worker health/job fails; API/Web remain independent.
- Migration failure: keep traffic drained and follow the database runbook. Do not invent reverse SQL.
- Application regression with compatible schema: roll back Web/API/Worker images and rerun health/security smoke.

## Proxy trust

`TRUST_PROXY=true` is valid only because the production profile does not expose API directly and all traffic reaches it through the controlled proxy network. A deployment that exposes API directly must reassess this setting and must not trust arbitrary forwarded headers.
