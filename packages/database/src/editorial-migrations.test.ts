import { describe, expect, it } from "vitest";
import { createSqliteDatabase, migrate } from "./adapters/sqlite";

const createdAt = "2026-08-01T23:00:00.000Z";
const reviewedAt = "2026-08-01T23:10:00.000Z";
const hashA = "a".repeat(64);
const hashB = "b".repeat(64);

function seedDocument(
  database: ReturnType<typeof createSqliteDatabase>,
): void {
  const transaction = database.$client.transaction(() => {
    database.$client
      .prepare(
        `INSERT INTO editorial_documents (
          id, kind, slug, workflow_status, publication_status,
          working_revision_id, approved_revision_id, published_revision_id,
          last_published_revision_id, version, created_at, updated_at
        ) VALUES (
          'document-1', 'project', 'semog-site', 'draft', 'unpublished',
          'revision-1', NULL, NULL, NULL, 1, ?, ?
        )`,
      )
      .run(createdAt, createdAt);
    database.$client
      .prepare(
        `INSERT INTO editorial_revisions (
          id, document_id, sequence, title, excerpt, body_markdown, tags_json,
          content_hash, created_by, created_at
        ) VALUES (
          'revision-1', 'document-1', 1, 'SemogSite', 'Descrição pública.',
          '# SemogSite', '["typescript"]', ?, 'semogtw-owner', ?
        )`,
      )
      .run(hashA, createdAt);
    database.$client
      .prepare(
        `INSERT INTO editorial_events (
          id, document_id, sequence, kind, actor, revision_id, summary, reason,
          before_json, after_json, occurred_at, idempotency_key, correlation_id
        ) VALUES (
          'event-1', 'document-1', 1, 'editorial.document_created',
          'semogtw-owner', NULL, 'Document created.', NULL, NULL, '{}', ?,
          'create-document-1', 'correlation-document-1'
        )`,
      )
      .run(createdAt);
  });
  transaction.immediate();
}

function insertApproval(
  database: ReturnType<typeof createSqliteDatabase>,
  revisionId = "revision-1",
  contentHash = hashA,
): void {
  database.$client
    .prepare(
      `INSERT INTO editorial_reviews (
        id, document_id, revision_id, content_hash, reviewer_id, reason, notes,
        credentials_reviewed, personal_data_reviewed,
        operational_metadata_reviewed, external_links_reviewed,
        legal_attribution_reviewed, factual_claims_reviewed,
        markdown_safety_reviewed, reviewed_at, idempotency_key
      ) VALUES (
        ?, 'document-1', ?, ?, 'semogtw-owner', 'Reviewed.', NULL,
        1, 1, 1, 1, 1, 1, 1, ?, ?
      )`,
    )
    .run(
      `approval-${revisionId}`,
      revisionId,
      contentHash,
      reviewedAt,
      `approval-key-${revisionId}`,
    );
}

