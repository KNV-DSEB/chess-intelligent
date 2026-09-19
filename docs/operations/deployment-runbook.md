# Production deployment runbook

## Pilot 001B hybrid topology

```text
Browser
  → Vercel HTTPS → Next.js Web
        │ same-origin /backend/* rewrite
        ▼
  Railway HTTPS → Fastify API → managed PostgreSQL
                                      │
                         managed PostgreSQL ← Worker → Stockfish 18 UCI process
                                      │
                                      └→ transactional SMTP
```

`apps/web/vercel.json` is the Web-only build boundary. Configure the Vercel project with Root
Directory `apps/web`, Framework Preset `Next.js`, Build Command `pnpm run build:vercel`, Install
Command `corepack enable && pnpm install --frozen-lockfile`, Output Directory `.next`, and enable
**Include source files outside of the Root Directory in the Build Step**. That supported monorepo
setting makes the repository lockfile, workspace definition, canonical release guard, and
`packages/ui` available without adding Next.js to the repository-root package. The app-local
wrapper invokes the one canonical guard at `scripts/operations/verify-vercel-pilot-build.mjs`.
The build requires an explicit `PILOT_RELEASE_SHA` and Vercel's
`VERCEL_GIT_COMMIT_SHA`; the build fails if the two SHAs differ. Browser API traffic is centralized
at `/backend`. `NEXT_PUBLIC_API_URL` should be omitted; if an existing Vercel project still defines
it, the guard accepts only the literal browser-safe value `/backend`. It rejects a direct Railway
origin so cookie traffic cannot silently return to a cross-origin topology. Only browser-safe
variables may use a `NEXT_PUBLIC_` prefix.

Vercel exposes the standard `VERCEL` system indicator during its build. While that variable is
present, the Web config leaves Next.js output mode unset so Vercel's adapter owns tracing and
packaging. Outside Vercel, the config retains `output: 'standalone'`; `docker/Dockerfile.web`
continues to copy `.next/standalone` and run the generated `apps/web/server.js`. Do not force
standalone output into a Vercel build under the current Next.js/Vercel combination.

`docker-compose.pilot-backend.yml` is the Linux-host backend profile. It contains only one-shot
migration/ontology jobs, API, Worker, and the API TLS proxy. It requires digest-pinned API/Worker
registry images and an external encrypted `DATABASE_URL`; it does not contain Web or PostgreSQL.
Only Caddy publishes ports. Worker, API, and migration traffic remains server-side.

`docker-compose.production.yml` retains the standalone/local production-like topology used by Task 015. Its internal PostgreSQL and co-hosted Web prove protocol behavior but do not satisfy Pilot
001B's Vercel/managed-PostgreSQL launch gate.

The Node containers run as the image's unprivileged `node` user. Caddy requires its image-default
privileges to bind low ports; deployment operators must verify the actual runtime user/capability
policy on their host.

## Configuration

1. Copy `.env.pilot-backend.example` to an operator-controlled file outside source control.
2. Replace every placeholder. Use a URL-safe/percent-encoded application database password.
3. Production requires Secure cookies, exact `WEB_PUBLIC_ORIGIN`, SMTP delivery,
   `AUTO_MIGRATE=false`, and internal routes disabled.
4. The published Worker image contains Stockfish 18 built for baseline Linux x86-64 from pinned
   upstream commit `cb3d4ee9b47d0c5aae855b12379378ea1439675c`. The executable remains behind
   `STOCKFISH_PATH` as a separate UCI process; its GPL license and corresponding source archive
   ship in the image. Do not replace it without recording the new version, architecture, and hash.
5. `docker/Caddyfile.pilot-api` uses `API_PUBLIC_HOST` and Caddy's public ACME flow. Port 80/443
   and public DNS must reach the backend host. `docker/Caddyfile.local-acceptance` remains local
   protocol evidence only.
6. In Vercel Production remove the old direct `NEXT_PUBLIC_API_URL` value (or set it exactly to
   `/backend`) and configure `PILOT_RELEASE_SHA=<full RC commit SHA>`, then enable Vercel system
   environment variables. `apps/web/vercel.json` owns the `/backend/:path*` rewrite to the
   approved Railway API. Keep Fastify `WEB_PUBLIC_ORIGIN` equal to the exact production Vercel
   origin, `https://chess-intelligent-web.vercel.app`; do not add Preview origins.
   Apply the exact app-root settings above before creating the deployment. Target the exact Git
   SHA rather than deploying an unrecorded moving branch.

Never commit `.env`, TLS private keys, SMTP credentials, database URLs, dumps, or restore manifests.

## Build and first boot

Pushing a tag matching `pilot-001-rc*` runs
`.github/workflows/publish-pilot-containers.yml`. The workflow checks out the exact triggering
commit, logs in to GHCR with the built-in `GITHUB_TOKEN`, and publishes only the API and Worker
images. It creates release-tag and full-commit-SHA tags, never `latest`, then reports both immutable
digest references in the GitHub Actions job summary.

```text
pnpm install --frozen-lockfile
pnpm check
pnpm build
push the exact Pilot RC tag
wait for the publish pilot containers workflow to pass
record the API and Worker ghcr.io/...@sha256:... references from its job summary
docker compose --env-file <operator env> -f docker-compose.pilot-backend.yml pull
docker compose --env-file <operator env> -f docker-compose.pilot-backend.yml run --rm migrate
docker compose --env-file <operator env> -f docker-compose.pilot-backend.yml run --rm ontology
docker compose --env-file <operator env> -f docker-compose.pilot-backend.yml up -d api worker proxy
```

For Railway, configure distinct API and Worker services from those exact digest references. Run
the migration and ontology commands from the same API digest before starting either long-lived
service. The Worker image already owns `/opt/stockfish/stockfish`; no host bind mount or runtime
download is permitted. Railway deployment itself remains an operator gate and is not performed by
the publication workflow.

`academy:bootstrap-owner` remains an emergency/operator bootstrap boundary, not the normal product
entry. A new Owner should use public signup followed by authenticated Academy creation. The CLI is
conflict-safe and must never silently replace identity.

Deploy the Web from the same exact RC SHA after the API hostname is trusted and ready. The browser
uses the public Vercel origin for `/backend/*`; Vercel performs the server-side rewrite to Railway.
The `__Host-chess_session` cookie therefore remains scoped to the public Web host without
`SameSite=None`, a Domain attribute, or browser-visible registry/runtime credentials. Never add
wildcard Vercel Preview origins to production CORS.

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

`TRUST_PROXY=true` is valid only because the Pilot backend profile does not expose API directly
and all traffic reaches it through the controlled Caddy network. A platform that exposes API
directly must use an explicit trusted-proxy predicate and must not trust arbitrary forwarded
headers.
