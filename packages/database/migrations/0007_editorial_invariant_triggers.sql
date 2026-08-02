PRAGMA foreign_keys = ON;

CREATE TRIGGER IF NOT EXISTS editorial_documents_approval_pointer_insert
BEFORE INSERT ON editorial_documents
WHEN (
  (NEW.workflow_status = 'approved' AND NEW.approved_revision_id <> NEW.working_revision_id)
  OR (NEW.workflow_status <> 'approved' AND NEW.approved_revision_id IS NOT NULL)
)
BEGIN
  SELECT RAISE(ABORT, 'EDITORIAL_APPROVAL_POINTER_INVALID');
END;

CREATE TRIGGER IF NOT EXISTS editorial_documents_approval_pointer_update
BEFORE UPDATE OF workflow_status, working_revision_id, approved_revision_id
ON editorial_documents
WHEN (
  (NEW.workflow_status = 'approved' AND NEW.approved_revision_id <> NEW.working_revision_id)
  OR (NEW.workflow_status <> 'approved' AND NEW.approved_revision_id IS NOT NULL)
)
BEGIN
  SELECT RAISE(ABORT, 'EDITORIAL_APPROVAL_POINTER_INVALID');
END;

CREATE TRIGGER IF NOT EXISTS editorial_documents_publication_pointer_insert
BEFORE INSERT ON editorial_documents
WHEN (
  (NEW.publication_status = 'published' AND (
    NEW.published_revision_id IS NULL
    OR NEW.last_published_revision_id <> NEW.published_revision_id
  ))
  OR (NEW.publication_status = 'withdrawn' AND (
    NEW.published_revision_id IS NOT NULL
    OR NEW.last_published_revision_id IS NULL
  ))
  OR (NEW.publication_status = 'unpublished' AND (
    NEW.published_revision_id IS NOT NULL
    OR NEW.last_published_revision_id IS NOT NULL
  ))
)
BEGIN
  SELECT RAISE(ABORT, 'EDITORIAL_PUBLICATION_POINTER_INVALID');
END;

CREATE TRIGGER IF NOT EXISTS editorial_documents_publication_pointer_update
BEFORE UPDATE OF publication_status, published_revision_id, last_published_revision_id
ON editorial_documents
WHEN (
  (NEW.publication_status = 'published' AND (
    NEW.published_revision_id IS NULL
    OR NEW.last_published_revision_id <> NEW.published_revision_id
  ))
  OR (NEW.publication_status = 'withdrawn' AND (
    NEW.published_revision_id IS NOT NULL
    OR NEW.last_published_revision_id IS NULL
  ))
  OR (NEW.publication_status = 'unpublished' AND (
    NEW.published_revision_id IS NOT NULL
    OR NEW.last_published_revision_id IS NOT NULL
  ))
)
BEGIN
  SELECT RAISE(ABORT, 'EDITORIAL_PUBLICATION_POINTER_INVALID');
END;

CREATE TRIGGER IF NOT EXISTS editorial_documents_revision_links_update
BEFORE UPDATE OF working_revision_id, approved_revision_id, published_revision_id, last_published_revision_id
ON editorial_documents
BEGIN
  SELECT CASE
    WHEN NOT EXISTS (
      SELECT 1 FROM editorial_revisions
      WHERE id = NEW.working_revision_id AND document_id = NEW.id
    )
    THEN RAISE(ABORT, 'EDITORIAL_WORKING_REVISION_INVALID')
  END;

  SELECT CASE
    WHEN NEW.approved_revision_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM editorial_revisions
      WHERE id = NEW.approved_revision_id AND document_id = NEW.id
    )
    THEN RAISE(ABORT, 'EDITORIAL_APPROVED_REVISION_INVALID')
  END;

  SELECT CASE
    WHEN NEW.published_revision_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM editorial_revisions
      WHERE id = NEW.published_revision_id AND document_id = NEW.id
    )
    THEN RAISE(ABORT, 'EDITORIAL_PUBLISHED_REVISION_INVALID')
  END;

  SELECT CASE
    WHEN NEW.last_published_revision_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM editorial_revisions
      WHERE id = NEW.last_published_revision_id AND document_id = NEW.id
    )
    THEN RAISE(ABORT, 'EDITORIAL_LAST_PUBLISHED_REVISION_INVALID')
  END;
END;

CREATE TRIGGER IF NOT EXISTS editorial_reviews_revision_integrity_insert
BEFORE INSERT ON editorial_reviews
BEGIN
  SELECT CASE
    WHEN NOT EXISTS (
      SELECT 1 FROM editorial_revisions
      WHERE id = NEW.revision_id
        AND document_id = NEW.document_id
        AND content_hash = NEW.content_hash
    )
    THEN RAISE(ABORT, 'EDITORIAL_REVIEW_REVISION_INVALID')
  END;
END;

CREATE TRIGGER IF NOT EXISTS editorial_reviews_immutable_update
BEFORE UPDATE ON editorial_reviews
BEGIN
  SELECT RAISE(ABORT, 'EDITORIAL_REVIEW_IMMUTABLE');
END;

CREATE TRIGGER IF NOT EXISTS editorial_events_revision_integrity_insert
BEFORE INSERT ON editorial_events
WHEN NEW.revision_id IS NOT NULL
BEGIN
  SELECT CASE
    WHEN NOT EXISTS (
      SELECT 1 FROM editorial_revisions
      WHERE id = NEW.revision_id AND document_id = NEW.document_id
    )
    THEN RAISE(ABORT, 'EDITORIAL_EVENT_REVISION_INVALID')
  END;
END;

CREATE TRIGGER IF NOT EXISTS editorial_events_immutable_update
BEFORE UPDATE ON editorial_events
BEGIN
  SELECT RAISE(ABORT, 'EDITORIAL_EVENT_IMMUTABLE');
END;

CREATE TRIGGER IF NOT EXISTS editorial_revisions_immutable_update
BEFORE UPDATE ON editorial_revisions
BEGIN
  SELECT RAISE(ABORT, 'EDITORIAL_REVISION_IMMUTABLE');
END;

CREATE TRIGGER IF NOT EXISTS editorial_revisions_restrict_delete
BEFORE DELETE ON editorial_revisions
BEGIN
  SELECT RAISE(ABORT, 'EDITORIAL_REVISION_DELETE_FORBIDDEN');
END;

CREATE TRIGGER IF NOT EXISTS editorial_reviews_restrict_delete
BEFORE DELETE ON editorial_reviews
BEGIN
  SELECT RAISE(ABORT, 'EDITORIAL_REVIEW_DELETE_FORBIDDEN');
END;

CREATE TRIGGER IF NOT EXISTS editorial_events_restrict_delete
BEFORE DELETE ON editorial_events
BEGIN
  SELECT RAISE(ABORT, 'EDITORIAL_EVENT_DELETE_FORBIDDEN');
END;
