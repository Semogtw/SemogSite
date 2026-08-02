import {
  createSqliteDatabase,
  migrate,
  SqliteEditorialReadModel,
} from "@semogtw/database";
import { afterEach, describe, expect, it } from "vitest";
import { createEditorialDocumentCommand } from "./editorial-document-command";
import { submitEditorialForReviewCommand } from "./editorial-submit-review-command";

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
    slug: "nota-em-revisao",
    title: "Nota privada",
    excerpt: "Resumo privado.",
    bodyMarkdown: "# Nota privada",
    tags: ["devos"],
    now: "2026-08-02T04:45:00.000Z",
  });
  if (!result.ok) throw new Error(result.code);
  return result.document;
}

const submitKey = "22222222-2222-4222-8222-222222222222";

describe("submitEditorialForReviewCommand", () => {
  it("moves the working revision from draft to in review", async () => {
    const db = database();
    const document = await initial(db);
    const result = await submitEditorialForReviewCommand(db, {
      documentId: document.id,
      ownerId: "owner-1",
      idempotencyKey: submitKey,
      expectedUpdatedAt: document.updatedAt,
      now: "2026-08-02T04:50:00.000Z",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.document.workflowStatus).toBe("in_review");
    expect(result.document.workingRevisionId).toBe(document.workingRevisionId);

    const detail = await new SqliteEditorialReadModel(db).getDocument(document.id);
    expect(detail?.events[0]?.kind).toBe("editorial.submitted_for_review");
  });

  it("replays the same submission identity without another event", async () => {
    const db = database();
    const document = await initial(db);
    const input = {
      documentId: document.id,
      ownerId: "owner-1",
      idempotencyKey: submitKey,
      expectedUpdatedAt: document.updatedAt,
      now: "2026-08-02T04:50:00.000Z",
    };

    await submitEditorialForReviewCommand(db, input);
    const replay = await submitEditorialForReviewCommand(db, input);

    expect(replay.ok && replay.duplicate).toBe(true);
    const detail = await new SqliteEditorialReadModel(db).getDocument(document.id);
    expect(detail?.events.filter((event) => event.kind === "editorial.submitted_for_review")).toHaveLength(1);
  });

  it("rejects submission based on stale aggregate state", async () => {
    const db = database();
    const document = await initial(db);
    const result = await submitEditorialForReviewCommand(db, {
      documentId: document.id,
      ownerId: "owner-1",
      idempotencyKey: submitKey,
      expectedUpdatedAt: "2026-08-02T04:40:00.000Z",
      now: "2026-08-02T04:50:00.000Z",
    });

    expect(result).toEqual({ ok: false, code: "STALE_STATE" });
  });
});
