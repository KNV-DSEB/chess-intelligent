# Canonical game reconciliation

## Canonical game lifecycle

A canonical `Game` represents one real-world chess game. It is not a provider row and it does not own a single immutable source. Two orthogonal fields describe its lifecycle:

- `content_status`: `METADATA_ONLY` or `MOVES_AVAILABLE`;
- `verification_status`: `UNVERIFIED`, `VERIFIED`, or `CONFLICTED`.

The legacy `pgn_status` remains populated for Task 001 compatibility, but new logic uses the orthogonal statuses. A metadata-only game is valid with zero moves, zero positions, no PGN fingerprint, and no raw PGN.

## Observations and authoritative values

Canonical fields (`event`, date, round, result, context, and players) are the current normalized view. `GameSourceRecord` rows are immutable historical observations and are typed `METADATA` or `PGN`. They retain raw metadata or raw PGN plus source, permission, retrieval/import time, provider game/tournament IDs, and reconciliation evidence.

Reviewed PGN attachment applies a conservative merge policy:

1. Existing non-null canonical metadata wins over PGN headers.
2. A PGN may fill missing canonical values.
3. An unknown result (`*`) may be replaced by a decisive/drawn PGN result after successful review.
4. Verified FIDE identities and metadata player observations are never replaced by PGN names.
5. Original source records are never edited or collapsed.

This prevents a sparse PGN from erasing stronger tournament metadata while keeping every observation auditable.

## Candidate identity is not identity proof

Metadata ingestion derives a deterministic `metadata-candidate:v1` representation from FIDE IDs when supplied, date, normalized event/tournament ID, round, board, and result. The database indexes it but does not make it unique and does not deduplicate on it. Missing or inconsistent provider metadata can make identical games produce different keys, and repeated tournament fixtures can look deceptively alike.

## Matching rules

Candidate discovery searches metadata-only games by date, event, player identity, and exact normalized names. The deterministic domain service then classifies each plausible game:

- `EXACT_MATCH`: the same source/provider external game ID is present and no conflict exists.
- `HIGH_CONFIDENCE_MATCH`: both verified FIDE IDs match in the same colors and at least two fixture fields (date, result, event, round, board) match exactly.
- `AMBIGUOUS_MATCH`: both normalized names plus at least two fixture fields match, but verified identity evidence is absent. Ambiguous matches cannot attach through the current endpoint.
- `CONFLICT`: strong/plausible fixture evidence exists but result, date, player FIDE IDs, or colors conflict.
- `NO_MATCH`: evidence is insufficient; the candidate is omitted from the API response.

No approximate string distance, probabilistic identity model, AI, or LLM participates. Explanations list deterministic matched fields, conflicting fields, and fixed reasons.

## Reviewed attachment

`POST /games/reconcile-pgn` is read-only. `POST /games/:id/attach-pgn` is an explicit mutation and requires the reviewer to echo the expected `EXACT_MATCH` or `HIGH_CONFIDENCE_MATCH` classification. The server reparses the PGN and reruns reconciliation; it never trusts a previous browser response.

Attachment locks the canonical game and transactionally inserts positions, moves, canonical lifecycle changes, and a new PGN source observation. A failure rolls everything back. Reattaching the same fingerprint returns `already_attached`; a different move fingerprint, a conflicting/ambiguous candidate, a stale classification, or a fingerprint owned by another canonical game returns a conflict without mutation.

## False-negative preference

Names are observations, not identity keys. Equal names without a shared verified identity remain separate players and can produce only ambiguous evidence. If the system cannot prove or review a safe link, it preserves separate records. A missed merge is recoverable; a false merge corrupts every downstream corpus and analysis.

## Provider boundary

Future authorized providers must map provider DTOs into the metadata-ingestion contract. Provider HTML or response formats never flow directly into canonical tables:

```text
Authorized provider adapter → provider DTO → OTB metadata normalizer → canonical ingestion
```

Chess-Results remains disabled pending documented permission. Task 002 performs no external requests.
