import {
  createSqliteDatabase,
  migrate,
  SqliteEditorialReadModel,
} from "@semogtw/database";
import { afterEach, describe, expect, it } from "vitest";
import { approveEditorialRevisionCommand } from "./editorial-approve-command";
import { createEditorialDocumentCommand } from "./editorial-document-command";
import { reopenEditorialDraftCommand } from "./editorial-reopen-draft-command";
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

async function inReview(db: ReturnType<typeof createSqliteDatabase>) {
  const created = await createEditorialDocumentCommand(db, {
    ownerId: "owner-1",
    idempotencyKey: "11111111-1111-4111-8111-111111111111",
    kind: "note",
    slug: "nota-reaberta",
    title: "Nota privada",
    excerpt: "Resumo privado.",
    bodyMarkdown: "# Nota privada",
    tags: ["devos"],
    now: "2026-08-02T04:45:00.000Z",
  });
  if (!created.ok) throw new Error(created.code);
  const submitted = await submitEditorialForReviewCommand(db, {
    documentId: created.document.id,
    ownerId: "owner-1",
    idempotencyKey: "22222222-2222-4222-8222-222222222222",
    expectedUpdatedAt: created.document.updatedAt,
    now: "2026-08-02T04:50:00.000Z",
  });
  if (!submitted.ok) throw new Error(submitted.code);
  return submitted.document;
}

const reopenKey = "44444444-4444-4444-8444-444444444444";

describe("reopenEditorialDraftCommand", () => {
  it("reopens an in-review revision as an editable draft with an audit reason", async () => {
    const db = database();
    const document = await inReview(db);
    const result = await reopenEditorialDraftCommand(db, {
      documentId: document.id,
      ownerId: "owner-1",
      idempotencyKey: reopenKey,
      expectedUpdatedAt: document.updatedAt,
      reason: "Ajustar uma afirmação factual antes da aprovação.",
      now: "2026-08-02T05:00:00.000Z",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.document.workflowStatus).toBe("draft");
    expect(result.document.approvedRevisionId).toBeNull();

    const detail = await new SqliteEditorialReadModel(db).getDocument(
      document.id,
    );
    expect(detail?.events[0]).toMatchObject({
      kind: "editorial.reopened_as_draft",
      reason: "Ajustar uma afirmação factual antes da aprovação.",
    });
  });

  it("reopens an approved revision and invalidates the previous approval pointer", async () => {
    const db = database();
    const reviewed = await inReview(db);
    const approved = await approveEditorialRevisionCommand(db, {
      documentId: reviewed.id,
      revisionId: reviewed.workingRevisionId,
      ownerId: "owner-1",
      idempotencyKey: "33333333-3333-4333-8333-333333333333",
      expectedUpdatedAt: reviewed.updatedAt,
      reason: "Checklist concluído.",
      notes: null,
      checks: {
        credentials: true,
        personalData: true,
        operationalMetadata: true,
        externalLinks: true,
        legalAttribution: true,
        factualClaims: true,
        markdownSafety: true,
      },
      now: "2026-08-02T04:55:00.000Z",
    });
    if (!approved.ok) throw new Error(approved.code);

    const result = await reopenEditorialDraftCommand(db, {
      documentId: approved.document.id,
      ownerId: "owner-1",
      idempotencyKey: reopenKey,
      expectedUpdatedAt: approved.document.updatedAt,
      reason: "Conteúdo aprovado precisa de uma nova revisão.",
      now: "2026-08-02T05:00:00.000Z",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.document).toMatchObject({
      workflowStatus: "draft",
      approvedRevisionId: null,
    });
  });

  it("replays the same reopen identity without duplicating events", async () => {
    const db = database();
    const document = await inReview(db);
    const input = {
      documentId: document.id,
      ownerId: "owner-1",
      idempotencyKey: reopenKey,
      expectedUpdatedAt: document.updatedAt,
      reason: "Ajustar uma afirmação factual antes da aprovação.",
      now: "2026-08-02T05:00:00.000Z",
    };

    await reopenEditorialDraftCommand(db, input);
    const replay = await reopenEditorialDraftCommand(db, input);

    expect(replay.ok && replay.duplicate).toBe(true);
    const detail = await new SqliteEditorialReadModel(db).getDocument(
      document.id,
    );
    expect(
      detail?.events.filter(
        (event) => event.kind === "editorial.reopened_as_draft",
      ),
    ).toHaveLength(1);
  });

  it("requires an explicit audit reason", async () => {
    const db = database();
    const document = await inReview(db);
    const result = await reopenEditorialDraftCommand(db, {
      documentId: document.id,
      ownerId: "owner-1",
      idempotencyKey: reopenKey,
      expectedUpdatedAt: document.updatedAt,
      reason: "   ",
      now: "2026-08-02T05:00:00.000Z",
    });

    expect(result.ok).toBe(false);
    if (result.ok || result.code !== "VALIDATION_FAILED") return;
    expect(result.errors).toContain("REASON_REQUIRED");
  });
});
