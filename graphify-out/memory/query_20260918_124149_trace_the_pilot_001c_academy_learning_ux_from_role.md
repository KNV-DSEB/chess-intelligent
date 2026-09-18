---
type: "query"
date: "2026-09-18T12:41:49.709215+00:00"
question: "Trace the Pilot 001C Academy learning UX from role-aware navigation through Student Intelligence, evidence, Skill Map, assignments, progress, and board-first training."
contributor: "graphify"
outcome: "useful"
source_nodes: ["SessionNavigation()", "TrainingAssignmentProgress", "IntelligenceResponse", "ProgressConceptState", "AcademyRepository", "TrainingRepository"]
---

# Q: Trace the Pilot 001C Academy learning UX from role-aware navigation through Student Intelligence, evidence, Skill Map, assignments, progress, and board-first training.

## Answer

Expanded from original query via graph vocab: [academy, student, intelligence, skill, evidence, training, assignment, progress, session, navigation, chess, position]. The role-aware Web entry is SessionNavigation() in apps/web/app/session-navigation.tsx. Coach and Student overview surfaces consume Academy application projections; Student Intelligence renders the structured evidence and Skill Graph projections, evidence drilldown reuses existing game and immutable analysis-run reads, assignment pages consume TrainingAssignmentProgress, and board-first training continues through the existing TrainingRepository/application boundary. The reconstruction changes presentation only: no API, domain, database, evidence-policy, authorization, or queue semantics were changed.

## Outcome

- Signal: useful

## Source Nodes

- SessionNavigation()
- TrainingAssignmentProgress
- IntelligenceResponse
- ProgressConceptState
- AcademyRepository
- TrainingRepository