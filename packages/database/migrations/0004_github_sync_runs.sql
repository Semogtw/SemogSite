ALTER TABLE sync_runs
  ADD COLUMN integration TEXT NOT NULL DEFAULT 'legacy'
  CHECK (integration IN ('legacy','github','notion','migration','mcp'));

ALTER TABLE sync_runs
  ADD COLUMN created_count INTEGER NOT NULL DEFAULT 0
  CHECK (created_count >= 0);

ALTER TABLE sync_runs
  ADD COLUMN updated_count INTEGER NOT NULL DEFAULT 0
  CHECK (updated_count >= 0);

ALTER TABLE sync_runs
  ADD COLUMN skipped_count INTEGER NOT NULL DEFAULT 0
  CHECK (skipped_count >= 0);

ALTER TABLE sync_runs
  ADD COLUMN error_count INTEGER NOT NULL DEFAULT 0
  CHECK (error_count >= 0);

ALTER TABLE sync_runs
  ADD COLUMN rate_limit_remaining INTEGER
  CHECK (rate_limit_remaining IS NULL OR rate_limit_remaining >= 0);

ALTER TABLE sync_runs
  ADD COLUMN rate_limit_reset_at TEXT;

ALTER TABLE sync_runs
  ADD COLUMN metadata_json TEXT NOT NULL DEFAULT '{}';

UPDATE sync_runs
SET created_count = changes_applied,
    metadata_json = '{"migratedFromLegacy":true}'
WHERE integration = 'legacy';

CREATE INDEX IF NOT EXISTS idx_sync_runs_integration_started
  ON sync_runs(integration, started_at DESC);
