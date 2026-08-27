CREATE TABLE ontology_versions (
  id UUID PRIMARY KEY,
  version TEXT NOT NULL UNIQUE CHECK (version ~ '^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$'),
  status TEXT NOT NULL CHECK (status = 'PUBLISHED'),
  content_sha256 CHAR(64) NOT NULL CHECK (content_sha256 ~ '^[a-f0-9]{64}$'),
  published_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ontology_versions_published_idx
  ON ontology_versions (published_at DESC, version DESC)
  WHERE status = 'PUBLISHED';

CREATE TABLE concept_identities (
  stable_id TEXT PRIMARY KEY CHECK (
    stable_id ~ '^[a-z][a-z0-9]*(_[a-z0-9]+)*(\.[a-z][a-z0-9]*(_[a-z0-9]+)*)+$'
  ),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE concept_definitions (
  ontology_version_id UUID NOT NULL REFERENCES ontology_versions(id) ON DELETE RESTRICT,
  concept_stable_id TEXT NOT NULL REFERENCES concept_identities(stable_id) ON DELETE RESTRICT,
  display_name TEXT NOT NULL,
  short_description TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN (
    'DOMAIN', 'SKILL', 'PRINCIPLE', 'MOTIF', 'TECHNIQUE', 'STRUCTURE'
  )),
  difficulty TEXT NOT NULL CHECK (difficulty IN (
    'FOUNDATIONAL', 'BASIC', 'INTERMEDIATE', 'ADVANCED', 'EXPERT'
  )),
  status TEXT NOT NULL CHECK (status IN ('ACTIVE', 'DEPRECATED')),
  aliases JSONB NOT NULL CHECK (jsonb_typeof(aliases) = 'array'),
  replacement_concept_ids JSONB NOT NULL CHECK (jsonb_typeof(replacement_concept_ids) = 'array'),
  notes TEXT,
  PRIMARY KEY (ontology_version_id, concept_stable_id)
);

CREATE INDEX concept_definitions_version_kind_idx
  ON concept_definitions (ontology_version_id, kind, concept_stable_id);
CREATE INDEX concept_definitions_stable_version_idx
  ON concept_definitions (concept_stable_id, ontology_version_id);

CREATE TABLE concept_relationships (
  ontology_version_id UUID NOT NULL REFERENCES ontology_versions(id) ON DELETE RESTRICT,
  relationship_type TEXT NOT NULL CHECK (relationship_type IN (
    'PARENT_OF', 'PREREQUISITE_OF'
  )),
  from_concept_stable_id TEXT NOT NULL,
  to_concept_stable_id TEXT NOT NULL,
  PRIMARY KEY (
    ontology_version_id, relationship_type,
    from_concept_stable_id, to_concept_stable_id
  ),
  FOREIGN KEY (ontology_version_id, from_concept_stable_id)
    REFERENCES concept_definitions(ontology_version_id, concept_stable_id) ON DELETE RESTRICT,
  FOREIGN KEY (ontology_version_id, to_concept_stable_id)
    REFERENCES concept_definitions(ontology_version_id, concept_stable_id) ON DELETE RESTRICT,
  CHECK (from_concept_stable_id <> to_concept_stable_id)
);

CREATE INDEX concept_relationships_from_idx
  ON concept_relationships (ontology_version_id, relationship_type, from_concept_stable_id);
CREATE INDEX concept_relationships_to_idx
  ON concept_relationships (ontology_version_id, relationship_type, to_concept_stable_id);

CREATE TABLE evidence_type_definitions (
  ontology_version_id UUID NOT NULL REFERENCES ontology_versions(id) ON DELETE RESTRICT,
  stable_id TEXT NOT NULL CHECK (
    stable_id ~ '^[a-z][a-z0-9]*(_[a-z0-9]+)*(\.[a-z][a-z0-9]*(_[a-z0-9]+)*)+$'
  ),
  display_name TEXT NOT NULL,
  description TEXT NOT NULL,
  source_class TEXT NOT NULL CHECK (source_class IN (
    'ENGINE', 'POSITION_RULE', 'DECISION_CLASSIFIER', 'TRAINING',
    'COACH', 'ASSESSMENT', 'GAME'
  )),
  allowed_polarities JSONB NOT NULL CHECK (jsonb_typeof(allowed_polarities) = 'array'),
  PRIMARY KEY (ontology_version_id, stable_id)
);

CREATE INDEX evidence_type_definitions_version_source_idx
  ON evidence_type_definitions (ontology_version_id, source_class, stable_id);

CREATE TABLE concept_evidence_policies (
  ontology_version_id UUID NOT NULL REFERENCES ontology_versions(id) ON DELETE RESTRICT,
  concept_stable_id TEXT NOT NULL,
  evidence_type_stable_id TEXT NOT NULL,
  evidence_role TEXT NOT NULL CHECK (evidence_role IN ('DIRECT', 'SUPPORTING', 'CONTEXTUAL')),
  rationale TEXT NOT NULL,
  PRIMARY KEY (ontology_version_id, concept_stable_id, evidence_type_stable_id),
  FOREIGN KEY (ontology_version_id, concept_stable_id)
    REFERENCES concept_definitions(ontology_version_id, concept_stable_id) ON DELETE RESTRICT,
  FOREIGN KEY (ontology_version_id, evidence_type_stable_id)
    REFERENCES evidence_type_definitions(ontology_version_id, stable_id) ON DELETE RESTRICT
);

CREATE INDEX concept_evidence_policies_concept_idx
  ON concept_evidence_policies (ontology_version_id, concept_stable_id, evidence_role);
CREATE INDEX concept_evidence_policies_evidence_idx
  ON concept_evidence_policies (ontology_version_id, evidence_type_stable_id);

-- Published ontology rows are written only by the immutable source sync. The application exposes
-- no editing endpoint; future evidence will reference (concept_stable_id, ontology version).
