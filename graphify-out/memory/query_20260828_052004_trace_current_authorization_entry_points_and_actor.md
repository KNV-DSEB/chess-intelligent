---
type: "query"
date: "2026-08-28T05:20:04.500439+00:00"
question: "Trace current authorization entry points and actor identity paths before Task 012"
contributor: "graphify"
outcome: "useful"
source_nodes: ["buildApp()", "app.ts", "External Data Authorization Rule"]
---

# Q: Trace current authorization entry points and actor identity paths before Task 012

## Answer

Expanded via graph vocab: [authorization, identity, request, role, player, evidence, application, repository, api, fastify, workflow, boundary]. DFS found buildApp and app.ts as the HTTP composition boundary but the current graph predates Task 011 and contains no Academy, membership, session, or StudentProfile vocabulary, so direct source inspection is required for Task 012 security tracing.

## Outcome

- Signal: useful

## Source Nodes

- buildApp()
- app.ts
- External Data Authorization Rule