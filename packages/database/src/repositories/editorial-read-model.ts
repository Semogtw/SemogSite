import type {
  EditorialDocumentSnapshot,
  EditorialEventKind,
  EditorialRevisionSnapshot,
  EditorialRedirectEventSnapshot,
  EditorialSensitiveReviewChecks,
  JsonValue,
} from "@semogtw/domain";
import type { SqliteDatabase } from "../adapters/sqlite";

export type EditorialDocumentListItem = {
  document: EditorialDocumentSnapshot;
  workingTitle: string | null;
  publishedTitle: string | null;
};

export type EditorialRevisionView = EditorialRevisionSnapshot & {
  malformedTags: boolean;
};

export type EditorialReviewView = {
  id: string;
  documentId: string;
  revisionId: string;
  contentHash: string;
  reviewerId: string;
  reason: string;
  notes: string | null;
  checks: EditorialSensitiveReviewChecks;
  checksComplete: boolean;
  reviewedAt: string;
};

export type EditorialHistoryEventKind =
  | EditorialEventKind
  | "editorial.document_created"
  | "editorial.revision_created";

export type EditorialHistoryEvent = {
  id: string;
  sequence: number;
  kind: EditorialHistoryEventKind;
  actor: string;
  revisionId: string | null;
  summary: string;
  reason: string | null;
  before: JsonValue | null;
  after: JsonValue | null;
  occurredAt: string;
  correlationId: string;
  malformedJson: readonly ("before" | "after")[];
};

export type EditorialDocumentDetail = {
  document: EditorialDocumentSnapshot;
  revisions: readonly EditorialRevisionView[];
  reviews: readonly EditorialReviewView[];
  events: readonly EditorialHistoryEvent[];
  redirects: readonly EditorialRedirectEventSnapshot[];
};

type DocumentRow = {
  id: string;
  kind: EditorialDocumentSnapshot["kind"];
  slug: string;
  workflow_status: EditorialDocumentSnapshot["workflowStatus"];
  publication_status: EditorialDocumentSnapshot["publicationStatus"];
  working_revision_id: string;
  approved_revision_id: string | null;
  published_revision_id: string | null;
  last_published_revision_id: string | null;
  version: number;
  created_at: string;
  updated_at: string;
};

type ListRow = DocumentRow & {
  working_title: string | null;
  published_title: string | null;
};

type RevisionRow = {
  id: string;
  document_id: string;
  sequence: number;
  title: string;
  excerpt: string;
  body_markdown: string;
  tags_json: string;
  content_hash: string;
  created_by: string;
  created_at: string;
};

type ReviewRow = {
  id: string;
  document_id: string;
  revision_id: string;
  content_hash: string;
  reviewer_id: string;
  reason: string;
  notes: string | null;
  credentials_reviewed: number;
  personal_data_reviewed: number;
  operational_metadata_reviewed: number;
  external_links_reviewed: number;
  legal_attribution_reviewed: number;
  factual_claims_reviewed: number;
  markdown_safety_reviewed: number;
  reviewed_at: string;
};

type EventRow = {
  id: string;
  sequence: number;
  kind: EditorialHistoryEventKind;
  actor: string;
  revision_id: string | null;
  summary: string;
  reason: string | null;
  before_json: string | null;
  after_json: string;
  occurred_at: string;
  correlation_id: string;
};

type RedirectRow = {
  id: string;
  source_slug: string;
  kind: EditorialRedirectEventSnapshot["kind"];
  target_document_id: string;
  sequence: number;
  action: EditorialRedirectEventSnapshot["action"];
  actor: string;
  reason: string;
  occurred_at: string;
  idempotency_key: string;
  correlation_id: string;
};

const documentSelect = `
  SELECT id, kind, slug, workflow_status, publication_status,
         working_revision_id, approved_revision_id, published_revision_id,
         last_published_revision_id, version, created_at, updated_at
  FROM editorial_documents`;

function normalizeLimit(value: number): number {
  if (!Number.isFinite(value)) return 50;
  return Math.min(100, Math.max(1, Math.floor(value)));
}

function toDocument(row: DocumentRow): EditorialDocumentSnapshot {
  return {
    id: row.id,
    kind: row.kind,
    slug: row.slug,
    workflowStatus: row.workflow_status,
    publicationStatus: row.publication_status,
    workingRevisionId: row.working_revision_id,
    approvedRevisionId: row.approved_revision_id,
    publishedRevisionId: row.published_revision_id,
    lastPublishedRevisionId: row.last_published_revision_id,
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function parseTags(value: string): {
  tags: readonly string[];
  malformed: boolean;
} {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) && parsed.every((tag) => typeof tag === "string")
      ? { tags: parsed, malformed: false }
      : { tags: [], malformed: true };
  } catch {
    return { tags: [], malformed: true };
  }
}

function parseHistorical(value: string | null): {
  value: JsonValue | null;
  malformed: boolean;
} {
  if (value === null) return { value: null, malformed: false };
  try {
    return { value: JSON.parse(value) as JsonValue, malformed: false };
  } catch {
    return { value: null, malformed: true };
  }
}

function toRevision(row: RevisionRow): EditorialRevisionView {
  const tags = parseTags(row.tags_json);
  return {
    id: row.id,
    documentId: row.document_id,
    sequence: row.sequence,
    title: row.title,
    excerpt: row.excerpt,
    bodyMarkdown: row.body_markdown,
    tags: tags.tags,
    contentHash: row.content_hash,
    createdBy: row.created_by,
    createdAt: row.created_at,
    malformedTags: tags.malformed,
  };
}

