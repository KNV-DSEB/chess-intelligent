# Pilot 001C UX review

## Result

`PILOT_UX_V2_READY_WITH_NON_BLOCKING_RISKS`

This is a source and local-browser UX status, not a deployed Pilot, product-market-fit, or learning
effectiveness claim.

## Baseline audit

### P0

- None found in the source/local browser reconstruction boundary.

### P1

- Coach Home required a raw Academy ID and manual roster load before showing useful work.
- Internal identifiers, policy names, hashes, and artifact language dominated the first viewport.
- Student Training opened with a FIDE/Skill Graph developer workflow before the assigned position.
- Evidence detail was lineage-correct but did not show the exact board, nearby moves, or engine
  interpretation in one place.

### P2

- Coach navigation mixed core academy work with research/admin tools at equal weight.
- Skill Map was a flat supported-concept wall and hid the unsupported remainder of the ontology.
- AI occupied a primary dark side rail even when disabled.
- Student Home exposed concept stable IDs and learning-system vocabulary.
- Assignment and progress screens emphasized immutable artifact IDs before human decisions.

### P3

- Login lacked password visibility control and a clear product identity.
- Browser focus styling, selection, scrollbars, and reduced motion were not one coherent system.
- Tablet/mobile layout worked technically but inherited desktop hierarchy and excess vertical
  density.

## Implemented reconstruction

- Role-aware Coach and Student navigation with research/admin tools demoted.
- Auto-loaded Coach Home with focus ledger, roster search, assignments, and neutral progress.
- Student Intelligence reordered around identity, evidence coverage, priorities, exact evidence,
  recommended action, training, and comparable progress.
- Grouped 64-concept Skill Map with explicit capability/evidence states.
- Chess-native evidence folio using existing canonical Game, exact occurrence, Task 008 lineage,
  and Task 004 analysis data.
- Assignment-first Student Today and direct TrainingItem entry that hides developer setup.
- Optional collapsed AI explanation with unchanged grounding/validation behavior.
- Shared board renderer and one responsive visual system across the core Pilot loop.

## Browser evidence

The deterministic acceptance fixture uses PGlite only for local UX/browser acceptance and makes no
production claim. The confirmation run captured 37 screenshots at 1440×900, 1024×768, and 390×844.
It reported zero horizontal-overflow failures, zero keyboard-smoke failures, zero console
exceptions/errors, and zero non-aborted request failures for anonymous, Coach, and Student browser
contexts.

Screenshots are ignored review artifacts under `.impeccable/review/pilot-001c-final/`.

## Security and semantic review

- Existing Academy/session/role/consent endpoints remain unchanged.
- Coach and Student continue to use separate protected route families.
- Normal pre-attempt responses still do not expose accepted moves.
- Pilot event names and server/client ownership remain unchanged; no duplicate open event was added.
- Missing classification/engine evidence remains unknown and never becomes negative evidence.
- Assignment completion and first-attempt correctness remain activity/measurement, not learning
  effectiveness.

## Non-blocking risks

- The interface uses a local editorial system-font stack rather than adding a new font asset during
  release freeze.
- Student move entry is now explained in square-to-square language but remains text-based; a future
  drag/click board interaction requires product evidence and is outside this blocker-only release.
- Deployed HTTPS, same-origin session behavior, transactional email, and the real four-role matrix
  remain Pilot 001B launch gates and are not proven by local screenshots.
