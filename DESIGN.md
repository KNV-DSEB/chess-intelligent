# Chess Intelligent design system

## Product character

Calm academy authority, evidence before opinion, and serious chess without database-software
clutter. The interface should feel trustworthy to a coach and approachable to a student.

## Tokens

- Canvas #f2efe7, paper #fffdf8, ink #17211b, soft ink #425248.
- Forest #175b3b for primary action; deep forest #113b29 for authority surfaces.
- Amber wash for uncertainty/change; plum wash for unsupported-system states.
- 4/8px spacing rhythm; radii 8/14/22px; shadows only for hierarchy.
- System sans body and Space Grotesk-compatible heading stack; no runtime font dependency.

## Components

- Priority rows carry rank, concept, evidence state, explanation, and one quiet action.
- Skill cells distinguish support/evidence states with both text and color.
- Grounded brief is a visually bounded explanation surface with claim type, confidence, citation
  count, limitations, and artifact proof.
- Evidence drawer reveals exact game/training lineage only on request.
- Coverage tables may scroll horizontally on mobile; operational workflows become single-column.

## Interaction and accessibility

Primary controls are at least 44px high, keyboard focus is visible, controls have text labels,
headings are sequential, status/error updates use semantic roles, and reduced motion disables
nonessential transitions. Color never carries state alone. No autoplay or gesture-only behavior.

## Content rules

Say “not yet supported,” “no evidence yet,” “early signal,” or “evidence estimate.” Never use
weakness, strength, psychology, guaranteed improvement, or best-move language in AI explanations.