describe("editorial migrations", () => {
  it("applies the editorial tables, indexes and invariant triggers", () => {
    const database = createSqliteDatabase(":memory:");
    migrate(database);

    const tables = database.$client
      .prepare(
        `SELECT name FROM sqlite_master
         WHERE type = 'table' AND name LIKE 'editorial_%'
         ORDER BY name`,
      )
      .all();
    expect(tables).toEqual([
      { name: "editorial_documents" },
      { name: "editorial_events" },
      { name: "editorial_redirect_events" },
      { name: "editorial_reviews" },
      { name: "editorial_revisions" },
    ]);

    const triggers = database.$client
      .prepare(
        `SELECT name FROM sqlite_master
         WHERE type = 'trigger' AND name LIKE 'editorial_%'
         ORDER BY name`,
      )
      .all() as Array<{ name: string }>;
    expect(triggers.map((trigger) => trigger.name)).toEqual(
      expect.arrayContaining([
        "editorial_documents_approval_review_guard",
        "editorial_documents_publication_review_guard",
        "editorial_documents_revision_links_update",
        "editorial_events_contiguous_sequence_insert",
        "editorial_events_immutable_update",
        "editorial_redirect_events_contiguous_sequence_insert",
        "editorial_redirect_events_immutable_update",
        "editorial_reviews_revision_integrity_insert",
        "editorial_revisions_contiguous_sequence_insert",
        "editorial_revisions_immutable_update",
      ]),
    );
    database.$client.close();
  });

  it("supports atomic initial document/revision/event creation", () => {
    const database = createSqliteDatabase(":memory:");
    migrate(database);

    expect(() => seedDocument(database)).not.toThrow();
    expect(
      database.$client
        .prepare(
          `SELECT workflow_status, publication_status, working_revision_id,
                  version FROM editorial_documents WHERE id = 'document-1'`,
        )
        .get(),
    ).toEqual({
      workflow_status: "draft",
      publication_status: "unpublished",
      working_revision_id: "revision-1",
      version: 1,
    });
    expect(
      database.$client
        .prepare("SELECT sequence FROM editorial_revisions WHERE id = 'revision-1'")
        .get(),
    ).toEqual({ sequence: 1 });
    expect(
      database.$client
        .prepare("SELECT sequence FROM editorial_events WHERE id = 'event-1'")
        .get(),
    ).toEqual({ sequence: 1 });
    database.$client.close();
  });

  it("requires a matching persisted review before approval and publication", () => {
    const database = createSqliteDatabase(":memory:");
    migrate(database);
    seedDocument(database);

    expect(() =>
      database.$client
        .prepare(
          `UPDATE editorial_documents
           SET workflow_status = 'approved', approved_revision_id = 'revision-1',
               version = 2, updated_at = ?
           WHERE id = 'document-1'`,
        )
        .run(reviewedAt),
    ).toThrow("EDITORIAL_APPROVAL_REVIEW_REQUIRED");

    insertApproval(database);
    expect(() =>
      database.$client
        .prepare(
          `UPDATE editorial_documents
           SET workflow_status = 'approved', approved_revision_id = 'revision-1',
               version = 2, updated_at = ?
           WHERE id = 'document-1'`,
        )
        .run(reviewedAt),
    ).not.toThrow();
    expect(() =>
      database.$client
        .prepare(
          `UPDATE editorial_documents
           SET publication_status = 'published',
               published_revision_id = 'revision-1',
               last_published_revision_id = 'revision-1',
               version = 3, updated_at = ?
           WHERE id = 'document-1'`,
        )
        .run("2026-08-01T23:20:00.000Z"),
    ).not.toThrow();
    database.$client.close();
  });

  it("enforces contiguous immutable revisions and matching review hashes", () => {
    const database = createSqliteDatabase(":memory:");
    migrate(database);
    seedDocument(database);

    expect(() =>
      database.$client
        .prepare(
          `INSERT INTO editorial_revisions (
            id, document_id, sequence, title, excerpt, body_markdown,
            tags_json, content_hash, created_by, created_at
          ) VALUES (
            'revision-2', 'document-1', 3, 'Update', 'Excerpt', '# Update',
            '[]', ?, 'semogtw-owner', ?
          )`,
        )
        .run(hashB, reviewedAt),
    ).toThrow("EDITORIAL_REVISION_SEQUENCE_INVALID");

    database.$client
      .prepare(
        `INSERT INTO editorial_revisions (
          id, document_id, sequence, title, excerpt, body_markdown, tags_json,
          content_hash, created_by, created_at
        ) VALUES (
          'revision-2', 'document-1', 2, 'Update', 'Excerpt', '# Update',
          '[]', ?, 'semogtw-owner', ?
        )`,
      )
      .run(hashB, reviewedAt);

    expect(() => insertApproval(database, "revision-2", hashA)).toThrow(
      "EDITORIAL_REVIEW_REVISION_INVALID",
    );
    expect(() =>
      database.$client
        .prepare("UPDATE editorial_revisions SET title = 'Changed' WHERE id = 'revision-1'")
        .run(),
    ).toThrow("EDITORIAL_REVISION_IMMUTABLE");
    expect(() =>
      database.$client
        .prepare("DELETE FROM editorial_revisions WHERE id = 'revision-1'")
        .run(),
    ).toThrow("EDITORIAL_REVISION_DELETE_FORBIDDEN");
    database.$client.close();
  });

  it("rejects invalid event revision requirements, sequence gaps and mutation", () => {
    const database = createSqliteDatabase(":memory:");
    migrate(database);
    seedDocument(database);

    expect(() =>
      database.$client
        .prepare(
          `INSERT INTO editorial_events (
            id, document_id, sequence, kind, actor, revision_id, summary,
            reason, before_json, after_json, occurred_at, idempotency_key,
            correlation_id
          ) VALUES (
            'event-gap', 'document-1', 3, 'editorial.submitted_for_review',
            'owner', 'revision-1', 'Submitted.', NULL, '{}', '{}', ?,
            'event-gap-key', 'event-gap-correlation'
          )`,
        )
        .run(reviewedAt),
    ).toThrow("EDITORIAL_EVENT_SEQUENCE_INVALID");

    expect(() =>
      database.$client
        .prepare(
          `INSERT INTO editorial_events (
            id, document_id, sequence, kind, actor, revision_id, summary,
            reason, before_json, after_json, occurred_at, idempotency_key,
            correlation_id
          ) VALUES (
            'event-invalid', 'document-1', 2, 'editorial.withdrawn',
            'owner', 'revision-1', 'Withdrawn.', 'Reason', '{}', '{}', ?,
            'event-invalid-key', 'event-invalid-correlation'
          )`,
        )
        .run(reviewedAt),
    ).toThrow("EDITORIAL_EVENT_REVISION_REQUIREMENT_INVALID");

    database.$client
      .prepare(
        `INSERT INTO editorial_events (
          id, document_id, sequence, kind, actor, revision_id, summary,
          reason, before_json, after_json, occurred_at, idempotency_key,
          correlation_id
        ) VALUES (
          'event-2', 'document-1', 2, 'editorial.submitted_for_review',
          'owner', 'revision-1', 'Submitted.', NULL, '{}', '{}', ?,
          'event-2-key', 'event-2-correlation'
        )`,
      )
      .run(reviewedAt);
    expect(() =>
      database.$client
        .prepare("UPDATE editorial_events SET summary = 'Changed' WHERE id = 'event-2'")
        .run(),
    ).toThrow("EDITORIAL_EVENT_IMMUTABLE");
    database.$client.close();
  });
});
