---
type: "path_query"
date: "2026-09-10T16:31:55.107337+00:00"
question: "Trace Task 016 classifier bundle V2 facts through persisted concept evidence, Skill Graph aggregation, adaptive training candidates, and immutable TrainingItems."
contributor: "graphify"
outcome: "useful"
source_nodes: ["detectTacticalMoveFacts()", "ConceptClassifierBundleVersion", "PlayerSkillGraphRepository", "TrainingApplicationService", "TrainingItemRecord"]
---

# Q: Trace Task 016 classifier bundle V2 facts through persisted concept evidence, Skill Graph aggregation, adaptive training candidates, and immutable TrainingItems.

## Answer

Validated boundary: detectTacticalMoveFacts in chess-core is imported by training-application, which also imports TrainingItemRecord; classification version is pinned by ConceptClassifierBundleVersion, persisted evidence is consumed by PlayerSkillGraphRepository, and TrainingApplicationService materializes only registry-supported V2 concepts after exact-history fact re-detection. No classifier-to-training direct mutation path exists.

## Outcome

- Signal: useful

## Source Nodes

- detectTacticalMoveFacts()
- ConceptClassifierBundleVersion
- PlayerSkillGraphRepository
- TrainingApplicationService
- TrainingItemRecord