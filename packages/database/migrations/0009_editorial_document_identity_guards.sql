PRAGMA foreign_keys = ON;

CREATE TRIGGER IF NOT EXISTS editorial_documents_identity_immutable_update
BEFORE UPDATE ON editorial_documents
WHEN (
  NEW.id <> OLD.id
  OR NEW.kind <> OLD.kind
  OR NEW.slug <> OLD.slug
  OR NEW.created_at <> OLD.created_at
)
BEGIN
  SELECT RAISE(ABORT, 'EDITORIAL_DOCUMENT_IDENTITY_IMMUTABLE');
END;

CREATE TRIGGER IF NOT EXISTS editorial_documents_version_guard
BEFORE UPDATE ON editorial_documents
WHEN NEW.version <> OLD.version + 1
BEGIN
  SELECT RAISE(ABORT, 'EDITORIAL_DOCUMENT_VERSION_INVALID');
END;

CREATE TRIGGER IF NOT EXISTS editorial_documents_updated_at_guard
BEFORE UPDATE ON editorial_documents
WHEN NEW.updated_at < OLD.updated_at
BEGIN
  SELECT RAISE(ABORT, 'EDITORIAL_DOCUMENT_TIMESTAMP_INVALID');
END;

CREATE TRIGGER IF NOT EXISTS editorial_documents_published_history_guard
BEFORE UPDATE ON editorial_documents
WHEN (
  OLD.last_published_revision_id IS NOT NULL
  AND NEW.last_published_revision_id IS NULL
)
BEGIN
  SELECT RAISE(ABORT, 'EDITORIAL_PUBLISHED_HISTORY_REQUIRED');
END;
