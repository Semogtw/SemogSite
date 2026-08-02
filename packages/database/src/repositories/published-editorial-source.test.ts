import { describe, expect, it } from "vitest";
import { createSqliteDatabase, migrate } from "../adapters/sqlite";
import { SqlitePublishedEditorialSource } from "./published-editorial-source";

const createdAt = "2026-08-01T23:00:00.000Z";
const publishedAt = "2026-08-01T23:20:00.000Z";
const hashA = "a".repeat(64);
const hashB = "b".repeat(64);

function seedPublishedDocument(
  database: ReturnType<typeof createSqliteDatabase>,
  input: {
    id: string;
    slug: string;
    kind?: "project" | "note" | "experiment" | "page";
    tagsJson?: string;
    bodyMarkdown?: string;
  },
): void {
  const revisionId = `${input.id}-revision-1`;
  const transaction = database.$client.transaction(() => {
    database.$client
      .prepare(
        `INSERT INTO editorial_documents (
          id, kind, slug, workflow_status, publication_status,
          working_revision_id, approved_revision_id, published_revision_id,
          last_published_revision_id, version, created_at, updated_at
        ) VALUES (?, ?, ?, 'draft', 'unpublished', ?, NULL, NULL, NULL, 1, ?, ?)`,
      )
      .run(
        input.id,
        input.kind ?? "project",
        input.slug,
        revisionId,
        createdAt,
        createdAt,
      );
    database.$client
      .prepare(
        `INSERT INTO editorial_revisions (
          id, document_id, sequence, title, excerpt, body_markdown, tags_json,
          content_hash, created_by, created_at
        ) VALUES (?, ?, 1, ?, ?, ?, ?, ?, 'semogtw-owner', ?)`,
      )
      .run(
        revisionId,
        input.id,
        `Title ${input.slug}`,
        `Excerpt ${input.slug}`,
        input.bodyMarkdown ?? `# ${input.slug}\n\nPublished body.`,
        input.tagsJson ?? '["typescript","devos"]',
        hashA,
        createdAt,
      );
    database.$client
      .prepare(
        `INSERT INTO editorial_events (
          id, document_id, sequence, kind, actor, revision_id, summary, reason,
          before_json, after_json, occurred_at, idempotency_key, correlation_id
        ) VALUES (?, ?, 1, 'editorial.document_created', 'semogtw-owner', NULL,
          'Created.', NULL, NULL, '{}', ?, ?, ?)`,
      )
      .run(
        `${input.id}-event-1`,
        input.id,
        createdAt,
        `${input.id}-create-key`,
        `${input.id}-create-correlation`,
      );
    database.$client
      .prepare(
        `INSERT INTO editorial_reviews (
          id, document_id, revision_id, content_hash, reviewer_id, reason,
          notes, credentials_reviewed, personal_data_reviewed,
          operational_metadata_reviewed, external_links_reviewed,
          legal_attribution_reviewed, factual_claims_reviewed,
          markdown_safety_reviewed, reviewed_at, idempotency_key
        ) VALUES (?, ?, ?, ?, 'semogtw-owner', 'Reviewed.', NULL,
          1, 1, 1, 1, 1, 1, 1, ?, ?)`,
      )
      .run(
        `${input.id}-review-1`,
        input.id,
        revisionId,
        hashA,
        publishedAt,
        `${input.id}-review-key`,
      );
    database.$client
      .prepare(
        `UPDATE editorial_documents
         SET workflow_status = 'approved', approved_revision_id = ?,
             publication_status = 'published', published_revision_id = ?,
             last_published_revision_id = ?, version = 2, updated_at = ?
         WHERE id = ?`,
      )
      .run(revisionId, revisionId, revisionId, publishedAt, input.id);
  });
  transaction.immediate();
}

