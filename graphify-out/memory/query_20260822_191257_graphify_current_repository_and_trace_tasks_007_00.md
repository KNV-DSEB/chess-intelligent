---
type: "query"
date: "2026-08-22T19:12:57.083487+00:00"
question: "Graphify current repository and trace Tasks 007-008 paths to validate the Task 009 implementation plan."
contributor: "graphify"
outcome: "useful"
source_nodes: ["ConceptClassificationApplicationService", "ClassificationRepository", "concept_classification_runs", "concept_evidence_instances", "OntologyRepository", "ConceptEvidencePanel"]
---

# Q: Graphify current repository and trace Tasks 007-008 paths to validate the Task 009 implementation plan.

## Answer

Expanded from original query via graph vocab: [player, classification, concept, evidence, ontology, policy, game, persistence, application, panel, migration, version]. Graph trace shows classification runs are game-scoped; player attribution is on DECISION evidence through game_players; ontology version and evidence-policy role are immutable dependencies; persistence flows classifyGame -> persistSuccessfulRun -> insertEvidence; API/UI expose game/run evidence only; migrations 008 and 009 establish ontology and immutable evidence. Task 009 should add a separate immutable, versioned player aggregation layer with explicit coverage and lineage, selecting one compatible classification run per game and never rewriting Task 008 evidence.

## Outcome

- Signal: useful

## Source Nodes

- ConceptClassificationApplicationService
- ClassificationRepository
- concept_classification_runs
- concept_evidence_instances
- OntologyRepository
- ConceptEvidencePanel