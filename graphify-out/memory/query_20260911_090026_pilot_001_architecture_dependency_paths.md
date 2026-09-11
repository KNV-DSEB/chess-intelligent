---
type: "path_query"
date: "2026-09-11T09:00:26.651757+00:00"
question: "Pilot 001 architecture dependency paths"
contributor: "graphify"
outcome: "useful"
source_nodes: ["buildApp()", "PilotRepository", ".recordClientEvent()", ".exportMetrics()", "pilotMetric()", "OpenAiGroundedLanguageModel", "GroundedLanguageModel", "GroundedAiRepository", "derivePilotStudentReadiness()"]
---

# Q: Pilot 001 architecture dependency paths

## Answer

Expanded from repository graph vocab: [pilot,event,append,repository,migration,metric,feedback,academy,student,grounded,brief,snapshot,validate,artifact,claim,language,model]. Verified paths: buildApp calls PilotRepository and recordClientEvent; PilotRepository exportMetrics calls domain pilotMetric; migration 016 owns append-only pilot_events; OpenAiGroundedLanguageModel implements GroundedLanguageModel, which app.ts composes with GroundedAiRepository; buildApp reaches studentReadiness and derivePilotStudentReadiness. Source proof: apps/api/src/app.ts, apps/api/src/pilot-application.ts, packages/db/src/pilot-repository.ts, packages/db/migrations/016_private_academy_pilot.sql, apps/api/src/openai-grounded-language-model.ts, apps/api/src/grounded-ai-application.ts, packages/db/src/grounded-ai-repository.ts, packages/domain/src/pilot.ts.

## Outcome

- Signal: useful

## Source Nodes

- buildApp()
- PilotRepository
- .recordClientEvent()
- .exportMetrics()
- pilotMetric()
- OpenAiGroundedLanguageModel
- GroundedLanguageModel
- GroundedAiRepository
- derivePilotStudentReadiness()