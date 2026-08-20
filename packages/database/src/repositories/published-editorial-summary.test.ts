import { describe, expect, it } from "vitest";
import { createSqliteDatabase, migrate } from "../adapters/sqlite";
import { SqlitePublishedEditorialReadModel } from "./published-editorial-read-model";

const publishedAt = "2026-08-20T03:00:00.000Z";

function seedPublishedProject() {
  const database = createSqliteDatabase(":memory:");
  migrate(database);
  const hash = "a".repeat(64);

  database.$client.transaction(() => {
    database.$client.prepare(`
      INSERT INTO editorial_documents (
        id, kind, slug, workflow_status, publication_status,
        working_revision_id, approved_revision_id, published_revision_id,
        last_published_revision_id, version, created_at, updated_at
      ) VALUES (
        'document-summary', 'project', 'summary-project', 'approved', 'published',
        'revision-summary', 'revision-summary', 'revision-summary',
        'revision-summary', 1, ?, ?
      )
    `).run(publishedAt, publishedAt);

    database.$client.prepare(`
      INSERT INTO editorial_revisions (
        id, document_id, sequence, title, excerpt, body_markdown, tags_json,
        content_hash, created_by, created_at
      ) VALUES (
        'revision-summary', 'document-summary', 1, 'Summary project',
        'Compact public excerpt.', '# Heavy body that list summaries must not return',
        '["performance","typescript"]', ?, 'owner', ?
      )
    `).run(hash, publishedAt);

    database.$client.prepare(`
      INSERT INTO editorial_events (
        id, document_id, sequence, kind, actor, revision_id, summary, reason,
        before_json, after_json, occurred_at, idempotency_key, correlation_id
      ) VALUES (
        'event-summary', 'document-summary', 1, 'editorial.published', 'owner',
        'revision-summary', 'Published.', NULL, '{}', '{}', ?,
        'summary-publish-key', 'summary-publish-correlation'
      )
    `).run(publishedAt);
  }).immediate();

  return database;
}

describe("SqlitePublishedEditorialReadModel summaries", () => {
  it("lists only card fields while full detail keeps the published body", async () => {
    const database = seedPublishedProject();
    const model = new SqlitePublishedEditorialReadModel(database);

    await expect(
      model.listSummaries({ kind: "project", limit: 20 }),
    ).resolves.toEqual([
      {
        kind: "project",
        slug: "summary-project",
        title: "Summary project",
        excerpt: "Compact public excerpt.",
        tags: ["performance", "typescript"],
        updatedAt: publishedAt,
      },
    ]);

    const summaries = await model.listSummaries({ kind: "project", limit: 20 });
    expect(summaries[0]).not.toHaveProperty("bodyMarkdown");
    expect(summaries[0]).not.toHaveProperty("contentHash");
    expect(summaries[0]).not.toHaveProperty("publishedRevisionId");

    await expect(model.findBySlug("summary-project")).resolves.toMatchObject({
      bodyMarkdown: "# Heavy body that list summaries must not return",
      contentHash: "a".repeat(64),
      publishedRevisionId: "revision-summary",
    });

    database.$client.close();
  });
});
