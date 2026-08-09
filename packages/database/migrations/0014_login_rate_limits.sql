CREATE TABLE login_rate_limits (
  key_digest TEXT PRIMARY KEY NOT NULL,
  window_started_at TEXT NOT NULL,
  attempt_count INTEGER NOT NULL CHECK (attempt_count >= 1),
  updated_at TEXT NOT NULL
);

CREATE INDEX idx_login_rate_limits_updated_at
  ON login_rate_limits (updated_at);
