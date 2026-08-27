# Task 002 implementation plan

1. Add a forward-only migration that separates game content from verification status, types provenance observations as metadata or PGN, stores candidate-search evidence, and adds focused reconciliation indexes without changing Task 001 records destructively.
2. Extend domain contracts and PGN normalization with FIDE identity observations, metadata candidate identities, deterministic reconciliation classifications, evidence, conflicts, and reasons.
3. Implement transactional metadata ingestion that preserves the raw payload, reuses players only through FIDE identities, and creates valid canonical games without positions or moves.
4. Implement candidate discovery and a rule-based reconciliation service outside HTTP routes, preferring no match or explicit conflict over unsafe name-based merging.
5. Implement reviewed PGN attachment that reruns matching, rejects stale/weak/conflicting evidence, preserves canonical metadata and prior provenance, inserts moves atomically, and handles repeated/different attachments safely.
6. Add metadata entry, reconciliation, attachment, and metadata-aware detail UI routes with explicit review before mutation.
7. Add end-to-end and focused tests for validation, identity reuse/name safety, classifications, attachment/provenance/idempotency/conflicts, and rollback; update architecture and developer documentation.
8. Run formatting, lint, strict type checking, tests, production build, clean and upgrade migrations, acceptance HTTP smoke checks, and a final file/secret audit using D: for temporary storage where needed.
