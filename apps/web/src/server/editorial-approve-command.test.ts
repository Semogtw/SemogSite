import {
  createSqliteDatabase,
  migrate,
  SqliteEditorialReadModel,
} from "@semogtw/database";
import type { EditorialSensitiveReviewChecks } from "@semogtw/domain";
import { afterEach, describe, expect, it } from "vitest";
import { approveEditorialRevisionCommand } from "./editorial-approve-command";
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

const completeChecks: EditorialSensitiveReviewChecks = {
  credentials: true,
  personalData: true,
  operationalMetadata: true,
  externalLinks: true,
  legalAttribution: true,
  factualClaims: true,
  markdownSafety: true,
};

async function inReview(db: ReturnType<typeof createSqliteDatabase>) {
  const created = await createEditorialDocumentCommand(db, {
    ownerId: "owner-1",
    idempotencyKey: "11111111-1111-4111-8111-111111111111",
    kind: "note",
    slug: "nota-aprovavel",
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

const approvalKey = "33333333-3333-4333-8333-333333333333";

describe("approveEditorialRevisionCommand", () => {
  it("persists an approval bound to the exact reviewed revision and hash", async () => {
    const db = database();
    const document = await inReview(db);
    const result = await approveEditorialRevisionCommand(db, {
      documentId: document.id,
      revisionId: document.workingRevisionId,
      ownerId: "owner-1",
      idempotencyKey: approvalKey,
      expectedUpdatedAt: document.updatedAt,
      reason: "Checklist sensível concluído.",
      notes: "Links e fatos revisados contra as fontes.",
      checks: completeChecks,
      now: "2026-08-02T04:55:00.000Z",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.document.workflowStatus).toBe("approved");
    expect(result.document.approvedRevisionId).toBe(document.workingRevisionId);
    expect(result.approval).toMatchObject({
      revisionId: document.workingRevisionId,
      reason: "Checklist sensível concluído.",
      checks: completeChecks,
    });

    const detail = await new SqliteEditorialReadModel(db).getDocument(
      document.id,
    );
    expect(detail?.reviews).toHaveLength(1);
    expect(detail?.reviews[0]?.checksComplete).toBe(true);
    expect(detail?.events[0]?.kind).toBe("editorial.approved");
  });

  it("replays the same approval identity without duplicating review history", async () => {
    const db = database();
    const document = await inReview(db);
    const input = {
      documentId: document.id,
      revisionId: document.workingRevisionId,
      ownerId: "owner-1",
      idempotencyKey: approvalKey,
      expectedUpdatedAt: document.updatedAt,
      reason: "Checklist sensível concluído.",
      notes: null,
      checks: completeChecks,
      now: "2026-08-02T04:55:00.000Z",
    };

    await approveEditorialRevisionCommand(db, input);
    const replay = await approveEditorialRevisionCommand(db, input);

    expect(replay.ok && replay.duplicate).toBe(true);
    const detail = await new SqliteEditorialReadModel(db).getDocument(
      document.id,
    );
    expect(detail?.reviews).toHaveLength(1);
    expect(
      detail?.events.filter((event) => event.kind === "editorial.approved"),
    ).toHaveLength(1);
  });

  it("rejects an incomplete sensitive review checklist", async () => {
    const db = database();
    const document = await inReview(db);
    const result = await approveEditorialRevisionCommand(db, {
      documentId: document.id,
      revisionId: document.workingRevisionId,
      ownerId: "owner-1",
      idempotencyKey: approvalKey,
      expectedUpdatedAt: document.updatedAt,
      reason: "Checklist sensível concluído.",
      notes: null,
      checks: { ...completeChecks, personalData: false },
      now: "2026-08-02T04:55:00.000Z",
    });

    expect(result.ok).toBe(false);
    if (result.ok || result.code !== "VALIDATION_FAILED") return;
    expect(result.errors).toContain("REVIEW_CHECKS_INCOMPLETE");
  });

  it("rejects approval based on stale aggregate state", async () => {
    const db = database();
    const document = await inReview(db);
    const result = await approveEditorialRevisionCommand(db, {
      documentId: document.id,
      revisionId: document.workingRevisionId,
      ownerId: "owner-1",
      idempotencyKey: approvalKey,
      expectedUpdatedAt: "2026-08-02T04:40:00.000Z",
      reason: "Checklist sensível concluído.",
      notes: null,
      checks: completeChecks,
      now: "2026-08-02T04:55:00.000Z",
    });

    expect(result).toEqual({ ok: false, code: "STALE_STATE" });
  });
});
