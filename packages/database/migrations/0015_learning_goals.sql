PRAGMA foreign_keys = ON;

CREATE TABLE learning_goals (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL CHECK (length(trim(owner_id)) BETWEEN 1 AND 200),
  slug TEXT NOT NULL CHECK (
    length(slug) BETWEEN 1 AND 120
    AND slug = lower(slug)
    AND slug NOT GLOB '*[^a-z0-9-]*'
    AND substr(slug, 1, 1) <> '-'
    AND substr(slug, -1, 1) <> '-'
    AND instr(slug, '--') = 0
  ),
  title TEXT NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 160),
  description TEXT NOT NULL DEFAULT '' CHECK (length(description) <= 5000),
  motivation TEXT CHECK (motivation IS NULL OR length(motivation) <= 1000),
  status TEXT NOT NULL CHECK (
    status IN ('draft', 'active', 'paused', 'completed', 'cancelled', 'archived')
  ),
  priority TEXT NOT NULL CHECK (priority IN ('critical', 'high', 'medium', 'low')),
  target_date TEXT CHECK (
    target_date IS NULL OR (
      length(target_date) = 10
      AND substr(target_date, 5, 1) = '-'
      AND substr(target_date, 8, 1) = '-'
    )
  ),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  version INTEGER NOT NULL CHECK (version >= 1),
  CHECK (created_at <= updated_at),
  UNIQUE (owner_id, slug)
);

CREATE INDEX idx_learning_goals_owner_status
  ON learning_goals(owner_id, status, priority, updated_at DESC);

CREATE INDEX idx_learning_goals_target_date
  ON learning_goals(owner_id, target_date, status)
  WHERE target_date IS NOT NULL;

CREATE TABLE learning_goal_events (
  id TEXT PRIMARY KEY,
  goal_id TEXT NOT NULL
    REFERENCES learning_goals(id) ON DELETE RESTRICT,
  sequence INTEGER NOT NULL CHECK (sequence >= 1),
  action TEXT NOT NULL CHECK (length(trim(action)) BETWEEN 1 AND 120),
  before_json TEXT CHECK (
    before_json IS NULL OR (
      json_valid(before_json) AND json_type(before_json) = 'object'
    )
  ),
  after_json TEXT NOT NULL CHECK (
    json_valid(after_json) AND json_type(after_json) = 'object'
  ),
  reason TEXT NOT NULL CHECK (length(trim(reason)) BETWEEN 1 AND 500),
  actor_id TEXT NOT NULL CHECK (length(trim(actor_id)) BETWEEN 1 AND 200),
  occurred_at TEXT NOT NULL,
  correlation_id TEXT NOT NULL CHECK (
    length(trim(correlation_id)) BETWEEN 1 AND 200
  ),
  idempotency_key TEXT NOT NULL CHECK (
    length(trim(idempotency_key)) BETWEEN 1 AND 200
  ),
  UNIQUE (goal_id, sequence),
  UNIQUE (goal_id, idempotency_key)
);

CREATE INDEX idx_learning_goal_events_goal
  ON learning_goal_events(goal_id, sequence DESC);

CREATE TRIGGER trg_learning_goal_events_sequence
BEFORE INSERT ON learning_goal_events
FOR EACH ROW
BEGIN
  SELECT CASE
    WHEN NEW.sequence <> (
      SELECT COALESCE(MAX(sequence), 0) + 1
      FROM learning_goal_events
      WHERE goal_id = NEW.goal_id
    )
    THEN RAISE(ABORT, 'LEARNING_GOAL_EVENT_SEQUENCE_INVALID')
  END;
END;

CREATE TRIGGER trg_learning_goal_events_no_update
BEFORE UPDATE ON learning_goal_events
BEGIN
  SELECT RAISE(ABORT, 'LEARNING_GOAL_EVENTS_IMMUTABLE');
END;

CREATE TRIGGER trg_learning_goal_events_no_delete
BEFORE DELETE ON learning_goal_events
BEGIN
  SELECT RAISE(ABORT, 'LEARNING_GOAL_EVENTS_IMMUTABLE');
END;

