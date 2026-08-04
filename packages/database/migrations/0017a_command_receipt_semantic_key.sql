PRAGMA foreign_keys = ON;

CREATE UNIQUE INDEX idx_command_receipts_principal_command_key
  ON command_receipts(
    owner_id,
    actor_kind,
    actor_id,
    client_id,
    command_id,
    command_version,
    idempotency_key
  );
