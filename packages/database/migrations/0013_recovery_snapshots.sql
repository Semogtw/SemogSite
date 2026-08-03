PRAGMA foreign_keys = ON;

CREATE TABLE recovery_snapshots (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL
    REFERENCES projects(id) ON DELETE RESTRICT,
  repository_id TEXT NOT NULL
    REFERENCES repositories(id) ON DELETE RESTRICT,
  run_id TEXT
    REFERENCES cooperative_runs(id) ON DELETE SET NULL,
  branch TEXT NOT NULL CHECK (length(trim(branch)) BETWEEN 1 AND 255),
  observed_commit_sha TEXT NOT NULL CHECK (
    length(observed_commit_sha) = 40
    AND observed_commit_sha NOT GLOB '*[^0-9a-f]*'
  ),
  schema_version INTEGER NOT NULL CHECK (schema_version = 1),
  generated_at TEXT NOT NULL,
  source_observed_at TEXT NOT NULL,
  confidence TEXT NOT NULL CHECK (confidence IN ('high', 'medium', 'low')),
  canonical_json TEXT NOT NULL CHECK (
    json_valid(canonical_json) AND json_type(canonical_json) = 'object'
  ),
  canonical_hash TEXT NOT NULL UNIQUE CHECK (
    length(canonical_hash) = 64
    AND canonical_hash NOT GLOB '*[^0-9a-f]*'
  ),
  markdown TEXT NOT NULL CHECK (length(markdown) BETWEEN 1 AND 20000),
  template_id TEXT NOT NULL CHECK (length(trim(template_id)) BETWEEN 1 AND 200),
  template_version INTEGER NOT NULL CHECK (template_version >= 1),
  created_by TEXT NOT NULL CHECK (length(trim(created_by)) BETWEEN 1 AND 200),
  source TEXT NOT NULL CHECK (source IN ('manual', 'agent')),
  idempotency_key TEXT NOT NULL CHECK (
    length(trim(idempotency_key)) BETWEEN 1 AND 200
  ),
  correlation_id TEXT NOT NULL CHECK (
    length(trim(correlation_id)) BETWEEN 1 AND 200
  ),
  CHECK (source_observed_at <= generated_at),
  UNIQUE (created_by, idempotency_key)
);

CREATE INDEX idx_recovery_snapshots_repository
  ON recovery_snapshots(repository_id, generated_at DESC);

CREATE INDEX idx_recovery_snapshots_project
  ON recovery_snapshots(project_id, generated_at DESC);

CREATE INDEX idx_recovery_snapshots_run
  ON recovery_snapshots(run_id, generated_at DESC);

CREATE INDEX idx_recovery_snapshots_correlation
  ON recovery_snapshots(correlation_id, generated_at DESC);