CREATE TABLE learning_checkpoints (
  id TEXT PRIMARY KEY,
  goal_id TEXT NOT NULL
    REFERENCES learning_goals(id) ON DELETE RESTRICT,
  title TEXT NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 200),
  description TEXT NOT NULL DEFAULT '' CHECK (length(description) <= 5000),
  status TEXT NOT NULL CHECK (
    status IN ('pending', 'in_progress', 'completed', 'waived', 'cancelled')
  ),
  required INTEGER NOT NULL CHECK (required IN (0, 1)),
  sequence INTEGER NOT NULL CHECK (sequence >= 1),
  weight INTEGER NOT NULL CHECK (weight BETWEEN 1 AND 100),
  weight_mode TEXT NOT NULL DEFAULT 'automatic' CHECK (
    weight_mode IN ('automatic', 'custom')
  ),
  completion_mode TEXT NOT NULL CHECK (completion_mode IN ('binary', 'numeric')),
  numeric_unit TEXT CHECK (
    numeric_unit IS NULL OR length(trim(numeric_unit)) BETWEEN 1 AND 40
  ),
  numeric_target REAL CHECK (numeric_target IS NULL OR numeric_target > 0),
  accepted_value REAL CHECK (accepted_value IS NULL OR accepted_value >= 0),
  due_date TEXT CHECK (
    due_date IS NULL OR (
      length(due_date) = 10
      AND substr(due_date, 5, 1) = '-'
      AND substr(due_date, 8, 1) = '-'
    )
  ),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  version INTEGER NOT NULL CHECK (version >= 1),
  CHECK (created_at <= updated_at),
  CHECK (
    (
      completion_mode = 'binary'
      AND numeric_unit IS NULL
      AND numeric_target IS NULL
      AND accepted_value IS NULL
    )
    OR
    (
      completion_mode = 'numeric'
      AND numeric_unit IS NOT NULL
      AND length(trim(numeric_unit)) BETWEEN 1 AND 40
      AND numeric_target IS NOT NULL
      AND numeric_target > 0
      AND (accepted_value IS NULL OR accepted_value >= 0)
    )
  ),
  CHECK (
    status <> 'completed'
    OR completion_mode = 'binary'
    OR (accepted_value IS NOT NULL AND accepted_value >= numeric_target)
  ),
  UNIQUE (goal_id, sequence)
);

CREATE INDEX idx_learning_checkpoints_goal_sequence
  ON learning_checkpoints(goal_id, sequence);

CREATE INDEX idx_learning_checkpoints_due
  ON learning_checkpoints(due_date, status)
  WHERE due_date IS NOT NULL;

CREATE TABLE learning_checkpoint_events (
  id TEXT PRIMARY KEY,
  checkpoint_id TEXT NOT NULL
    REFERENCES learning_checkpoints(id) ON DELETE RESTRICT,
  sequence INTEGER NOT NULL CHECK (sequence >= 1),
  action TEXT NOT NULL CHECK (length(trim(action)) BETWEEN 1 AND 120),
  before_json TEXT CHECK (
    before_json IS NULL OR (
      json_valid(before_json) AND json_type(before_json) = 'object'
    )
  ),
  after_json TEXT NOT NULL CHECK (
    json_valid(after_json) AND json_type(after_json) = 'object'
  ),
  reason TEXT NOT NULL CHECK (length(trim(reason)) BETWEEN 1 AND 500),
  actor_id TEXT NOT NULL CHECK (length(trim(actor_id)) BETWEEN 1 AND 200),
  occurred_at TEXT NOT NULL,
  correlation_id TEXT NOT NULL CHECK (
    length(trim(correlation_id)) BETWEEN 1 AND 200
  ),
  idempotency_key TEXT NOT NULL CHECK (
    length(trim(idempotency_key)) BETWEEN 1 AND 200
  ),
  UNIQUE (checkpoint_id, sequence),
  UNIQUE (checkpoint_id, idempotency_key)
);

CREATE INDEX idx_learning_checkpoint_events_checkpoint
  ON learning_checkpoint_events(checkpoint_id, sequence DESC);

CREATE TRIGGER trg_learning_checkpoint_events_sequence
BEFORE INSERT ON learning_checkpoint_events
FOR EACH ROW
BEGIN
  SELECT CASE
    WHEN NEW.sequence <> (
      SELECT COALESCE(MAX(sequence), 0) + 1
      FROM learning_checkpoint_events
      WHERE checkpoint_id = NEW.checkpoint_id
    )
    THEN RAISE(ABORT, 'LEARNING_CHECKPOINT_EVENT_SEQUENCE_INVALID')
  END;
END;

CREATE TRIGGER trg_learning_checkpoint_events_no_update
BEFORE UPDATE ON learning_checkpoint_events
BEGIN
  SELECT RAISE(ABORT, 'LEARNING_CHECKPOINT_EVENTS_IMMUTABLE');
END;

CREATE TRIGGER trg_learning_checkpoint_events_no_delete
BEFORE DELETE ON learning_checkpoint_events
BEGIN
  SELECT RAISE(ABORT, 'LEARNING_CHECKPOINT_EVENTS_IMMUTABLE');
END;

CREATE TABLE skills (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL CHECK (length(trim(owner_id)) BETWEEN 1 AND 200),
  slug TEXT NOT NULL CHECK (
    length(slug) BETWEEN 1 AND 120
    AND slug = lower(slug)
    AND slug NOT GLOB '*[^a-z0-9-]*'
    AND substr(slug, 1, 1) <> '-'
    AND substr(slug, -1, 1) <> '-'
    AND instr(slug, '--') = 0
  ),
  name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 120),
  description TEXT NOT NULL DEFAULT '' CHECK (length(description) <= 2000),
  status TEXT NOT NULL CHECK (status IN ('active', 'archived', 'merged')),
  merged_into_skill_id TEXT
    REFERENCES skills(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  version INTEGER NOT NULL CHECK (version >= 1),
  CHECK (created_at <= updated_at),
  CHECK (merged_into_skill_id IS NULL OR merged_into_skill_id <> id),
  CHECK (
    (status = 'merged' AND merged_into_skill_id IS NOT NULL)
    OR (status <> 'merged' AND merged_into_skill_id IS NULL)
  ),
  UNIQUE (owner_id, slug)
);