function toReview(row: ReviewRow): EditorialReviewView {
  const checks: EditorialSensitiveReviewChecks = {
    credentials: row.credentials_reviewed === 1,
    personalData: row.personal_data_reviewed === 1,
    operationalMetadata: row.operational_metadata_reviewed === 1,
    externalLinks: row.external_links_reviewed === 1,
    legalAttribution: row.legal_attribution_reviewed === 1,
    factualClaims: row.factual_claims_reviewed === 1,
    markdownSafety: row.markdown_safety_reviewed === 1,
  };
  return {
    id: row.id,
    documentId: row.document_id,
    revisionId: row.revision_id,
    contentHash: row.content_hash,
    reviewerId: row.reviewer_id,
    reason: row.reason,
    notes: row.notes,
    checks,
    checksComplete: Object.values(checks).every(Boolean),
    reviewedAt: row.reviewed_at,
  };
}


function toRedirect(row: RedirectRow): EditorialRedirectEventSnapshot {
  return {
    id: row.id,
    sourceSlug: row.source_slug,
    kind: row.kind,
    targetDocumentId: row.target_document_id,
    sequence: row.sequence,
    action: row.action,
    actor: row.actor,
    reason: row.reason,
    occurredAt: row.occurred_at,
    idempotencyKey: row.idempotency_key,
    correlationId: row.correlation_id,
  };
}

export class SqliteEditorialReadModel {
  constructor(private readonly database: SqliteDatabase) {}

  async listDocuments(input: {
    limit: number;
  }): Promise<readonly EditorialDocumentListItem[]> {
    const rows = this.database.$client
      .prepare(
        `SELECT document.id, document.kind, document.slug,
                document.workflow_status, document.publication_status,
                document.working_revision_id, document.approved_revision_id,
                document.published_revision_id,
                document.last_published_revision_id, document.version,
                document.created_at, document.updated_at,
                working.title AS working_title,
                published.title AS published_title
         FROM editorial_documents AS document
         LEFT JOIN editorial_revisions AS working
           ON working.id = document.working_revision_id
          AND working.document_id = document.id
         LEFT JOIN editorial_revisions AS published
           ON published.id = document.published_revision_id
          AND published.document_id = document.id
         ORDER BY document.updated_at DESC, document.slug ASC
         LIMIT ?`,
      )
      .all(normalizeLimit(input.limit)) as ListRow[];

    return rows.map((row) => ({
      document: toDocument(row),
      workingTitle: row.working_title,
      publishedTitle: row.published_title,
    }));
  }

  async getDocument(documentId: string): Promise<EditorialDocumentDetail | null> {
    const row = this.database.$client
      .prepare(`${documentSelect} WHERE id = ?`)
      .get(documentId) as DocumentRow | undefined;
    if (row === undefined) return null;

    const revisionRows = this.database.$client
      .prepare(
        `SELECT id, document_id, sequence, title, excerpt, body_markdown,
                tags_json, content_hash, created_by, created_at
         FROM editorial_revisions
         WHERE document_id = ?
         ORDER BY sequence DESC, id DESC
         LIMIT 100`,
      )
      .all(documentId) as RevisionRow[];
    const reviewRows = this.database.$client
      .prepare(
        `SELECT id, document_id, revision_id, content_hash, reviewer_id,
                reason, notes, credentials_reviewed, personal_data_reviewed,
                operational_metadata_reviewed, external_links_reviewed,
                legal_attribution_reviewed, factual_claims_reviewed,
                markdown_safety_reviewed, reviewed_at
         FROM editorial_reviews
         WHERE document_id = ?
         ORDER BY reviewed_at DESC, id DESC
         LIMIT 100`,
      )
      .all(documentId) as ReviewRow[];
    const eventRows = this.database.$client
      .prepare(
        `SELECT id, sequence, kind, actor, revision_id, summary, reason,
                before_json, after_json, occurred_at, correlation_id
         FROM editorial_events
         WHERE document_id = ?
         ORDER BY sequence DESC, id DESC
         LIMIT 200`,
      )
      .all(documentId) as EventRow[];
    const redirectRows = this.database.$client
      .prepare(
        `SELECT id, source_slug, kind, target_document_id, sequence, action,
                actor, reason, occurred_at, idempotency_key, correlation_id
         FROM editorial_redirect_events
         WHERE target_document_id = ?
         ORDER BY occurred_at DESC, source_slug ASC, sequence DESC
         LIMIT 200`,
      )
      .all(documentId) as RedirectRow[];

    return {
      document: toDocument(row),
      revisions: revisionRows.map(toRevision),
      reviews: reviewRows.map(toReview),
      redirects: redirectRows.map(toRedirect),
      events: eventRows.map((event): EditorialHistoryEvent => {
        const before = parseHistorical(event.before_json);
        const after = parseHistorical(event.after_json);
        const malformedJson: ("before" | "after")[] = [];
        if (before.malformed) malformedJson.push("before");
        if (after.malformed) malformedJson.push("after");
        return {
          id: event.id,
          sequence: event.sequence,
          kind: event.kind,
          actor: event.actor,
          revisionId: event.revision_id,
          summary: event.summary,
          reason: event.reason,
          before: before.value,
          after: after.value,
          occurredAt: event.occurred_at,
          correlationId: event.correlation_id,
          malformedJson,
        };
      }),
    };
  }
}
