PRAGMA foreign_keys = ON;

CREATE TABLE verification_obligations (
  id TEXT PRIMARY KEY,
  project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
  repository_id TEXT NOT NULL
    REFERENCES repositories(id) ON DELETE CASCADE,
  run_id TEXT
    REFERENCES cooperative_runs(id) ON DELETE SET NULL,
  stage_id TEXT
    REFERENCES stages(id) ON DELETE SET NULL,
  branch TEXT NOT NULL CHECK (length(trim(branch)) BETWEEN 1 AND 255),
  target_commit_sha TEXT NOT NULL CHECK (
    length(target_commit_sha) = 40
    AND target_commit_sha NOT GLOB '*[^0-9a-f]*'
  ),
  gate_name TEXT NOT NULL CHECK (length(trim(gate_name)) BETWEEN 1 AND 200),
  command TEXT NOT NULL CHECK (length(trim(command)) BETWEEN 1 AND 2000),
  required_capabilities_json TEXT NOT NULL CHECK (
    json_valid(required_capabilities_json)
    AND json_type(required_capabilities_json) = 'array'
  ),
  responsible_actor TEXT NOT NULL CHECK (
    length(trim(responsible_actor)) BETWEEN 1 AND 100
  ),
  next_action TEXT NOT NULL CHECK (
    length(trim(next_action)) BETWEEN 1 AND 1000
  ),
  toolchain_manifest TEXT CHECK (
    toolchain_manifest IS NULL OR length(trim(toolchain_manifest)) BETWEEN 1 AND 500
  ),
  status TEXT NOT NULL CHECK (
    status IN (
      'pending', 'running', 'passed', 'failed', 'blocked',
      'superseded', 'waived'
    )
  ),
  failure_classification TEXT CHECK (
    failure_classification IS NULL
    OR failure_classification IN (
      'code_failure', 'environment_missing', 'flaky', 'timeout', 'quota',
      'configuration', 'external_dependency', 'unknown'
    )
  ),
  failure_signature TEXT,
  result_summary TEXT CHECK (
    result_summary IS NULL OR length(trim(result_summary)) BETWEEN 1 AND 2000
  ),
  evidence_urls_json TEXT NOT NULL DEFAULT '[]' CHECK (
    json_valid(evidence_urls_json)
    AND json_type(evidence_urls_json) = 'array'
  ),
  created_at TEXT NOT NULL,
  last_attempt_at TEXT,
  resolved_at TEXT,
  version INTEGER NOT NULL CHECK (version >= 1),
  CHECK (
    (status IN ('pending', 'running', 'failed', 'blocked') AND resolved_at IS NULL)
    OR
    (status IN ('passed', 'superseded', 'waived') AND resolved_at IS NOT NULL)
  ),
  CHECK (
    status <> 'passed'
    OR (failure_classification IS NULL AND failure_signature IS NULL)
  ),
  CHECK (
    status NOT IN ('failed', 'blocked')
    OR (
      failure_classification IS NOT NULL
      AND failure_signature IS NOT NULL
      AND result_summary IS NOT NULL
      AND last_attempt_at IS NOT NULL
    )
  )
);

CREATE INDEX idx_verification_obligations_target
  ON verification_obligations(repository_id, branch, target_commit_sha, status);

CREATE INDEX idx_verification_obligations_stage
  ON verification_obligations(stage_id, status, created_at DESC);

CREATE INDEX idx_verification_obligations_run
  ON verification_obligations(run_id, status, created_at DESC);

CREATE INDEX idx_verification_obligations_failure_signature
  ON verification_obligations(failure_signature, last_attempt_at DESC);

CREATE TABLE verification_obligation_events (
  id TEXT PRIMARY KEY,
  obligation_id TEXT NOT NULL
    REFERENCES verification_obligations(id) ON DELETE CASCADE,
  sequence INTEGER NOT NULL CHECK (sequence >= 1),
  action TEXT NOT NULL CHECK (
    action IN (
      'verification_obligation.create',
      'verification_obligation.result',
      'verification_obligation.supersede',
      'verification_obligation.waive'
    )
  ),
  actor TEXT NOT NULL CHECK (length(trim(actor)) BETWEEN 1 AND 200),
  before_json TEXT CHECK (before_json IS NULL OR json_valid(before_json)),
  after_json TEXT NOT NULL CHECK (json_valid(after_json)),
  reason TEXT NOT NULL CHECK (length(trim(reason)) BETWEEN 1 AND 2000),
  occurred_at TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('manual', 'agent')),
  confirmed INTEGER NOT NULL CHECK (confirmed IN (0, 1)),
  idempotency_key TEXT NOT NULL CHECK (
    length(trim(idempotency_key)) BETWEEN 1 AND 200
  ),
  correlation_id TEXT NOT NULL CHECK (
    length(trim(correlation_id)) BETWEEN 1 AND 200
  ),
  UNIQUE (obligation_id, sequence),
  UNIQUE (obligation_id, idempotency_key)
);

CREATE INDEX idx_verification_obligation_events_history
  ON verification_obligation_events(obligation_id, sequence DESC);

CREATE INDEX idx_verification_obligation_events_correlation
  ON verification_obligation_events(correlation_id, occurred_at DESC);
