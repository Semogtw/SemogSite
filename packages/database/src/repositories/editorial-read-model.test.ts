import { describe, expect, it } from "vitest";
import { createSqliteDatabase, migrate } from "../adapters/sqlite";
import { SqliteEditorialReadModel } from "./editorial-read-model";

const t0 = "2026-08-01T23:00:00.000Z";
const t1 = "2026-08-01T23:10:00.000Z";
const hash = "a".repeat(64);

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
      )`).run(t0, t0);
    database.$client.prepare(`
      INSERT INTO editorial_revisions (
        id, document_id, sequence, title, excerpt, body_markdown, tags_json,
        content_hash, created_by, created_at
      ) VALUES (
        'revision-1', 'document-1', 1, 'SemogSite', 'Excerpt', '# Body',
        '["typescript"]', ?, 'owner', ?
      )`).run(hash, t0);
    database.$client.prepare(`
      INSERT INTO editorial_events (
        id, document_id, sequence, kind, actor, revision_id, summary, reason,
        before_json, after_json, occurred_at, idempotency_key, correlation_id
      ) VALUES (
        'event-1', 'document-1', 1, 'editorial.document_created', 'owner',
        NULL, 'Created.', NULL, NULL, ?, ?, 'create-key', 'create-correlation'
      )`).run(JSON.stringify({ id: "document-1", workflowStatus: "draft" }), t0);
    database.$client.prepare(`
      INSERT INTO editorial_reviews (
        id, document_id, revision_id, content_hash, reviewer_id, reason, notes,
        credentials_reviewed, personal_data_reviewed,
        operational_metadata_reviewed, external_links_reviewed,
        legal_attribution_reviewed, factual_claims_reviewed,
        markdown_safety_reviewed, reviewed_at, idempotency_key
      ) VALUES (
        'review-1', 'document-1', 'revision-1', ?, 'owner', 'Reviewed.',
        'No concerns.', 1, 1, 1, 1, 1, 1, 1, ?, 'review-key'
      )`).run(hash, t1);
  });
  transaction.immediate();
}

describe("SqliteEditorialReadModel", () => {
  it("lists bounded private documents with working and published titles", async () => {
    const database = createSqliteDatabase(":memory:");
    migrate(database);
    seed(database);
    const readModel = new SqliteEditorialReadModel(database);

    await expect(readModel.listDocuments({ limit: 10 })).resolves.toEqual([
      {
        document: expect.objectContaining({
          id: "document-1",
          slug: "semog-site",
          workflowStatus: "draft",
          publicationStatus: "unpublished",
        }),
        workingTitle: "SemogSite",
        publishedTitle: null,
      },
    ]);
    await expect(readModel.listDocuments({ limit: 0 })).resolves.toHaveLength(1);
    database.$client.close();
  });

  it("returns revisions, reviews and append-only events for the owner", async () => {
    const database = createSqliteDatabase(":memory:");
    migrate(database);
    seed(database);

    const detail = await new SqliteEditorialReadModel(database).getDocument(
      "document-1",
    );
    expect(detail).toEqual({
      document: expect.objectContaining({ id: "document-1", version: 1 }),
      revisions: [
        expect.objectContaining({
          id: "revision-1",
          sequence: 1,
          tags: ["typescript"],
          malformedTags: false,
        }),
      ],
      reviews: [
        expect.objectContaining({
          id: "review-1",
          revisionId: "revision-1",
          checksComplete: true,
        }),
      ],
      events: [
        expect.objectContaining({
          id: "event-1",
          sequence: 1,
          before: null,
          after: { id: "document-1", workflowStatus: "draft" },
          malformedJson: [],
        }),
      ],
    });
    database.$client.close();
  });

  it("surfaces malformed historical JSON/tags without inventing content", async () => {
    const database = createSqliteDatabase(":memory:");
    migrate(database);
    seed(database);
    database.$client.exec("DROP TRIGGER editorial_revisions_immutable_update");
    database.$client
      .prepare("UPDATE editorial_revisions SET tags_json = '{broken' WHERE id = 'revision-1'")
      .run();
    database.$client.exec("DROP TRIGGER editorial_events_immutable_update");
    database.$client
      .prepare("UPDATE editorial_events SET after_json = '{broken' WHERE id = 'event-1'")
      .run();

    const detail = await new SqliteEditorialReadModel(database).getDocument(
      "document-1",
    );
    expect(detail?.revisions[0]).toMatchObject({ tags: [], malformedTags: true });
    expect(detail?.events[0]).toMatchObject({
      after: null,
      malformedJson: ["after"],
    });
    database.$client.close();
  });

  it("returns null for unknown documents", async () => {
    const database = createSqliteDatabase(":memory:");
    migrate(database);

    await expect(
      new SqliteEditorialReadModel(database).getDocument("missing"),
    ).resolves.toBeNull();
    database.$client.close();
  });
});
