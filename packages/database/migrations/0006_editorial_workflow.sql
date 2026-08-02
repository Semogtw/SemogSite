PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS editorial_documents (
  id TEXT PRIMARY KEY NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('project', 'note', 'experiment', 'page')),
  slug TEXT NOT NULL,
  workflow_status TEXT NOT NULL CHECK (workflow_status IN ('draft', 'in_review', 'approved')),
  publication_status TEXT NOT NULL CHECK (publication_status IN ('unpublished', 'published', 'withdrawn')),
  working_revision_id TEXT NOT NULL,
  approved_revision_id TEXT,
  published_revision_id TEXT,
  last_published_revision_id TEXT,
  version INTEGER NOT NULL CHECK (version >= 1),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (
    (workflow_status = 'approved' AND approved_revision_id = working_revision_id)
    OR (workflow_status <> 'approved')
  ),
  CHECK (
    (publication_status = 'published' AND published_revision_id IS NOT NULL)
    OR (publication_status <> 'published' AND published_revision_id IS NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS editorial_documents_slug_unique
  ON editorial_documents (slug);
CREATE INDEX IF NOT EXISTS editorial_documents_workflow_status_index
  ON editorial_documents (workflow_status, updated_at DESC);
CREATE INDEX IF NOT EXISTS editorial_documents_publication_status_index
  ON editorial_documents (publication_status, updated_at DESC);

CREATE TABLE IF NOT EXISTS editorial_revisions (
  id TEXT PRIMARY KEY NOT NULL,
  document_id TEXT NOT NULL,
  sequence INTEGER NOT NULL CHECK (sequence >= 1),
  title TEXT NOT NULL,
  excerpt TEXT NOT NULL,
  body_markdown TEXT NOT NULL,
  tags_json TEXT NOT NULL,
  content_hash TEXT NOT NULL CHECK (length(content_hash) = 64),
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (document_id) REFERENCES editorial_documents(id) ON DELETE RESTRICT
);

CREATE UNIQUE INDEX IF NOT EXISTS editorial_revisions_document_sequence_unique
  ON editorial_revisions (document_id, sequence);
CREATE INDEX IF NOT EXISTS editorial_revisions_document_created_index
  ON editorial_revisions (document_id, created_at DESC);
CREATE INDEX IF NOT EXISTS editorial_revisions_content_hash_index
  ON editorial_revisions (document_id, content_hash);

CREATE TABLE IF NOT EXISTS editorial_reviews (
  id TEXT PRIMARY KEY NOT NULL,
  document_id TEXT NOT NULL,
  revision_id TEXT NOT NULL,
  content_hash TEXT NOT NULL CHECK (length(content_hash) = 64),
  reviewer_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  notes TEXT,
  credentials_reviewed INTEGER NOT NULL CHECK (credentials_reviewed = 1),
  personal_data_reviewed INTEGER NOT NULL CHECK (personal_data_reviewed = 1),
  operational_metadata_reviewed INTEGER NOT NULL CHECK (operational_metadata_reviewed = 1),
  external_links_reviewed INTEGER NOT NULL CHECK (external_links_reviewed = 1),
  legal_attribution_reviewed INTEGER NOT NULL CHECK (legal_attribution_reviewed = 1),
  factual_claims_reviewed INTEGER NOT NULL CHECK (factual_claims_reviewed = 1),
  markdown_safety_reviewed INTEGER NOT NULL CHECK (markdown_safety_reviewed = 1),
  reviewed_at TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  FOREIGN KEY (document_id) REFERENCES editorial_documents(id) ON DELETE RESTRICT,
  FOREIGN KEY (revision_id) REFERENCES editorial_revisions(id) ON DELETE RESTRICT
);

CREATE UNIQUE INDEX IF NOT EXISTS editorial_reviews_document_idempotency_unique
  ON editorial_reviews (document_id, idempotency_key);
CREATE INDEX IF NOT EXISTS editorial_reviews_revision_index
  ON editorial_reviews (revision_id, reviewed_at DESC);

CREATE TABLE IF NOT EXISTS editorial_events (
  id TEXT PRIMARY KEY NOT NULL,
  document_id TEXT NOT NULL,
  sequence INTEGER NOT NULL CHECK (sequence >= 1),
  kind TEXT NOT NULL CHECK (
    kind IN (
      'editorial.document_created',
      'editorial.revision_created',
      'editorial.submitted_for_review',
      'editorial.reopened_as_draft',
      'editorial.approved',
      'editorial.published',
      'editorial.withdrawn',
      'editorial.rolled_back'
    )
  ),
  actor TEXT NOT NULL,
  revision_id TEXT,
  summary TEXT NOT NULL,
  reason TEXT,
  before_json TEXT,
  after_json TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  correlation_id TEXT NOT NULL,
  FOREIGN KEY (document_id) REFERENCES editorial_documents(id) ON DELETE RESTRICT,
  FOREIGN KEY (revision_id) REFERENCES editorial_revisions(id) ON DELETE RESTRICT
);

CREATE UNIQUE INDEX IF NOT EXISTS editorial_events_document_sequence_unique
  ON editorial_events (document_id, sequence);
CREATE UNIQUE INDEX IF NOT EXISTS editorial_events_document_idempotency_unique
  ON editorial_events (document_id, idempotency_key);
CREATE INDEX IF NOT EXISTS editorial_events_document_occurred_index
  ON editorial_events (document_id, occurred_at DESC);
