DROP INDEX game_source_external_id_unique_idx;

CREATE INDEX game_source_external_id_idx
  ON game_source_records (data_source_id, external_id)
  WHERE external_id IS NOT NULL;

-- Provider external IDs are reconciliation evidence, not provenance-record identities. Repeated
-- observations may legally carry the same external ID and must remain auditable as separate imports.
