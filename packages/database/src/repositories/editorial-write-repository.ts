import type {
  EditorialApprovalSnapshot,
  EditorialDocumentSnapshot,
  EditorialPersistenceEvent,
  EditorialRevisionSnapshot,
  EditorialWriteRepository,
  EditorialWriteStoreResult,
} from "@semogtw/domain";
import type { SqliteDatabase } from "../adapters/sqlite";

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
  document_id: string;
  sequence: number;
  kind: EditorialPersistenceEvent["kind"];
  actor: string;
  revision_id: string | null;
  summary: string;
  reason: string | null;
  before_json: string | null;
  after_json: string;
  occurred_at: string;
  idempotency_key: string;
  correlation_id: string;
};

const documentSelect = `
  SELECT id, kind, slug, workflow_status, publication_status,
         working_revision_id, approved_revision_id, published_revision_id,
         last_published_revision_id, version, created_at, updated_at
  FROM editorial_documents`;
const revisionSelect = `
  SELECT id, document_id, sequence, title, excerpt, body_markdown, tags_json,
         content_hash, created_by, created_at
  FROM editorial_revisions`;
const eventSelect = `
  SELECT id, document_id, sequence, kind, actor, revision_id, summary, reason,
         before_json, after_json, occurred_at, idempotency_key, correlation_id
  FROM editorial_events`;

function parseTags(value: string): readonly string[] | null {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) && parsed.every((tag) => typeof tag === "string")
      ? parsed
      : null;
  } catch {
    return null;
  }
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

function toRevision(row: RevisionRow): EditorialRevisionSnapshot | null {
  const tags = parseTags(row.tags_json);
  if (tags === null) return null;
  return {
    id: row.id,
    documentId: row.document_id,
    sequence: row.sequence,
    title: row.title,
    excerpt: row.excerpt,
    bodyMarkdown: row.body_markdown,
    tags,
    contentHash: row.content_hash,
    createdBy: row.created_by,
    createdAt: row.created_at,
  };
}

function toApproval(row: ReviewRow): EditorialApprovalSnapshot {
  return {
    id: row.id,
    documentId: row.document_id,
    revisionId: row.revision_id,
    contentHash: row.content_hash,
    reviewerId: row.reviewer_id,
    reason: row.reason,
    notes: row.notes,
    checks: {
      credentials: row.credentials_reviewed === 1,
      personalData: row.personal_data_reviewed === 1,
      operationalMetadata: row.operational_metadata_reviewed === 1,
      externalLinks: row.external_links_reviewed === 1,
      legalAttribution: row.legal_attribution_reviewed === 1,
      factualClaims: row.factual_claims_reviewed === 1,
      markdownSafety: row.markdown_safety_reviewed === 1,
    },
    reviewedAt: row.reviewed_at,
  };
}

function sameDocument(
  left: EditorialDocumentSnapshot,
  right: EditorialDocumentSnapshot,
): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function sameRevision(
  left: EditorialRevisionSnapshot,
  right: EditorialRevisionSnapshot,
): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function sameApproval(
  left: EditorialApprovalSnapshot,
  right: EditorialApprovalSnapshot,
): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function sameEvent(row: EventRow, event: EditorialPersistenceEvent): boolean {
  return (
    row.id === event.id &&
    row.document_id === event.documentId &&
    row.kind === event.kind &&
    row.actor === event.actor &&
    row.revision_id === event.revisionId &&
    row.summary === event.summary &&
    row.reason === event.reason &&
    row.before_json ===
      (event.before === null ? null : JSON.stringify(event.before)) &&
    row.after_json === JSON.stringify(event.after) &&
    row.occurred_at === event.occurredAt &&
    row.idempotency_key === event.idempotencyKey &&
    row.correlation_id === event.correlationId
  );
}

