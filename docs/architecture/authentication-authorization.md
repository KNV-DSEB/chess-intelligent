# Authentication and authorization architecture

## Identity model

`User` is the login identity. `AcademyMembership` binds one User to one Academy and supplies a V1 role. `StudentProfile` is Academy-owned learning context. `Player` is shared canonical chess identity. They remain separate: a Player ID is never a credential, a StudentProfile is never global identity, and two Academies may link different StudentProfiles to the same Player without sharing tenant data.

Historical Task 011 memberships remain valid with `user_id = NULL`. Bootstrap or an invitation may bind them without changing membership IDs, StudentProfile links, or assignment actor lineage.

## Credentials and sessions

Credentials are stored in `user_credentials`, separately from `users`. Passwords use Argon2id through `@node-rs/argon2` and `PASSWORD_POLICY_V1`. The server creates a 256-bit opaque session token; only its SHA-256 digest is stored. Browser responses receive the raw value only in an HttpOnly, SameSite=Lax cookie. Production uses Secure `__Host-chess_session`, path `/`, no Domain attribute, and refuses startup configuration that disables Secure cookies.

Sessions have a seven-day absolute lifetime. Logout revokes the current session. Password changes revoke all old sessions and issue a rotated session. Revocation and User disable take effect during the next server-side session lookup.

## Authorization and tenant isolation

`ACADEMY_RBAC_V1` is the canonical role/capability map. HTTP code authenticates a User, then `AcademySecurityApplicationService` resolves an active same-Academy membership and checks the required capability. Browser-supplied membership IDs do not participate in production authorization. Repository queries retain Academy IDs and relational constraints even after application authorization, preventing shared Player identity from collapsing tenant isolation.

Students use a separate self-service derivation:

```text
session token → User → active STUDENT membership → StudentProfile → Player
```

Training item access additionally requires a non-cancelled Academy assignment containing that exact item. A Coach, Admin, or Owner cannot satisfy this Student derivation and therefore cannot create a scored Student attempt.

## Invitations and membership lifecycle

There is no public signup. Owner/Admin creates a seven-day invitation. Only the invitation token SHA-256 digest is persisted. Task 013 delivers the request-local raw token through `EmailDeliveryProvider`; production responses never expose it. Invitation delivery requested/succeeded/failed state and audit provenance are stored without token material. Acceptance validates status, expiry, normalized email, role, Academy, and optional existing membership in one transaction. It creates or reuses the User, binds the membership, marks the invitation accepted, and appends audit provenance.

Memberships are `ACTIVE` or `DISABLED`. A disabled membership immediately loses Academy access without invalidating memberships in other Academies. The last active Owner cannot be disabled or demoted. Admin cannot manage Owner lifecycle.

## Consent boundary

`student_profiles.requires_guardian_consent` and append-only Academy attestations yield `NOT_REQUIRED`, `PENDING`, `GRANTED`, or `REVOKED`. Pending/revoked Students may authenticate but cannot use Student self-service or submit scored training. Owner/Admin records the Academy attestation. This is a product access-control state, not verified guardian identity or a legal-compliance claim.

## Security audit

`security_audit_events` is append-only and records authentication, invitation, membership, assignment, consent, permission denial, and cross-tenant denial provenance. The metadata validator rejects secret-bearing keys. Audit records are not games, concept evidence, mastery evidence, or training evidence.

## Password reset

The anonymous request endpoint always returns `PASSWORD_RESET_REQUEST_ACCEPTED`. For an active account, the application creates a 256-bit raw token, stores only its SHA-256 digest, and sends a one-hour link through the email boundary. Unknown and throttled identifiers take a non-enumerating response path. Completion atomically consumes one unused/unrevoked/unexpired token, writes a new Argon2id credential, revokes all sessions and other reset tokens, and appends audit provenance. Concurrent or repeated consumption can succeed at most once.

## Deployment boundary

Production configuration requires exact origins, Secure `__Host-` cookies, disabled internal routes, explicit one-shot migration, a public web base URL, and SMTP. Caddy terminates TLS in the production-like Compose profile; API is reachable only through the internal proxy network and trusts forwarded headers only when `TRUST_PROXY=true`. `/livez` is dependency-free process liveness while `/readyz` verifies PostgreSQL and the exact current migration.

## Known limitations

- SMTP and end-to-end email acceptance are implemented but have not been exercised on the current host; recipient identity is no stronger than possession of the delivered link.
- There is no durable asynchronous email queue or automatic provider retry in V1.
- MFA, device management, idle session expiry, and guardian accounts are deferred.
- Authentication throttling is database-backed per normalized-identifier digest, not yet distributed by IP/device.
- Research reads remain public per the route catalog; production operators should review that policy before exposing a corpus containing restricted data.
- Academy assignment audit append is immediately associated but is not yet in the same database transaction as the Task 011 assignment repository mutation.
- Real PostgreSQL, HTTPS cookie behavior, and the four-role browser matrix remain unverified until the Task 013 production-like environment is executed.
