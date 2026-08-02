PRAGMA foreign_keys = ON;

CREATE TRIGGER IF NOT EXISTS editorial_documents_initial_state_guard
BEFORE INSERT ON editorial_documents
WHEN (
  NEW.workflow_status <> 'draft'
  OR NEW.publication_status <> 'unpublished'
  OR NEW.approved_revision_id IS NOT NULL
  OR NEW.published_revision_id IS NOT NULL
  OR NEW.last_published_revision_id IS NOT NULL
  OR NEW.version <> 1
)
BEGIN
  SELECT RAISE(ABORT, 'EDITORIAL_INITIAL_STATE_INVALID');
END;

CREATE TRIGGER IF NOT EXISTS editorial_revisions_contiguous_sequence_insert
BEFORE INSERT ON editorial_revisions
WHEN NEW.sequence <> (
  SELECT COALESCE(MAX(sequence), 0) + 1
  FROM editorial_revisions
  WHERE document_id = NEW.document_id
)
BEGIN
  SELECT RAISE(ABORT, 'EDITORIAL_REVISION_SEQUENCE_INVALID');
END;

CREATE TRIGGER IF NOT EXISTS editorial_revisions_created_at_guard
BEFORE INSERT ON editorial_revisions
WHEN NEW.created_at < (
  SELECT created_at FROM editorial_documents WHERE id = NEW.document_id
)
BEGIN
  SELECT RAISE(ABORT, 'EDITORIAL_REVISION_TIMESTAMP_INVALID');
END;

CREATE TRIGGER IF NOT EXISTS editorial_documents_approval_review_guard
BEFORE UPDATE OF workflow_status, approved_revision_id
ON editorial_documents
WHEN NEW.workflow_status = 'approved'
BEGIN
  SELECT CASE
    WHEN NOT EXISTS (
      SELECT 1
      FROM editorial_reviews AS review
      JOIN editorial_revisions AS revision
        ON revision.id = review.revision_id
       AND revision.document_id = review.document_id
       AND revision.content_hash = review.content_hash
      WHERE review.document_id = NEW.id
        AND review.revision_id = NEW.approved_revision_id
    )
    THEN RAISE(ABORT, 'EDITORIAL_APPROVAL_REVIEW_REQUIRED')
  END;
END;

CREATE TRIGGER IF NOT EXISTS editorial_documents_publication_review_guard
BEFORE UPDATE OF publication_status, published_revision_id
ON editorial_documents
WHEN NEW.publication_status = 'published'
BEGIN
  SELECT CASE
    WHEN NOT EXISTS (
      SELECT 1
      FROM editorial_reviews AS review
      JOIN editorial_revisions AS revision
        ON revision.id = review.revision_id
       AND revision.document_id = review.document_id
       AND revision.content_hash = review.content_hash
      WHERE review.document_id = NEW.id
        AND review.revision_id = NEW.published_revision_id
    )
    THEN RAISE(ABORT, 'EDITORIAL_PUBLICATION_REVIEW_REQUIRED')
  END;
END;

CREATE TRIGGER IF NOT EXISTS editorial_reviews_reviewed_at_guard
BEFORE INSERT ON editorial_reviews
WHEN NEW.reviewed_at < (
  SELECT created_at FROM editorial_revisions WHERE id = NEW.revision_id
)
BEGIN
  SELECT RAISE(ABORT, 'EDITORIAL_REVIEW_TIMESTAMP_INVALID');
END;

CREATE TRIGGER IF NOT EXISTS editorial_events_kind_revision_guard
BEFORE INSERT ON editorial_events
WHEN (
  NEW.kind IN (
    'editorial.revision_created',
    'editorial.submitted_for_review',
    'editorial.reopened_as_draft',
    'editorial.approved',
    'editorial.published',
    'editorial.rolled_back'
  )
  AND NEW.revision_id IS NULL
) OR (
  NEW.kind IN ('editorial.document_created', 'editorial.withdrawn')
  AND NEW.revision_id IS NOT NULL
)
BEGIN
  SELECT RAISE(ABORT, 'EDITORIAL_EVENT_REVISION_REQUIREMENT_INVALID');
END;

CREATE TRIGGER IF NOT EXISTS editorial_events_contiguous_sequence_insert
BEFORE INSERT ON editorial_events
WHEN NEW.sequence <> (
  SELECT COALESCE(MAX(sequence), 0) + 1
  FROM editorial_events
  WHERE document_id = NEW.document_id
)
BEGIN
  SELECT RAISE(ABORT, 'EDITORIAL_EVENT_SEQUENCE_INVALID');
END;

CREATE TRIGGER IF NOT EXISTS editorial_events_occurred_at_guard
BEFORE INSERT ON editorial_events
WHEN NEW.occurred_at < (
  SELECT created_at FROM editorial_documents WHERE id = NEW.document_id
)
BEGIN
  SELECT RAISE(ABORT, 'EDITORIAL_EVENT_TIMESTAMP_INVALID');
END;

CREATE TRIGGER IF NOT EXISTS editorial_documents_restrict_delete
BEFORE DELETE ON editorial_documents
BEGIN
  SELECT RAISE(ABORT, 'EDITORIAL_DOCUMENT_DELETE_FORBIDDEN');
END;
