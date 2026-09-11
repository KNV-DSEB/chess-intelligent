# Grounded AI briefing architecture

## Boundary

GroundedLanguageModel is the only provider boundary. Core product operation has no AI provider
dependency. With no provider, briefing routes return AI_UNAVAILABLE while intelligence, training,
assignments, and evidence remain available.

## Context

GROUNDED_BRIEF_CONTEXT_V1 contains only:

- Academy, StudentProfile, and Player identifiers required for scope validation;
- one explicit immutable SkillGraphRun and optional exactly pinned TrainingPlan;
- explicit ontology/classifier/policy/as-of identities;
- coverage denominators;
- a bounded set of supported concept states;
- exact permitted Skill Graph, concept evidence, training evidence, plan, and coverage references.

Names, credentials, raw tokens, coach notes, raw PGNs, and unrelated Academy data are excluded.

## Output validation

GROUNDED_BRIEF_ARTIFACT_V1 permits four claim types: current priority, evidence limitation,
recent change, and next action. Every claim requires permitted evidence references. The validator
rejects unknown concepts, foreign references, missing grounding, confidence above source
confidence, psychology, weakness/strength language, guarantees, and best-move authority.

Provider failure and invalid output persist nothing. Only validated output and its exact input
snapshot are inserted into the append-only grounded_ai_artifacts table. The artifact preserves
versions, provider/model, snapshot hash, usage, latency, Academy/Student/Player scope, and source
run identities.

## Tenant and truth safety

Coach generation requires same-Academy STUDENT_INTELLIGENCE_READ. Student generation derives
User → active Student membership → StudentProfile → Player, enforces the consent gate, and never
accepts a browser-supplied Player. Coach and Student contexts share evidence truth; only audience
wording may differ. AI cannot write chess, concept, mastery, training, assignment, or security
tables.
