# Chess concept authoring guide

This guide governs changes to the canonical source under `ontology/chess`. Published ontology versions are immutable; edit by creating a new semantic-version file, never by rewriting a version that has been synchronized.

## Before adding a concept

Confirm that the proposed item is one teachable chess meaning rather than a label for a player, rating band, UI section, raw metric, engine result, or lesson. Search stable IDs, display names, and aliases in the current source. Prefer adding an alias to a genuine synonym; do not create two concepts whose evidence and instruction would be indistinguishable.

Choose the smallest applicable kind:

- `DOMAIN` for one of the top-level curriculum groupings;
- `SKILL` for a repeatable cognitive or practical capability;
- `PRINCIPLE` for a broadly applicable decision rule;
- `MOTIF` for a recognizable tactical or positional pattern;
- `TECHNIQUE` for an executable method;
- `STRUCTURE` for a recurring board or pawn configuration.

Difficulty (`FOUNDATIONAL`, `BASIC`, `INTERMEDIATE`, `ADVANCED`, `EXPERT`) expresses instructional sequencing. It must never contain or imply minimum Elo, maximum Elo, recommended rating, or player mastery.

## Stable ID rules

Use a lowercase, namespaced ID whose segments contain letters, digits, and internal underscores: `domain.pawn_structure`, `pawn_structure.isolated_pawn`, or `endgame.rook_behind_passed_pawn`.

- Do not put a version, display wording, locale, rating, or implementation name in the ID.
- Do not rename an ID when only the display label or description changes.
- If meaning changes incompatibly, create a new ID, deprecate the old definition in the new ontology version, and add the new ID to `replacementConceptIds`.
- Never delete an identity from historical versions.
- Persist analytical references with stable ID plus ontology version, never display name alone.

## Hierarchy and prerequisites

Give every non-domain concept exactly one `PARENT_OF` incoming edge. Follow that edge upward and verify it reaches a `domain.*` concept. The primary parent answers “where should this be browsed and taught?” Cross-cutting learning dependencies belong in `PREREQUISITE_OF`, not a second parent.

Write a prerequisite edge from the required concept to the dependent concept. Add only meaningful instructional dependencies, not every related idea. Both graphs must stay acyclic. Review any validation warning where a prerequisite has a higher difficulty than its dependent.

## Evidence policy authoring

Evidence types describe producer contracts; they do not store observations. Reuse an existing evidence type when the same producer and semantics apply. For a new type, choose the truthful source class and enumerate valid polarity values.

Every concept/evidence policy must explain why the source is admissible and choose the narrowest truthful role:

- Use `DIRECT` only when that evidence can establish the concept under a deterministic or versioned producer contract.
- Use `SUPPORTING` when a separate source or review is still necessary.
- Use `CONTEXTUAL` when the signal establishes consequence, importance, or surrounding conditions only.

Never use generic evaluation loss or severe evaluation loss as direct proof of a specific concept. An engine can show that a move changed the objective position; it cannot by itself identify a tactical motif, failed thought process, strategic misunderstanding, or time-management issue. LLM output cannot introduce or override an evidence policy.

Every active leaf needs at least one `DIRECT` or `SUPPORTING` policy. Do not add placeholder policies merely to pass validation; if no credible observation path exists, the concept is not ready for publication.

## Publication workflow

1. Copy the latest canonical JSON to the intended semantic version.
2. Make the smallest coherent vocabulary, graph, or policy change.
3. Run `pnpm ontology:validate path/to/version.json` and resolve every error; review every warning.
4. Add fixtures for the new identity, traversal, deprecation, and evidence behavior.
5. Run `pnpm check` and the production web build.
6. Review the source and canonical hash in code review.
7. Run `pnpm ontology:sync path/to/version.json` against the target database.
8. Confirm the version through `GET /ontology/versions` and inspect representative concepts in `/ontology`.

Use a patch version for compatible corrections or additions, a minor version for a meaningful compatible expansion, and a major version for a broad contract change requiring downstream migration. Regardless of the increment, changing any published content requires a new version.

## Review checklist

- The stable ID is unique, correctly namespaced, and semantically durable.
- Similar concepts were consolidated or explicitly distinguished.
- One primary parent exists and both graphs remain acyclic.
- Prerequisites express teaching dependency and have reviewed difficulty.
- Description and aliases are concise and non-overlapping.
- Deprecation names valid replacements where appropriate.
- Evidence roles and polarities are explicit, conservative, and justified.
- No Elo, mastery, weakness, psychology, recommendation, or player-specific state was added.
- Tests cover the change and the canonical hash is accepted only under a new version.
