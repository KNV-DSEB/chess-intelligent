---
type: "query"
date: "2026-09-19T02:55:50.274725+00:00"
question: "How does PILOT 001D implement public product entry without weakening Academy security?"
contributor: "graphify"
outcome: "useful"
---

# Q: How does PILOT 001D implement public product entry without weakening Academy security?

## Answer

Public browser routes use the centralized same-origin /backend client. POST /auth/signup creates only User, Credential, Session and hashed signup-attempt metadata. Authenticated POST /academies transactionally creates the Academy and OWNER membership. Invitation acceptance preserves the exact stored role and creates a session for new invited users. Root routing derives onboarding and Academy destinations from authenticated memberships; no browser-supplied membership grants authority. Migration 017 and security integration tests cover the persistence and authorization boundaries.

## Outcome

- Signal: useful