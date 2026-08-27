---
type: "query"
date: "2026-08-27T07:40:14.668733+00:00"
question: "Fix GitHub Actions pnpm check formatting failure shown in the attached screenshot"
contributor: "graphify"
outcome: "useful"
source_nodes: ["format", "prettier", ".prettierrc.json", "web/package.json", "pnpm Workspace"]
---

# Q: Fix GitHub Actions pnpm check formatting failure shown in the attached screenshot

## Answer

Expanded from original query via graph vocab: [prettier, format, check, graph, next, config, prettierrc, workflow, web, file, workspace, typecheck]. The CI failure occurs because root prettier --check scans generated apps/web/next-env.d.ts and portable Graphify output artifacts. The durable fix is to add apps/web/next-env.d.ts and graphify-out/ to .prettierignore; application source formatting is unaffected. Direct source inspection of .prettierignore, package.json, apps/web/package.json, and .github/workflows/ci.yml is authoritative because dynamic ignore/glob relationships are incomplete in the graph.

## Outcome

- Signal: useful

## Source Nodes

- format
- prettier
- .prettierrc.json
- web/package.json
- pnpm Workspace