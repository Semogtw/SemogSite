import { describe, expect, it } from "vitest";
import { createSqliteDatabase, migrate } from "../adapters/sqlite";
import { SqlitePublishedEditorialReadModel } from "./published-editorial-read-model";

const createdAt = "2026-08-01T23:00:00.000Z";
const publishedAt = "2026-08-01T23:20:00.000Z";
const draftAt = "2026-08-01T23:30:00.000Z";
const hashA = "a".repeat(64);
const hashB = "b".repeat(64);

function seed(database: ReturnType<typeof createSqliteDatabase>): void {
  const transaction = database.$client.transaction(() => {
    database.$client.prepare(`
      INSERT INTO editorial_documents (
        id, kind, slug, workflow_status, publication_status,
        working_revision_id, approved_revision_id, published_revision_id,
        last_published_revision_id, version, created_at, updated_at
      ) VALUES (
        'document-1', 'project', 'semog-site', 'draft', 'unpublished',
        'revision-1', NULL, NULL, NULL, 1, ?, ?
      )`).run(createdAt, createdAt);
    database.$client.prepare(`
      INSERT INTO editorial_revisions (
        id, document_id, sequence, title, excerpt, body_markdown, tags_json,
        content_hash, created_by, created_at
      ) VALUES (
        'revision-1', 'document-1', 1, 'SemogSite', 'Public excerpt.',
        '# SemogSite\n\nPublic body.', '["typescript"]', ?, 'owner', ?
      )`).run(hashA, createdAt);
    database.$client.prepare(`
      INSERT INTO editorial_events (
        id, document_id, sequence, kind, actor, revision_id, summary, reason,
        before_json, after_json, occurred_at, idempotency_key, correlation_id
      ) VALUES (
        'event-1', 'document-1', 1, 'editorial.document_created', 'owner',
        NULL, 'Created.', NULL, NULL, '{}', ?, 'create-key', 'create-correlation'
      )`).run(createdAt);
    database.$client.prepare(`
      INSERT INTO editorial_reviews (
        id, document_id, revision_id, content_hash, reviewer_id, reason, notes,
        credentials_reviewed, personal_data_reviewed,
        operational_metadata_reviewed, external_links_reviewed,
        legal_attribution_reviewed, factual_claims_reviewed,
        markdown_safety_reviewed, reviewed_at, idempotency_key
      ) VALUES (
        'approval-1', 'document-1', 'revision-1', ?, 'owner', 'Reviewed.', NULL,
        1, 1, 1, 1, 1, 1, 1, ?, 'approval-key'
      )`).run(hashA, publishedAt);
    database.$client.prepare(`
      UPDATE editorial_documents
      SET workflow_status = 'approved', approved_revision_id = 'revision-1',
          publication_status = 'published', published_revision_id = 'revision-1',
          last_published_revision_id = 'revision-1', version = 2, updated_at = ?
      WHERE id = 'document-1'`).run(publishedAt);
    database.$client.prepare(`
      INSERT INTO editorial_events (
        id, document_id, sequence, kind, actor, revision_id, summary, reason,
        before_json, after_json, occurred_at, idempotency_key, correlation_id
      ) VALUES (
        'event-2', 'document-1', 2, 'editorial.published', 'owner',
        'revision-1', 'Published.', NULL, '{}', '{}', ?, 'publish-key',
        'publish-correlation'
      )`).run(publishedAt);
    database.$client.prepare(`
      INSERT INTO editorial_revisions (
        id, document_id, sequence, title, excerpt, body_markdown, tags_json,
        content_hash, created_by, created_at
      ) VALUES (
        'revision-2', 'document-1', 2, 'Private draft', 'Private excerpt.',
        '# Private draft', '["private"]', ?, 'owner', ?
      )`).run(hashB, draftAt);
    database.$client.prepare(`
      UPDATE editorial_documents
      SET workflow_status = 'draft', working_revision_id = 'revision-2',
          approved_revision_id = NULL, version = 3, updated_at = ?
      WHERE id = 'document-1'`).run(draftAt);
  });
  transaction.immediate();
}

describe("SqlitePublishedEditorialReadModel", () => {
  it("keeps the public timestamp and content bound to the published event/revision", async () => {
    const database = createSqliteDatabase(":memory:");
    migrate(database);
    seed(database);

    await expect(
      new SqlitePublishedEditorialReadModel(database).findBySlug("semog-site"),
    ).resolves.toEqual({
      kind: "project",
      slug: "semog-site",
      title: "SemogSite",
      excerpt: "Public excerpt.",
      bodyMarkdown: "# SemogSite\n\nPublic body.",
      tags: ["typescript"],
      contentHash: hashA,
      publishedRevisionId: "revision-1",
      updatedAt: publishedAt,
    });
    database.$client.close();
  });

  it("uses the rollback event timestamp when an older revision is republished", async () => {
    const database = createSqliteDatabase(":memory:");
    migrate(database);
    seed(database);
    const rollbackAt = "2026-08-01T23:40:00.000Z";
    database.$client.prepare(`
      UPDATE editorial_documents
      SET publication_status = 'withdrawn', published_revision_id = NULL,
          version = 4, updated_at = ?
      WHERE id = 'document-1'`).run("2026-08-01T23:35:00.000Z");
    database.$client.prepare(`
      UPDATE editorial_documents
      SET publication_status = 'published', published_revision_id = 'revision-1',
          last_published_revision_id = 'revision-1', version = 5, updated_at = ?
      WHERE id = 'document-1'`).run(rollbackAt);
    database.$client.prepare(`
      INSERT INTO editorial_events (
        id, document_id, sequence, kind, actor, revision_id, summary, reason,
        before_json, after_json, occurred_at, idempotency_key, correlation_id
      ) VALUES (
        'event-3', 'document-1', 3, 'editorial.rolled_back', 'owner',
        'revision-1', 'Rolled back.', 'Restore stable version.', '{}', '{}', ?,
        'rollback-key', 'rollback-correlation'
      )`).run(rollbackAt);

    await expect(
      new SqlitePublishedEditorialReadModel(database).findBySlug("semog-site"),
    ).resolves.toMatchObject({ updatedAt: rollbackAt, publishedRevisionId: "revision-1" });
    database.$client.close();
  });
});
