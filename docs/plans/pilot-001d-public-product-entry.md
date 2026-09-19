# PILOT 001D — Public product entry

## Outcome

The product now has one coherent entry path:

```text
Public landing
  → account-only signup
  → create a new Academy as OWNER or accept an exact invitation
  → role-specific Academy experience
```

Signup creates no Player, StudentProfile, Academy membership, game, concept evidence, mastery, or
training artifact. Academy creation is a separate authenticated transaction and accepts only the
new Academy name. Coach/Admin/Student roles remain invitation-assigned; Student invitations still
claim a prepared same-Academy Student membership.

## Browser topology

Every browser API call uses `/backend`. Vercel rewrites that path to the approved Railway API.
Fastify continues to require the exact Web Origin for unsafe methods and emits
`Cache-Control: private, no-store, max-age=0`. The session remains an HttpOnly, Secure,
SameSite=Lax, Path=/, no-Domain `__Host-chess_session` cookie in production.

## Local evidence

- account/signup/Academy transaction, duplicate email, role injection, Origin, session, logout,
  invitation, tenant, and last-Owner regressions: covered by API integration suites;
- migration 017 and production artifact topology: deterministic regression coverage;
- Next.js production build: PASS;
- landing: 1440×900, 1024×768, and 390×844 screenshots;
- signup: desktop and 390×844 screenshots;
- mobile computed layout: 390px viewport, 390px document width, CTA inside the first viewport.

## Honest boundary

This source milestone does not claim deployed acceptance. Rc9 must still be deployed from its exact
Git SHA, migrated on real Pilot PostgreSQL, and exercised with independent Owner/Admin/Coach/Student
browser contexts plus transactional email.

Do not start Task 017 before the real Pilot evidence is reviewed.
