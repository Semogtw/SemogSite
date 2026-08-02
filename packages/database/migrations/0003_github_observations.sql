CREATE TABLE github_repository_observations (
  id TEXT PRIMARY KEY,
  sync_run_id TEXT NOT NULL REFERENCES sync_runs(id) ON DELETE CASCADE,
  repository_id TEXT NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
  github_node_id TEXT NOT NULL,
  full_name TEXT NOT NULL,
  visibility TEXT NOT NULL CHECK (visibility IN ('public', 'private')),
  default_branch TEXT NOT NULL,
  html_url TEXT NOT NULL,
  archived INTEGER NOT NULL CHECK (archived IN (0, 1)),
  pushed_at TEXT,
  provider_updated_at TEXT NOT NULL,
  observed_at TEXT NOT NULL,
  api_version TEXT NOT NULL,
  etag TEXT,
  rate_limit_remaining INTEGER CHECK (rate_limit_remaining IS NULL OR rate_limit_remaining >= 0),
  rate_limit_reset_at TEXT,
  branches_truncated INTEGER NOT NULL CHECK (branches_truncated IN (0, 1)),
  source_hash TEXT NOT NULL UNIQUE
);

CREATE INDEX idx_github_repository_observations_latest
  ON github_repository_observations(repository_id, observed_at DESC);
CREATE INDEX idx_github_repository_observations_run
  ON github_repository_observations(sync_run_id, repository_id);

CREATE TABLE github_branch_observations (
  id TEXT PRIMARY KEY,
  repository_observation_id TEXT NOT NULL REFERENCES github_repository_observations(id) ON DELETE CASCADE,
  repository_id TEXT NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  head_sha TEXT NOT NULL,
  committed_at TEXT NOT NULL,
  protected INTEGER NOT NULL CHECK (protected IN (0, 1)),
  is_default INTEGER NOT NULL CHECK (is_default IN (0, 1)),
  observed_at TEXT NOT NULL,
  source_hash TEXT NOT NULL UNIQUE
);

CREATE INDEX idx_github_branch_observations_latest
  ON github_branch_observations(repository_id, name, observed_at DESC);
CREATE INDEX idx_github_branch_observations_parent
  ON github_branch_observations(repository_observation_id, committed_at DESC);

CREATE TABLE github_branch_recommendations (
  id TEXT PRIMARY KEY,
  repository_observation_id TEXT NOT NULL UNIQUE REFERENCES github_repository_observations(id) ON DELETE CASCADE,
  repository_id TEXT NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('unavailable', 'recommended')),
  branch TEXT,
  confidence TEXT NOT NULL CHECK (confidence IN ('high', 'medium', 'low')),
  reason TEXT NOT NULL,
  warnings_json TEXT NOT NULL,
  evidence_json TEXT NOT NULL,
  observed_at TEXT NOT NULL,
  source_hash TEXT NOT NULL UNIQUE,
  CHECK (
    (status = 'recommended' AND branch IS NOT NULL AND length(trim(branch)) > 0)
    OR (status = 'unavailable' AND branch IS NULL)
  )
);

CREATE INDEX idx_github_branch_recommendations_latest
  ON github_branch_recommendations(repository_id, observed_at DESC);