CREATE INDEX idx_skills_owner_status
  ON skills(owner_id, status, name);

CREATE TABLE skill_alias_events (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL CHECK (length(trim(owner_id)) BETWEEN 1 AND 200),
  alias_slug TEXT NOT NULL CHECK (
    length(alias_slug) BETWEEN 1 AND 120
    AND alias_slug = lower(alias_slug)
    AND alias_slug NOT GLOB '*[^a-z0-9-]*'
    AND substr(alias_slug, 1, 1) <> '-'
    AND substr(alias_slug, -1, 1) <> '-'
    AND instr(alias_slug, '--') = 0
  ),
  skill_id TEXT NOT NULL
    REFERENCES skills(id) ON DELETE RESTRICT,
  sequence INTEGER NOT NULL CHECK (sequence >= 1),
  action TEXT NOT NULL CHECK (action IN ('created', 'revoked')),
  actor_id TEXT NOT NULL CHECK (length(trim(actor_id)) BETWEEN 1 AND 200),
  reason TEXT NOT NULL CHECK (length(trim(reason)) BETWEEN 1 AND 500),
  occurred_at TEXT NOT NULL,
  correlation_id TEXT NOT NULL CHECK (
    length(trim(correlation_id)) BETWEEN 1 AND 200
  ),
  idempotency_key TEXT NOT NULL CHECK (
    length(trim(idempotency_key)) BETWEEN 1 AND 200
  ),
  UNIQUE (owner_id, alias_slug, sequence),
  UNIQUE (owner_id, alias_slug, idempotency_key)
);

CREATE INDEX idx_skill_alias_events_lookup
  ON skill_alias_events(owner_id, alias_slug, sequence DESC);

CREATE TRIGGER trg_skill_alias_events_sequence
BEFORE INSERT ON skill_alias_events
FOR EACH ROW
BEGIN
  SELECT CASE
    WHEN NEW.sequence <> (
      SELECT COALESCE(MAX(sequence), 0) + 1
      FROM skill_alias_events
      WHERE owner_id = NEW.owner_id AND alias_slug = NEW.alias_slug
    )
    THEN RAISE(ABORT, 'SKILL_ALIAS_EVENT_SEQUENCE_INVALID')
  END;
END;

CREATE TRIGGER trg_skill_alias_events_transition
BEFORE INSERT ON skill_alias_events
FOR EACH ROW
BEGIN
  SELECT CASE
    WHEN NEW.sequence = 1 AND NEW.action <> 'created'
    THEN RAISE(ABORT, 'SKILL_ALIAS_EVENT_TRANSITION_INVALID')
    WHEN NEW.sequence > 1 AND NEW.action = (
      SELECT action
      FROM skill_alias_events
      WHERE owner_id = NEW.owner_id AND alias_slug = NEW.alias_slug
      ORDER BY sequence DESC
      LIMIT 1
    )
    THEN RAISE(ABORT, 'SKILL_ALIAS_EVENT_TRANSITION_INVALID')
  END;
END;

CREATE TRIGGER trg_skill_alias_events_no_update
BEFORE UPDATE ON skill_alias_events
BEGIN
  SELECT RAISE(ABORT, 'SKILL_ALIAS_EVENTS_IMMUTABLE');
END;

CREATE TRIGGER trg_skill_alias_events_no_delete
BEFORE DELETE ON skill_alias_events
BEGIN
  SELECT RAISE(ABORT, 'SKILL_ALIAS_EVENTS_IMMUTABLE');
END;

CREATE TABLE learning_goal_skills (
  goal_id TEXT NOT NULL
    REFERENCES learning_goals(id) ON DELETE RESTRICT,
  skill_id TEXT NOT NULL
    REFERENCES skills(id) ON DELETE RESTRICT,
  desired_stage TEXT NOT NULL CHECK (
    desired_stage IN ('introduced', 'practicing', 'applied', 'demonstrated')
  ),
  created_at TEXT NOT NULL,
  PRIMARY KEY (goal_id, skill_id)
);

CREATE INDEX idx_learning_goal_skills_skill
  ON learning_goal_skills(skill_id, goal_id);

CREATE TABLE learning_checkpoint_skills (
  checkpoint_id TEXT NOT NULL
    REFERENCES learning_checkpoints(id) ON DELETE RESTRICT,
  skill_id TEXT NOT NULL
    REFERENCES skills(id) ON DELETE RESTRICT,
  desired_stage TEXT NOT NULL CHECK (
    desired_stage IN ('introduced', 'practicing', 'applied', 'demonstrated')
  ),
  created_at TEXT NOT NULL,
  PRIMARY KEY (checkpoint_id, skill_id)
);

CREATE INDEX idx_learning_checkpoint_skills_skill
  ON learning_checkpoint_skills(skill_id, checkpoint_id);
