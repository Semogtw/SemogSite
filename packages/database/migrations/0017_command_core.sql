PRAGMA foreign_keys = ON;

CREATE TABLE command_receipts (
  id TEXT PRIMARY KEY CHECK (length(trim(id)) BETWEEN 1 AND 200),
  owner_id TEXT NOT NULL CHECK (length(trim(owner_id)) BETWEEN 1 AND 200),
  command_id TEXT NOT NULL CHECK (
    length(command_id) BETWEEN 3 AND 160
    AND command_id = lower(command_id)
    AND command_id NOT GLOB '*[^a-z0-9_.]*'
    AND instr(command_id, '.') > 0
  ),
  command_version INTEGER NOT NULL CHECK (command_version >= 1),
  capability TEXT NOT NULL CHECK (
    length(capability) BETWEEN 3 AND 160
    AND capability = lower(capability)
    AND capability NOT GLOB '*[^a-z0-9_.]*'
    AND instr(capability, '.') > 0
  ),
  resource_type TEXT NOT NULL CHECK (
    length(resource_type) BETWEEN 1 AND 120
    AND resource_type = lower(resource_type)
    AND resource_type NOT GLOB '*[^a-z0-9_-]*'
  ),
  resource_id TEXT NOT NULL CHECK (length(trim(resource_id)) BETWEEN 1 AND 500),
  actor_kind TEXT NOT NULL CHECK (
    actor_kind IN ('owner_ui', 'mcp_client', 'system', 'external_adapter')
  ),
  actor_id TEXT NOT NULL CHECK (length(trim(actor_id)) BETWEEN 1 AND 200),
  client_id TEXT NOT NULL DEFAULT '' CHECK (
    length(client_id) <= 200 AND client_id = trim(client_id)
  ),
  request_hash TEXT NOT NULL CHECK (
    length(request_hash) = 64
    AND request_hash = lower(request_hash)
    AND request_hash NOT GLOB '*[^a-f0-9]*'
  ),
  status TEXT NOT NULL CHECK (
    status IN ('in_progress', 'succeeded', 'failed')
  ),
  result_hash TEXT CHECK (
    result_hash IS NULL OR (
      length(result_hash) = 64
      AND result_hash = lower(result_hash)
      AND result_hash NOT GLOB '*[^a-f0-9]*'
    )
  ),
  result_summary_json TEXT CHECK (
    result_summary_json IS NULL OR (
      length(result_summary_json) <= 4000
      AND json_valid(result_summary_json)
      AND json_type(result_summary_json) = 'object'
    )
  ),
  stable_error_code TEXT CHECK (
    stable_error_code IS NULL OR (
      length(stable_error_code) BETWEEN 1 AND 120
      AND stable_error_code = upper(stable_error_code)
      AND stable_error_code NOT GLOB '*[^A-Z0-9_]*'
    )
  ),
  retryable INTEGER CHECK (retryable IS NULL OR retryable IN (0, 1)),
  claimed_at TEXT NOT NULL,
  lease_expires_at TEXT NOT NULL,
  completed_at TEXT,
  correlation_id TEXT NOT NULL CHECK (
    length(trim(correlation_id)) BETWEEN 1 AND 200
  ),
  idempotency_key TEXT NOT NULL CHECK (
    length(trim(idempotency_key)) BETWEEN 1 AND 200
  ),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (created_at <= updated_at),
  CHECK (claimed_at <= lease_expires_at),
  CHECK (
    (status = 'in_progress'
      AND result_hash IS NULL
      AND result_summary_json IS NULL
      AND stable_error_code IS NULL
      AND retryable IS NULL
      AND completed_at IS NULL)
    OR
    (status = 'succeeded'
      AND result_hash IS NOT NULL
      AND result_summary_json IS NOT NULL
      AND stable_error_code IS NULL
      AND retryable IS NULL
      AND completed_at IS NOT NULL)
    OR
    (status = 'failed'
      AND result_hash IS NULL
      AND result_summary_json IS NULL
      AND stable_error_code IS NOT NULL
      AND retryable IS NOT NULL
      AND completed_at IS NOT NULL)
  ),
  UNIQUE (
    owner_id,
    actor_kind,
    actor_id,
    client_id,
    command_id,
    command_version,
    resource_type,
    resource_id,
    idempotency_key
  )
);

CREATE INDEX idx_command_receipts_owner_status
  ON command_receipts(owner_id, status, updated_at DESC);

CREATE INDEX idx_command_receipts_resource
  ON command_receipts(owner_id, resource_type, resource_id, updated_at DESC);

CREATE INDEX idx_command_receipts_lease
  ON command_receipts(status, lease_expires_at)
  WHERE status = 'in_progress';

CREATE TRIGGER trg_command_receipts_identity_immutable
BEFORE UPDATE ON command_receipts
FOR EACH ROW
WHEN
  NEW.id <> OLD.id
  OR NEW.owner_id <> OLD.owner_id
  OR NEW.command_id <> OLD.command_id
  OR NEW.command_version <> OLD.command_version
  OR NEW.capability <> OLD.capability
  OR NEW.resource_type <> OLD.resource_type
  OR NEW.resource_id <> OLD.resource_id
  OR NEW.actor_kind <> OLD.actor_kind
  OR NEW.actor_id <> OLD.actor_id
  OR NEW.client_id <> OLD.client_id
  OR NEW.request_hash <> OLD.request_hash
  OR NEW.claimed_at <> OLD.claimed_at
  OR NEW.correlation_id <> OLD.correlation_id
  OR NEW.idempotency_key <> OLD.idempotency_key
  OR NEW.created_at <> OLD.created_at
BEGIN
  SELECT RAISE(ABORT, 'COMMAND_RECEIPT_IDENTITY_IMMUTABLE');
END;

CREATE TRIGGER trg_command_receipts_final_immutable
BEFORE UPDATE ON command_receipts
FOR EACH ROW
WHEN OLD.status IN ('succeeded', 'failed')
BEGIN
  SELECT RAISE(ABORT, 'COMMAND_RECEIPT_FINAL_IMMUTABLE');
END;

CREATE TRIGGER trg_command_receipts_transition
BEFORE UPDATE ON command_receipts
FOR EACH ROW
WHEN OLD.status = 'in_progress'
BEGIN
  SELECT CASE
    WHEN NEW.status NOT IN ('in_progress', 'succeeded', 'failed')
    THEN RAISE(ABORT, 'COMMAND_RECEIPT_TRANSITION_INVALID')
    WHEN NEW.updated_at < OLD.updated_at
    THEN RAISE(ABORT, 'COMMAND_RECEIPT_TIME_INVALID')
    WHEN NEW.status = 'in_progress' AND NEW.lease_expires_at <= OLD.lease_expires_at
    THEN RAISE(ABORT, 'COMMAND_RECEIPT_LEASE_INVALID')
  END;
END;

CREATE TRIGGER trg_command_receipts_no_delete
BEFORE DELETE ON command_receipts
BEGIN
  SELECT RAISE(ABORT, 'COMMAND_RECEIPTS_IMMUTABLE');
END;
