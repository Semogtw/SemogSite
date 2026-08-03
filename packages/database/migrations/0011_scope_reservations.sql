PRAGMA foreign_keys = ON;

CREATE TABLE scope_reservations (
  id TEXT PRIMARY KEY,
  project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
  repository_id TEXT NOT NULL
    REFERENCES repositories(id) ON DELETE CASCADE,
  run_id TEXT
    REFERENCES cooperative_runs(id) ON DELETE SET NULL,
  branch TEXT NOT NULL CHECK (length(trim(branch)) BETWEEN 1 AND 255),
  kind TEXT NOT NULL CHECK (
    kind IN ('repository', 'directory', 'files', 'issue', 'stage', 'custom')
  ),
  patterns_json TEXT NOT NULL CHECK (
    json_valid(patterns_json) AND json_type(patterns_json) = 'array'
  ),
  holder_label TEXT NOT NULL CHECK (
    length(trim(holder_label)) BETWEEN 1 AND 100
  ),
  purpose TEXT NOT NULL CHECK (length(trim(purpose)) BETWEEN 1 AND 1000),
  state TEXT NOT NULL CHECK (
    state IN ('active', 'released', 'transferred', 'overridden')
  ),
  acquired_at TEXT NOT NULL,
  renewed_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  released_at TEXT,
  version INTEGER NOT NULL CHECK (version >= 1),
  CHECK (renewed_at >= acquired_at),
  CHECK (expires_at > renewed_at),
  CHECK (
    (state = 'active' AND released_at IS NULL)
    OR
    (state IN ('released', 'transferred', 'overridden')
      AND released_at IS NOT NULL)
  )
);

CREATE INDEX idx_scope_reservations_active
  ON scope_reservations(repository_id, branch, state, expires_at);

CREATE INDEX idx_scope_reservations_run
  ON scope_reservations(run_id, state, renewed_at DESC);

CREATE INDEX idx_scope_reservations_project
  ON scope_reservations(project_id, state, renewed_at DESC);

CREATE TABLE scope_reservation_events (
  id TEXT PRIMARY KEY,
  reservation_id TEXT NOT NULL
    REFERENCES scope_reservations(id) ON DELETE CASCADE,
  sequence INTEGER NOT NULL CHECK (sequence >= 1),
  action TEXT NOT NULL CHECK (
    action IN (
      'scope_reservation.acquire',
      'scope_reservation.renew',
      'scope_reservation.release',
      'scope_reservation.override'
    )
  ),
  actor TEXT NOT NULL CHECK (length(trim(actor)) BETWEEN 1 AND 200),
  before_json TEXT CHECK (before_json IS NULL OR json_valid(before_json)),
  after_json TEXT NOT NULL CHECK (json_valid(after_json)),
  reason TEXT NOT NULL CHECK (length(trim(reason)) BETWEEN 1 AND 1000),
  overlap_ids_json TEXT NOT NULL DEFAULT '[]' CHECK (
    json_valid(overlap_ids_json) AND json_type(overlap_ids_json) = 'array'
  ),
  occurred_at TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('manual', 'agent')),
  confirmed INTEGER NOT NULL CHECK (confirmed IN (0, 1)),
  idempotency_key TEXT NOT NULL CHECK (
    length(trim(idempotency_key)) BETWEEN 1 AND 200
  ),
  correlation_id TEXT NOT NULL CHECK (
    length(trim(correlation_id)) BETWEEN 1 AND 200
  ),
  UNIQUE (reservation_id, sequence),
  UNIQUE (reservation_id, idempotency_key)
);

CREATE INDEX idx_scope_reservation_events_history
  ON scope_reservation_events(reservation_id, sequence DESC);

CREATE INDEX idx_scope_reservation_events_correlation
  ON scope_reservation_events(correlation_id, occurred_at DESC);
