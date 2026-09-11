# Task 016 UI review

## Direction

The pilot experience uses an evidence-led academy workspace: warm paper canvas, dark forest
authority surface, amber uncertainty accents, compact typography, and restrained motion. It keeps
the incumbent product identity instead of adopting generic AI-purple styling from the initial
design-system search.

## Hierarchy

Coach: Player identity → coverage → priorities → Skill Map → grounded brief → recent change →
next actions → subordinate opening context → exact evidence drill-down.

Student: next assigned training → why it is selected → supported Skill Map → optional grounded
brief. Technical identifiers are hidden until evidence detail is requested.

## Required state language

- Not yet supported: ontology exists, classifier does not.
- No evidence yet: classifier supports it, selected scope has no eligible evidence.
- Early signal: evidence exists but is insufficient.
- Evidence estimate: posterior is shown with explicit confidence.

## Review findings and resolution

- Dense equal-weight cards were replaced by ordered priority rows and a smaller support matrix.
- AI was moved into a dark, clearly bounded side rail with validation/provenance copy.
- Opening analytics was demoted to context.
- Coach assignment controls remain below intelligence and retain immutable-plan semantics.
- Student training moved ahead of analytics.
- Controls use visible focus, 44px targets, text labels, reduced-motion handling, and mobile
  single-column fallbacks.
- Assignment progress consumes the API's exact `completedItemCount` / `itemCount` contract and
  names each action by measurement mode plus concept.
- AI claims render every validated evidence reference; exact concept/training references open the
  Academy-scoped lineage drill-down.
- Loading, provider/dependency failure, genuine no-evidence, and unsupported-system states remain
  visually and semantically distinct.
- Global navigation is membership-aware and switches to the Student surface inside an exact
  `/academy/:academyId/my` context, including for users with a different operational membership.

Responsive review targets are 1440×900, 1024×768, and 390×844. Browser evidence and any remaining
limitations are recorded in the Task 016 completion report. The final Chrome 136 gate passed 12
captures with zero citation, navigation-contract, assignment-contract, overflow, keyboard,
runtime, console, or network failures. The independent Impeccable finish review reported `READY`
with no blocker or P1 finding remaining.