function createPrivateDraftOverPublished(
  database: ReturnType<typeof createSqliteDatabase>,
  documentId: string,
): void {
  const revisionId = `${documentId}-revision-2`;
  const transaction = database.$client.transaction(() => {
    database.$client
      .prepare(
        `INSERT INTO editorial_revisions (
          id, document_id, sequence, title, excerpt, body_markdown, tags_json,
          content_hash, created_by, created_at
        ) VALUES (?, ?, 2, 'Private draft title', 'Private draft excerpt',
          '# Private draft', '["private-draft"]', ?, 'semogtw-owner', ?)`,
      )
      .run(revisionId, documentId, hashB, "2026-08-01T23:30:00.000Z");
    database.$client
      .prepare(
        `UPDATE editorial_documents
         SET workflow_status = 'draft', working_revision_id = ?,
             approved_revision_id = NULL, version = 3, updated_at = ?
         WHERE id = ?`,
      )
      .run(revisionId, "2026-08-01T23:30:00.000Z", documentId);
  });
  transaction.immediate();
}

describe("SqlitePublishedEditorialSource", () => {
  it("returns the exact published revision while a newer private draft exists", async () => {
    const database = createSqliteDatabase(":memory:");
    migrate(database);
    seedPublishedDocument(database, {
      id: "document-1",
      slug: "semog-site",
    });
    createPrivateDraftOverPublished(database, "document-1");
    const source = new SqlitePublishedEditorialSource(database);

    await expect(source.findBySlug("semog-site")).resolves.toEqual({
      kind: "project",
      slug: "semog-site",
      title: "Title semog-site",
      excerpt: "Excerpt semog-site",
      bodyMarkdown: "# semog-site\n\nPublished body.",
      tags: ["typescript", "devos"],
      contentHash: hashA,
      publishedRevisionId: "document-1-revision-1",
      updatedAt: "2026-08-01T23:30:00.000Z",
    });
    database.$client.close();
  });

  it("returns null after withdrawal and never falls back to working revisions", async () => {
    const database = createSqliteDatabase(":memory:");
    migrate(database);
    seedPublishedDocument(database, {
      id: "document-1",
      slug: "semog-site",
    });
    createPrivateDraftOverPublished(database, "document-1");
    database.$client
      .prepare(
        `UPDATE editorial_documents
         SET publication_status = 'withdrawn', published_revision_id = NULL,
             version = 4, updated_at = ?
         WHERE id = 'document-1'`,
      )
      .run("2026-08-01T23:40:00.000Z");

    await expect(
      new SqlitePublishedEditorialSource(database).findBySlug("semog-site"),
    ).resolves.toBeNull();
    database.$client.close();
  });

  it("lists bounded published documents by kind and omits malformed projections", async () => {
    const database = createSqliteDatabase(":memory:");
    migrate(database);
    seedPublishedDocument(database, {
      id: "project-valid",
      slug: "valid-project",
      kind: "project",
    });
    seedPublishedDocument(database, {
      id: "note-valid",
      slug: "valid-note",
      kind: "note",
    });
    seedPublishedDocument(database, {
      id: "project-malformed-tags",
      slug: "bad-tags",
      kind: "project",
      tagsJson: '{broken',
    });
    seedPublishedDocument(database, {
      id: "project-raw-html",
      slug: "raw-html",
      kind: "project",
      bodyMarkdown: "# Title\n<script>alert(1)</script>",
    });
    const source = new SqlitePublishedEditorialSource(database);

    await expect(source.listPublished({ kind: "project", limit: 10 })).resolves.toEqual([
      expect.objectContaining({ slug: "valid-project", kind: "project" }),
    ]);
    await expect(source.listPublished({ kind: null, limit: 1 })).resolves.toHaveLength(1);
    database.$client.close();
  });

  it("rejects unsafe slugs before storage", async () => {
    const database = createSqliteDatabase(":memory:");
    migrate(database);
    const source = new SqlitePublishedEditorialSource(database);

    await expect(source.findBySlug(" bad slug ")).resolves.toBeNull();
    await expect(source.findBySlug("/devos/private")).resolves.toBeNull();
    database.$client.close();
  });
});
