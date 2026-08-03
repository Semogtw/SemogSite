import {
  createSqliteDatabase,
  migrate,
  SqliteEditorialReadModel,
} from "@semogtw/database";
import { afterEach, describe, expect, it } from "vitest";
import { createEditorialDocumentCommand } from "./editorial-document-command";

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

const base = {
  ownerId: "owner-1",
  idempotencyKey: "11111111-1111-4111-8111-111111111111",
  kind: "note" as const,
  slug: "primeira-nota",
  title: "Primeira nota",
  excerpt: "Resumo público ainda não publicado.",
  bodyMarkdown: "# Primeira nota\n\nConteúdo privado em revisão.",
  tags: ["DevOS", "private", "devos"],
  now: "2026-08-02T04:45:00.000Z",
};

describe("createEditorialDocumentCommand", () => {
  it("creates a private draft with a server-derived content hash", async () => {
    const db = database();
    const result = await createEditorialDocumentCommand(db, base);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.duplicate).toBe(false);
    expect(result.document.workflowStatus).toBe("draft");
    expect(result.document.publicationStatus).toBe("unpublished");
    expect(result.revision?.contentHash).toMatch(/^[a-f0-9]{64}$/u);
    expect(result.revision?.tags).toEqual(["devos", "private"]);

    const detail = await new SqliteEditorialReadModel(db).getDocument(
      result.document.id,
    );
    expect(detail?.revisions).toHaveLength(1);
    expect(detail?.events[0]?.kind).toBe("editorial.document_created");
  });

  it("replays the same idempotency identity without another revision", async () => {
    const db = database();
    const first = await createEditorialDocumentCommand(db, base);
    const second = await createEditorialDocumentCommand(db, base);

    expect(first.ok).toBe(true);
    expect(second.ok && second.duplicate).toBe(true);
    const list = await new SqliteEditorialReadModel(db).listDocuments({ limit: 10 });
    expect(list).toHaveLength(1);
  });

  it("rejects a different document that reuses the canonical slug", async () => {
    const db = database();
    await createEditorialDocumentCommand(db, base);
    const conflict = await createEditorialDocumentCommand(db, {
      ...base,
      idempotencyKey: "22222222-2222-4222-8222-222222222222",
      title: "Outra nota",
    });

    expect(conflict).toEqual({ ok: false, code: "SLUG_CONFLICT" });
  });

  it("keeps raw HTML out of authored markdown", async () => {
    const db = database();
    const result = await createEditorialDocumentCommand(db, {
      ...base,
      bodyMarkdown: "<script>alert('x')</script>",
    });

    expect(result.ok).toBe(false);
    if (result.ok || result.code !== "VALIDATION_FAILED") return;
    expect(result.errors).toContain("RAW_HTML_FORBIDDEN");
  });
});