function insertEvent(
  database: SqliteDatabase,
  event: EditorialPersistenceEvent,
): void {
  const sequenceRow = database.$client
    .prepare(
      `SELECT COALESCE(MAX(sequence), 0) + 1 AS sequence
       FROM editorial_events WHERE document_id = ?`,
    )
    .get(event.documentId) as { sequence: number };
  database.$client
    .prepare(
      `INSERT INTO editorial_events (
        id, document_id, sequence, kind, actor, revision_id, summary, reason,
        before_json, after_json, occurred_at, idempotency_key, correlation_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      event.id,
      event.documentId,
      sequenceRow.sequence,
      event.kind,
      event.actor,
      event.revisionId,
      event.summary,
      event.reason,
      event.before === null ? null : JSON.stringify(event.before),
      JSON.stringify(event.after),
      event.occurredAt,
      event.idempotencyKey,
      event.correlationId,
    );
}

function insertRevision(
  database: SqliteDatabase,
  revision: EditorialRevisionSnapshot,
): void {
  database.$client
    .prepare(
      `INSERT INTO editorial_revisions (
        id, document_id, sequence, title, excerpt, body_markdown, tags_json,
        content_hash, created_by, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      revision.id,
      revision.documentId,
      revision.sequence,
      revision.title,
      revision.excerpt,
      revision.bodyMarkdown,
      JSON.stringify(revision.tags),
      revision.contentHash,
      revision.createdBy,
      revision.createdAt,
    );
}

function insertApproval(
  database: SqliteDatabase,
  approval: EditorialApprovalSnapshot,
  idempotencyKey: string,
): void {
  database.$client
    .prepare(
      `INSERT INTO editorial_reviews (
        id, document_id, revision_id, content_hash, reviewer_id, reason, notes,
        credentials_reviewed, personal_data_reviewed,
        operational_metadata_reviewed, external_links_reviewed,
        legal_attribution_reviewed, factual_claims_reviewed,
        markdown_safety_reviewed, reviewed_at, idempotency_key
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      approval.id,
      approval.documentId,
      approval.revisionId,
      approval.contentHash,
      approval.reviewerId,
      approval.reason,
      approval.notes,
      approval.checks.credentials ? 1 : 0,
      approval.checks.personalData ? 1 : 0,
      approval.checks.operationalMetadata ? 1 : 0,
      approval.checks.externalLinks ? 1 : 0,
      approval.checks.legalAttribution ? 1 : 0,
      approval.checks.factualClaims ? 1 : 0,
      approval.checks.markdownSafety ? 1 : 0,
      approval.reviewedAt,
      idempotencyKey,
    );
}

function updateDocument(
  database: SqliteDatabase,
  before: EditorialDocumentSnapshot,
  after: EditorialDocumentSnapshot,
): boolean {
  const result = database.$client
    .prepare(
      `UPDATE editorial_documents
       SET kind = ?, slug = ?, workflow_status = ?, publication_status = ?,
           working_revision_id = ?, approved_revision_id = ?,
           published_revision_id = ?, last_published_revision_id = ?,
           version = ?, updated_at = ?
       WHERE id = ? AND version = ? AND updated_at = ?
         AND workflow_status = ? AND publication_status = ?
         AND working_revision_id = ?`,
    )
    .run(
      after.kind,
      after.slug,
      after.workflowStatus,
      after.publicationStatus,
      after.workingRevisionId,
      after.approvedRevisionId,
      after.publishedRevisionId,
      after.lastPublishedRevisionId,
      after.version,
      after.updatedAt,
      before.id,
      before.version,
      before.updatedAt,
      before.workflowStatus,
      before.publicationStatus,
      before.workingRevisionId,
    );
  return result.changes === 1;
}

function existingEvent(
  database: SqliteDatabase,
  documentId: string,
  idempotencyKey: string,
): EventRow | undefined {
  return database.$client
    .prepare(`${eventSelect} WHERE document_id = ? AND idempotency_key = ?`)
    .get(documentId, idempotencyKey) as EventRow | undefined;
}

export class SqliteEditorialWriteRepository implements EditorialWriteRepository {
  constructor(private readonly database: SqliteDatabase) {}

  async findDocument(
    documentId: string,
  ): Promise<EditorialDocumentSnapshot | null> {
    const row = this.database.$client
      .prepare(`${documentSelect} WHERE id = ?`)
      .get(documentId) as DocumentRow | undefined;
    return row === undefined ? null : toDocument(row);
  }

  async findRevision(
    documentId: string,
    revisionId: string,
  ): Promise<EditorialRevisionSnapshot | null> {
    const row = this.database.$client
      .prepare(`${revisionSelect} WHERE document_id = ? AND id = ?`)
      .get(documentId, revisionId) as RevisionRow | undefined;
    return row === undefined ? null : toRevision(row);
  }

  async findApproval(
    documentId: string,
    revisionId: string,
    contentHash: string,
  ): Promise<EditorialApprovalSnapshot | null> {
    const row = this.database.$client
      .prepare(
        `SELECT id, document_id, revision_id, content_hash, reviewer_id, reason,
                notes, credentials_reviewed, personal_data_reviewed,
                operational_metadata_reviewed, external_links_reviewed,
                legal_attribution_reviewed, factual_claims_reviewed,
                markdown_safety_reviewed, reviewed_at
         FROM editorial_reviews
         WHERE document_id = ? AND revision_id = ? AND content_hash = ?
         ORDER BY reviewed_at DESC, id DESC
         LIMIT 1`,
      )
      .get(documentId, revisionId, contentHash) as ReviewRow | undefined;
    return row === undefined ? null : toApproval(row);
  }

  async nextRevisionSequence(documentId: string): Promise<number> {
    const row = this.database.$client
      .prepare(
        `SELECT COALESCE(MAX(sequence), 0) + 1 AS sequence
         FROM editorial_revisions WHERE document_id = ?`,
      )
      .get(documentId) as { sequence: number };
    return row.sequence;
  }

  async createDocument(
    document: EditorialDocumentSnapshot,
    revision: EditorialRevisionSnapshot,
    event: EditorialPersistenceEvent,
  ): Promise<EditorialWriteStoreResult> {
    const transaction = this.database.$client.transaction(() => {
      const previousEvent = existingEvent(
        this.database,
        document.id,
        event.idempotencyKey,
      );
      if (previousEvent !== undefined) {
        const currentRow = this.database.$client
          .prepare(`${documentSelect} WHERE id = ?`)
          .get(document.id) as DocumentRow | undefined;
        const revisionRow = this.database.$client
          .prepare(`${revisionSelect} WHERE id = ? AND document_id = ?`)
          .get(revision.id, document.id) as RevisionRow | undefined;
        const currentRevision =
          revisionRow === undefined ? null : toRevision(revisionRow);
        return currentRow !== undefined &&
          currentRevision !== null &&
          sameDocument(toDocument(currentRow), document) &&
          sameRevision(currentRevision, revision) &&
          sameEvent(previousEvent, event)
          ? ("duplicate" as const)
          : ("conflict" as const);
      }

      const existingDocument = this.database.$client
        .prepare("SELECT id, slug FROM editorial_documents WHERE id = ? OR slug = ?")
        .get(document.id, document.slug) as { id: string; slug: string } | undefined;
      if (existingDocument !== undefined) {
        return existingDocument.id !== document.id
          ? ("slug_conflict" as const)
          : ("conflict" as const);
      }

      this.database.$client
        .prepare(
          `INSERT INTO editorial_documents (
            id, kind, slug, workflow_status, publication_status,
            working_revision_id, approved_revision_id, published_revision_id,
            last_published_revision_id, version, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          document.id,
          document.kind,
          document.slug,
          document.workflowStatus,
          document.publicationStatus,
          document.workingRevisionId,
          document.approvedRevisionId,
          document.publishedRevisionId,
          document.lastPublishedRevisionId,
          document.version,
          document.createdAt,
          document.updatedAt,
        );
      insertRevision(this.database, revision);
      insertEvent(this.database, event);
      return "created" as const;
    });
    return transaction.immediate();
  }

  async createRevision(
    before: EditorialDocumentSnapshot,
    after: EditorialDocumentSnapshot,
    revision: EditorialRevisionSnapshot,
    event: EditorialPersistenceEvent,
  ): Promise<EditorialWriteStoreResult> {
    const transaction = this.database.$client.transaction(() => {
      const previousEvent = existingEvent(
        this.database,
        before.id,
        event.idempotencyKey,
      );
      if (previousEvent !== undefined) {
        const currentRow = this.database.$client
          .prepare(`${documentSelect} WHERE id = ?`)
          .get(before.id) as DocumentRow | undefined;
        const revisionRow = this.database.$client
          .prepare(`${revisionSelect} WHERE id = ? AND document_id = ?`)
          .get(revision.id, before.id) as RevisionRow | undefined;
        const currentRevision =
          revisionRow === undefined ? null : toRevision(revisionRow);
        return currentRow !== undefined &&
          currentRevision !== null &&
          sameDocument(toDocument(currentRow), after) &&
          sameRevision(currentRevision, revision) &&
          sameEvent(previousEvent, event)
          ? ("duplicate" as const)
          : ("conflict" as const);
      }

      const currentRow = this.database.$client
        .prepare(`${documentSelect} WHERE id = ?`)
        .get(before.id) as DocumentRow | undefined;
      if (
        currentRow === undefined ||
        !sameDocument(toDocument(currentRow), before)
      ) {
        return "conflict" as const;
      }

      insertRevision(this.database, revision);
      if (!updateDocument(this.database, before, after)) {
        throw new Error("EDITORIAL_DOCUMENT_CAS_FAILED");
      }
      insertEvent(this.database, event);
      return "created" as const;
    });
    return transaction.immediate();
  }

  async applyTransition(
    before: EditorialDocumentSnapshot,
    after: EditorialDocumentSnapshot,
    event: EditorialPersistenceEvent,
    approval: EditorialApprovalSnapshot | null,
  ): Promise<EditorialWriteStoreResult> {
    const transaction = this.database.$client.transaction(() => {
      const previousEvent = existingEvent(
        this.database,
        before.id,
        event.idempotencyKey,
      );
      if (previousEvent !== undefined) {
        const currentRow = this.database.$client
          .prepare(`${documentSelect} WHERE id = ?`)
          .get(before.id) as DocumentRow | undefined;
        const persistedApproval =
          approval === null
            ? null
            : (this.database.$client
                .prepare(
                  `SELECT id, document_id, revision_id, content_hash, reviewer_id,
                          reason, notes, credentials_reviewed,
                          personal_data_reviewed, operational_metadata_reviewed,
                          external_links_reviewed, legal_attribution_reviewed,
                          factual_claims_reviewed, markdown_safety_reviewed,
                          reviewed_at
                   FROM editorial_reviews WHERE id = ?`,
                )
                .get(approval.id) as ReviewRow | undefined);
        const approvalMatches =
          approval === null ||
          (persistedApproval !== undefined &&
            sameApproval(toApproval(persistedApproval), approval));
        return currentRow !== undefined &&
          sameDocument(toDocument(currentRow), after) &&
          approvalMatches &&
          sameEvent(previousEvent, event)
          ? ("duplicate" as const)
          : ("conflict" as const);
      }

      const currentRow = this.database.$client
        .prepare(`${documentSelect} WHERE id = ?`)
        .get(before.id) as DocumentRow | undefined;
      if (
        currentRow === undefined ||
        !sameDocument(toDocument(currentRow), before)
      ) {
        return "conflict" as const;
      }

      if (approval !== null) {
        insertApproval(this.database, approval, event.idempotencyKey);
      }
      if (!updateDocument(this.database, before, after)) {
        throw new Error("EDITORIAL_DOCUMENT_CAS_FAILED");
      }
      insertEvent(this.database, event);
      return "updated" as const;
    });
    return transaction.immediate();
  }
}
