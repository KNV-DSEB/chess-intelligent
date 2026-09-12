---
type: "query"
date: "2026-09-12T09:57:25.243917+00:00"
question: "Trace the existing GHCR publication path from tag workflow through production Docker build artifacts, API and Worker runtimes, Stockfish boundary, Compose deployment, and Pilot release manifest."
contributor: "graphify"
outcome: "useful"
source_nodes: ["deployment-runbook.md", "Pilot 001 release manifest", "api/package.json", "worker", "StockfishUciEngine", "ChessEngine", "sha256File()", "task015-runtime-fault-gate.mjs"]
---

# Q: Trace the existing GHCR publication path from tag workflow through production Docker build artifacts, API and Worker runtimes, Stockfish boundary, Compose deployment, and Pilot release manifest.

## Answer

Expanded from original query via graph vocab: [workflow, github, docker, build, artifact, api, worker, stockfish, runtime, compose, deployment, manifest]. DFS confirms the operational path anchors at deployment-runbook.md and the Pilot 001 release manifest; the API package exposes its compiled build script; the Worker runtime connects worker.ts to StockfishUciEngine and the engine-neutral ChessEngine contract; StockfishUciEngine hashes the executable through sha256File; Task 015 runtime/Compose gates remain the production-topology verification boundary. Direct file inspection is still required because Dockerfile and workflow bodies are not fully represented in this traversal.

## Outcome

- Signal: useful

## Source Nodes

- deployment-runbook.md
- Pilot 001 release manifest
- api/package.json
- worker
- StockfishUciEngine
- ChessEngine
- sha256File()
- task015-runtime-fault-gate.mjs