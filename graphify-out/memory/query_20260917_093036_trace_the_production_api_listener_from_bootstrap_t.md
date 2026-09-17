---
type: "query"
date: "2026-09-17T09:30:36.289984+00:00"
question: "Trace the production API listener from bootstrap through environment configuration and identify why Railway binds to loopback instead of PORT."
contributor: "graphify"
outcome: "useful"
source_nodes: ["server.ts", "config/src/index.ts", "readApiEnvironment()", "apiEnvironmentSchema", "fastify"]
---

# Q: Trace the production API listener from bootstrap through environment configuration and identify why Railway binds to loopback instead of PORT.

## Answer

Expanded from original query via graph vocab: [api, server, port, config, fastify, bootstrap, runtime, environment]. Graph traversal identified apps/api/src/server.ts and packages/config/src/index.ts. Direct inspection confirmed server.ts passes environment.API_HOST and environment.API_PORT to Fastify; readApiEnvironment defaults API_HOST to 127.0.0.1 and API_PORT to 4000, while process.env.PORT is not consumed. Railway therefore receives a loopback-only listener unless API_HOST is supplied explicitly.

## Outcome

- Signal: useful

## Source Nodes

- server.ts
- config/src/index.ts
- readApiEnvironment()
- apiEnvironmentSchema
- fastify