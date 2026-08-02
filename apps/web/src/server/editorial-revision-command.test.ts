import {
  createSqliteDatabase,
  migrate,
  SqliteEditorialReadModel,
} from "@semogtw/database";
import { afterEach, describe, expect, it } from "vitest";
import { createEditorialDocumentCommand } from "./editorial-document-command";
import { createEditorialRevisionCommand } from "./editorial-revision-command";

const opened: ReturnType<typeof createSqliteDatabase>[] = [];

function database() {
  const value = createSqliteDatabase(":memory:");
  opened.push(value);
  migrate(value);
  return value;
}

afterEach(() => {
  while (opened.length > 0) opened.pop()?.$client.close();
});

async function initial(db: ReturnType<typeof createSqliteDatabase>) {
  const result = await createEditorialDocumentCommand(db, {
    ownerId: "owner-1",
    idempotencyKey: "11111111-1111-4111-8111-111111111111",
    kind: "note",
    slug: "nota-versionada",
    title: "Nota v1",
    excerpt: "Primeira versão.",
    bodyMarkdown: "# Nota v1",
    tags: ["devos"],
    now: "2026-08-02T04:45:00.000Z",
  });
  if (!result.ok) throw new Error(result.code);
  return result.document;
}

const revisionKey = "22222222-2222-4222-8222-222222222222";

describe("createEditorialRevisionCommand", () => {
  it("appends an immutable revision and advances the working pointer", async () => {
    const db = database();
    const document = await initial(db);
    const result = await createEditorialRevisionCommand(db, {
      documentId: document.id,
      ownerId: "owner-1",
      idempotencyKey: revisionKey,
      expectedUpdatedAt: document.updatedAt,
      title: "Nota v2",
      excerpt: "Segunda versão.",
      bodyMarkdown: "# Nota v2\n\nConteúdo revisado.",
      tags: ["DevOS", "revision"],
      now: "2026-08-02T04:50:00.000Z",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.document.version).toBe(2);
    expect(result.document.workingRevisionId).toBe(result.revision?.id);
    expect(result.revision?.sequence).toBe(2);

    const detail = await new SqliteEditorialReadModel(db).getDocument(document.id);
    expect(detail?.revisions.map((item) => item.sequence)).toEqual([2, 1]);
  });

  it("replays the same immediate revision without adding history", async () => {
    const db = database();
    const document = await initial(db);
    const input = {
      documentId: document.id,
      ownerId: "owner-1",
      idempotencyKey: revisionKey,
      expectedUpdatedAt: document.updatedAt,
      title: "Nota v2",
      excerpt: "Segunda versão.",
      bodyMarkdown: "# Nota v2",
      tags: ["revision"],
      now: "2026-08-02T04:50:00.000Z",
    };

    await createEditorialRevisionCommand(db, input);
    const replay = await createEditorialRevisionCommand(db, input);
    expect(replay.ok && replay.duplicate).toBe(true);
    const detail = await new SqliteEditorialReadModel(db).getDocument(document.id);
    expect(detail?.revisions).toHaveLength(2);
  });

  it("rejects an edit based on stale aggregate state", async () => {
    const db = database();
    const document = await initial(db);
    const result = await createEditorialRevisionCommand(db, {
      documentId: document.id,
      ownerId: "owner-1",
      idempotencyKey: revisionKey,
      expectedUpdatedAt: "2026-08-02T04:40:00.000Z",
      title: "Nota v2",
      excerpt: "Segunda versão.",
      bodyMarkdown: "# Nota v2",
      tags: [],
      now: "2026-08-02T04:50:00.000Z",
    });

    expect(result).toEqual({ ok: false, code: "STALE_STATE" });
  });

  it("rejects raw HTML before writing a revision", async () => {
    const db = database();
    const document = await initial(db);
    const result = await createEditorialRevisionCommand(db, {
      documentId: document.id,
      ownerId: "owner-1",
      idempotencyKey: revisionKey,
      expectedUpdatedAt: document.updatedAt,
      title: "Nota v2",
      excerpt: "Segunda versão.",
      bodyMarkdown: "<iframe src='https://example.com'></iframe>",
      tags: [],
      now: "2026-08-02T04:50:00.000Z",
    });

    expect(result.ok).toBe(false);
    if (result.ok || result.code !== "VALIDATION_FAILED") return;
    expect(result.errors).toContain("RAW_HTML_FORBIDDEN");
  });
});
