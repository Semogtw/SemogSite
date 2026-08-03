PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS editorial_redirect_events (
  id TEXT PRIMARY KEY NOT NULL,
  source_slug TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('project', 'note', 'experiment', 'page')),
  target_document_id TEXT NOT NULL,
  sequence INTEGER NOT NULL CHECK (sequence >= 1),
  action TEXT NOT NULL CHECK (action IN ('created', 'revoked')),
  actor TEXT NOT NULL,
  reason TEXT NOT NULL CHECK (length(trim(reason)) BETWEEN 1 AND 2000),
  occurred_at TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  correlation_id TEXT NOT NULL,
  CHECK (
    length(source_slug) BETWEEN 1 AND 120
    AND source_slug NOT GLOB '*[^a-z0-9-]*'
    AND substr(source_slug, 1, 1) GLOB '[a-z0-9]'
    AND substr(source_slug, -1, 1) GLOB '[a-z0-9]'
  ),
  FOREIGN KEY (target_document_id)
    REFERENCES editorial_documents(id) ON DELETE RESTRICT
);

CREATE UNIQUE INDEX IF NOT EXISTS editorial_redirect_events_source_sequence_unique
  ON editorial_redirect_events (source_slug, sequence);
CREATE UNIQUE INDEX IF NOT EXISTS editorial_redirect_events_idempotency_unique
  ON editorial_redirect_events (idempotency_key);
CREATE INDEX IF NOT EXISTS editorial_redirect_events_source_occurred_index
  ON editorial_redirect_events (source_slug, occurred_at DESC, sequence DESC);
CREATE INDEX IF NOT EXISTS editorial_redirect_events_target_index
  ON editorial_redirect_events (target_document_id, occurred_at DESC);

CREATE TRIGGER IF NOT EXISTS editorial_redirect_events_contiguous_sequence_insert
BEFORE INSERT ON editorial_redirect_events
WHEN NEW.sequence <> (
  SELECT COALESCE(MAX(sequence), 0) + 1
  FROM editorial_redirect_events
  WHERE source_slug = NEW.source_slug
)
BEGIN
  SELECT RAISE(ABORT, 'EDITORIAL_REDIRECT_SEQUENCE_INVALID');
END;

CREATE TRIGGER IF NOT EXISTS editorial_redirect_events_transition_guard
BEFORE INSERT ON editorial_redirect_events
WHEN (
  NEW.action = 'created'
  AND COALESCE((
    SELECT action
    FROM editorial_redirect_events
    WHERE source_slug = NEW.source_slug
    ORDER BY sequence DESC
    LIMIT 1
  ), 'revoked') <> 'revoked'
) OR (
  NEW.action = 'revoked'
  AND (
    COALESCE((
      SELECT action
      FROM editorial_redirect_events
      WHERE source_slug = NEW.source_slug
      ORDER BY sequence DESC
      LIMIT 1
    ), 'revoked') <> 'created'
    OR COALESCE((
      SELECT target_document_id
      FROM editorial_redirect_events
      WHERE source_slug = NEW.source_slug
      ORDER BY sequence DESC
      LIMIT 1
    ), '') <> NEW.target_document_id
    OR COALESCE((
      SELECT kind
      FROM editorial_redirect_events
      WHERE source_slug = NEW.source_slug
      ORDER BY sequence DESC
      LIMIT 1
    ), '') <> NEW.kind
  )
)
BEGIN
  SELECT RAISE(ABORT, 'EDITORIAL_REDIRECT_TRANSITION_INVALID');
END;

CREATE TRIGGER IF NOT EXISTS editorial_redirect_events_create_guard
BEFORE INSERT ON editorial_redirect_events
WHEN NEW.action = 'created'
BEGIN
  SELECT CASE
    WHEN EXISTS (
      SELECT 1 FROM editorial_documents WHERE slug = NEW.source_slug
    )
    THEN RAISE(ABORT, 'EDITORIAL_REDIRECT_CANONICAL_CONFLICT')
  END;

  SELECT CASE
    WHEN NOT EXISTS (
      SELECT 1
      FROM editorial_documents
      WHERE id = NEW.target_document_id
        AND kind = NEW.kind
        AND publication_status = 'published'
        AND slug <> NEW.source_slug
        AND updated_at <= NEW.occurred_at
    )
    THEN RAISE(ABORT, 'EDITORIAL_REDIRECT_TARGET_INVALID')
  END;
END;

CREATE TRIGGER IF NOT EXISTS editorial_redirect_events_immutable_update
BEFORE UPDATE ON editorial_redirect_events
BEGIN
  SELECT RAISE(ABORT, 'EDITORIAL_REDIRECT_IMMUTABLE');
END;

CREATE TRIGGER IF NOT EXISTS editorial_redirect_events_restrict_delete
BEFORE DELETE ON editorial_redirect_events
BEGIN
  SELECT RAISE(ABORT, 'EDITORIAL_REDIRECT_DELETE_FORBIDDEN');
END;
