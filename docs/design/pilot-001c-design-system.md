# Pilot 001C design system

## Direction

The Pilot experience uses a **master-game folio**: warm paper, a deep-forest authority rail, amber
pencil annotations, score-sheet rows, and chess positions as the primary evidence surface. It
should feel like serious academy work, not a generic analytics dashboard.

## Tokens

- Canvas `#f2eee3`, paper `#fffdf6`, ink `#17231c`, soft ink `#4d5d52`.
- Forest `#1d5a42` for primary action and deep forest `#102d22` for authority surfaces.
- Amber `#a76522` and amber wash `#f5e6ca` for annotation and review attention.
- One subtle and one elevated shadow; borders and shadows are not combined as decoration.
- A 4/8px spacing rhythm, 10–16px surface radii, and 44px minimum control height.
- Editorial serif headings and a quiet sans body. No remote font request is required at runtime.

## Components

- **Focus ledger:** operational signals in rows, never a mastery leaderboard.
- **Evidence funnel:** games → decisions → classified → engine-verified → model-eligible →
  training results. Every stage exposes a numerator rather than a vague confidence graphic.
- **Priority row:** concept, explicit evidence state, reason, evidence action, and optional coach
  feedback. No inferred psychology or weakness label.
- **Skill domain:** expandable ontology domain containing concepts with distinct
  `SYSTEM_UNSUPPORTED`, `NO_EVIDENCE`, `INSUFFICIENT_EVIDENCE`, and `ESTIMATED` language.
- **Evidence folio:** exact stored position, move context, classifier meaning, compatible engine
  provenance, and advanced exact IDs.
- **Training position:** board first, one move commitment, private answer before attempt, and
  provenance after the learning action.
- **Optional AI explanation:** collapsed and absent from primary navigation; structured evidence
  remains useful when the provider is disabled.

## Interaction and accessibility

Controls retain visible text, semantic HTML, 44px targets, visible 3px focus, predictable back
links, a skip link, native details/select/input behavior, and reduced-motion support. State always
uses text in addition to color. Desktop, tablet, and 390px phone layouts use the same content order
without horizontal overflow.

## Copy contract

Use learner language in the primary view: “learning picture,” “verified decision,” “diagnostic,”
“practice,” and “evidence.” Put run IDs, hashes, ontology/policy configuration, and evidence roles
inside advanced provenance disclosures. Missing evidence is unknown; activity is not learning
effectiveness; an estimate movement is not automatically improvement or regression.
