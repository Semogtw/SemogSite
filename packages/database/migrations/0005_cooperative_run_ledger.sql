PRAGMA foreign_keys = ON;

CREATE TABLE cooperative_runs (
  id TEXT PRIMARY KEY,
  project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
  title TEXT NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 200),
  actor_label TEXT NOT NULL CHECK (length(trim(actor_label)) BETWEEN 1 AND 100),
  origin TEXT NOT NULL CHECK (
    origin IN ('chatgpt', 'codex', 'manual', 'automation', 'other')
  ),
  status TEXT NOT NULL CHECK (
    status IN ('running', 'blocked', 'completed', 'failed', 'cancelled')
  ),
  phase TEXT CHECK (phase IS NULL OR length(trim(phase)) BETWEEN 1 AND 200),
  progress INTEGER NOT NULL CHECK (progress BETWEEN 0 AND 100),
  branch TEXT CHECK (branch IS NULL OR length(trim(branch)) BETWEEN 1 AND 255),
  summary TEXT NOT NULL CHECK (length(trim(summary)) BETWEEN 1 AND 2000),
  blocker TEXT,
  next_action TEXT,
  started_at TEXT NOT NULL,
  last_heartbeat_at TEXT NOT NULL,
  finished_at TEXT,
  stale_after_seconds INTEGER NOT NULL CHECK (
    stale_after_seconds BETWEEN 300 AND 86400
  ),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (
    (status = 'running'
      AND blocker IS NULL
      AND next_action IS NOT NULL
      AND length(trim(next_action)) BETWEEN 1 AND 1000
      AND finished_at IS NULL)
    OR
    (status = 'blocked'
      AND blocker IS NOT NULL
      AND length(trim(blocker)) BETWEEN 1 AND 2000
      AND next_action IS NOT NULL
      AND length(trim(next_action)) BETWEEN 1 AND 1000
      AND finished_at IS NULL)
    OR
    (status = 'completed'
      AND progress = 100
      AND blocker IS NULL
      AND next_action IS NULL
      AND finished_at IS NOT NULL)
    OR
    (status IN ('failed', 'cancelled')
      AND blocker IS NOT NULL
      AND length(trim(blocker)) BETWEEN 1 AND 2000
      AND next_action IS NULL
      AND finished_at IS NOT NULL)
  )
);

CREATE INDEX idx_cooperative_runs_project
  ON cooperative_runs(project_id, status, updated_at DESC);

CREATE INDEX idx_cooperative_runs_freshness
  ON cooperative_runs(status, last_heartbeat_at, stale_after_seconds);

CREATE TABLE cooperative_run_events (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES cooperative_runs(id) ON DELETE CASCADE,
  sequence INTEGER NOT NULL CHECK (sequence >= 1),
  kind TEXT NOT NULL CHECK (
    kind IN (
      'run.registered',
      'run.heartbeat',
      'run.checkpoint',
      'run.blocked',
      'run.resumed',
      'run.completed',
      'run.failed',
      'run.cancelled',
      'run.command_queued',
      'run.command_acknowledged',
      'run.command_completed',
      'run.command_rejected'
    )
  ),
  actor TEXT NOT NULL CHECK (length(trim(actor)) BETWEEN 1 AND 200),
  source TEXT NOT NULL CHECK (
    source IN ('chatgpt', 'codex', 'manual', 'automation', 'other')
  ),
  summary TEXT NOT NULL CHECK (length(trim(summary)) BETWEEN 1 AND 2000),
  before_json TEXT,
  after_json TEXT,
  occurred_at TEXT NOT NULL,
  idempotency_key TEXT NOT NULL CHECK (
    length(trim(idempotency_key)) BETWEEN 1 AND 200
  ),
  correlation_id TEXT NOT NULL CHECK (
    length(trim(correlation_id)) BETWEEN 1 AND 200
  ),
  UNIQUE (run_id, sequence),
  UNIQUE (run_id, idempotency_key)
);

CREATE INDEX idx_cooperative_run_events_history
  ON cooperative_run_events(run_id, sequence DESC);

CREATE INDEX idx_cooperative_run_events_correlation
  ON cooperative_run_events(correlation_id, occurred_at DESC);

CREATE TABLE cooperative_run_checkpoints (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES cooperative_runs(id) ON DELETE CASCADE,
  event_id TEXT NOT NULL UNIQUE
    REFERENCES cooperative_run_events(id) ON DELETE CASCADE,
  sequence INTEGER NOT NULL CHECK (sequence >= 1),
  phase TEXT CHECK (phase IS NULL OR length(trim(phase)) BETWEEN 1 AND 200),
  progress INTEGER NOT NULL CHECK (progress BETWEEN 0 AND 100),
  branch TEXT CHECK (branch IS NULL OR length(trim(branch)) BETWEEN 1 AND 255),
  summary TEXT NOT NULL CHECK (length(trim(summary)) BETWEEN 1 AND 2000),
  commits_json TEXT NOT NULL DEFAULT '[]',
  tests_status TEXT NOT NULL CHECK (
    tests_status IN ('not_run', 'partial', 'passed', 'failed', 'blocked')
  ),
  tests_summary TEXT NOT NULL CHECK (length(tests_summary) <= 2000),
  blockers TEXT NOT NULL CHECK (length(blockers) <= 2000),
  next_step TEXT NOT NULL CHECK (length(trim(next_step)) BETWEEN 1 AND 1000),
  captured_at TEXT NOT NULL,
  source_hash TEXT,
  UNIQUE (run_id, sequence),
  UNIQUE (source_hash)
);

CREATE INDEX idx_cooperative_run_checkpoints_recent
  ON cooperative_run_checkpoints(run_id, captured_at DESC);

CREATE TABLE cooperative_run_commands (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES cooperative_runs(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (
    kind IN (
      'continue',
      'pause',
      'cancel',
      'reprioritize',
      'request_checkpoint',
      'provide_context'
    )
  ),
  status TEXT NOT NULL CHECK (
    status IN ('queued', 'acknowledged', 'completed', 'rejected', 'expired')
  ),
  summary TEXT NOT NULL CHECK (length(trim(summary)) BETWEEN 1 AND 1000),
  payload_json TEXT NOT NULL DEFAULT '{}',
  reason TEXT,
  queued_by TEXT NOT NULL CHECK (length(trim(queued_by)) BETWEEN 1 AND 200),
  idempotency_key TEXT NOT NULL CHECK (
    length(trim(idempotency_key)) BETWEEN 1 AND 200
  ),
  correlation_id TEXT NOT NULL CHECK (
    length(trim(correlation_id)) BETWEEN 1 AND 200
  ),
  queued_at TEXT NOT NULL,
  acknowledged_at TEXT,
  completed_at TEXT,
  expires_at TEXT,
  updated_at TEXT NOT NULL,
  CHECK (
    (status = 'queued' AND acknowledged_at IS NULL AND completed_at IS NULL)
    OR
    (status = 'acknowledged' AND acknowledged_at IS NOT NULL AND completed_at IS NULL)
    OR
    (status IN ('completed', 'rejected', 'expired') AND completed_at IS NOT NULL)
  ),
  UNIQUE (run_id, idempotency_key)
);

CREATE INDEX idx_cooperative_run_commands_queue
  ON cooperative_run_commands(status, queued_at ASC);

CREATE INDEX idx_cooperative_run_commands_run
  ON cooperative_run_commands(run_id, status, queued_at DESC);
