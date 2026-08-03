import {
  createSqliteDatabase,
  migrate,
  SqliteEditorialReadModel,
} from "@semogtw/database";
import type { EditorialSensitiveReviewChecks } from "@semogtw/domain";
import { afterEach, describe, expect, it } from "vitest";
import { approveEditorialRevisionCommand } from "./editorial-approve-command";
import { createEditorialDocumentCommand } from "./editorial-document-command";
import { createEditorialRevisionCommand } from "./editorial-revision-command";
import { publishEditorialRevisionCommand } from "./editorial-publish-command";
import { reopenEditorialDraftCommand } from "./editorial-reopen-draft-command";
import { rollbackEditorialPublicationCommand } from "./editorial-rollback-command";
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

async function approveAndPublish(
  db: ReturnType<typeof createSqliteDatabase>,
  document: { id: string; workingRevisionId: string; updatedAt: string },
  suffix: string,
  nowBase: number,
) {
  const submitted = await submitEditorialForReviewCommand(db, {
    documentId: document.id,
    ownerId: "owner-1",
    idempotencyKey: `${suffix}2222-2222-4222-8222-222222222222`,
    expectedUpdatedAt: document.updatedAt,
    now: `2026-08-02T05:${nowBase.toString().padStart(2, "0")}:00.000Z`,
  });
  if (!submitted.ok) throw new Error(submitted.code);

  const approved = await approveEditorialRevisionCommand(db, {
    documentId: submitted.document.id,
    revisionId: submitted.document.workingRevisionId,
    ownerId: "owner-1",
    idempotencyKey: `${suffix}3333-3333-4333-8333-333333333333`,
    expectedUpdatedAt: submitted.document.updatedAt,
    reason: "Checklist sensível concluído.",
    notes: null,
    checks: completeChecks,
    now: `2026-08-02T05:${(nowBase + 1).toString().padStart(2, "0")}:00.000Z`,
  });
  if (!approved.ok) throw new Error(approved.code);

  const published = await publishEditorialRevisionCommand(db, {
    documentId: approved.document.id,
    revisionId: approved.document.approvedRevisionId as string,
    ownerId: "owner-1",
    idempotencyKey: `${suffix}5555-5555-4555-8555-555555555555`,
    expectedUpdatedAt: approved.document.updatedAt,
    now: `2026-08-02T05:${(nowBase + 2).toString().padStart(2, "0")}:00.000Z`,
  });
  if (!published.ok) throw new Error(published.code);
  return published.document;
}

async function twoPublishedRevisions(db: ReturnType<typeof createSqliteDatabase>) {
  const created = await createEditorialDocumentCommand(db, {
    ownerId: "owner-1",
    idempotencyKey: "11111111-1111-4111-8111-111111111111",
    kind: "note",
    slug: "nota-com-rollback",
    title: "Nota v1",
    excerpt: "Resumo v1.",
    bodyMarkdown: "# Nota v1",
    tags: ["devos"],
    now: "2026-08-02T05:00:00.000Z",
  });
  if (!created.ok) throw new Error(created.code);
  const firstRevisionId = created.document.workingRevisionId;
  const firstPublished = await approveAndPublish(db, created.document, "a", 1);

  const reopened = await reopenEditorialDraftCommand(db, {
    documentId: firstPublished.id,
    ownerId: "owner-1",
    idempotencyKey: "44444444-4444-4444-8444-444444444444",
    expectedUpdatedAt: firstPublished.updatedAt,
    reason: "Preparar segunda revisão.",
    now: "2026-08-02T05:04:00.000Z",
  });
  if (!reopened.ok) throw new Error(reopened.code);

  const revised = await createEditorialRevisionCommand(db, {
    documentId: reopened.document.id,
    ownerId: "owner-1",
    idempotencyKey: "77777777-7777-4777-8777-777777777777",
    expectedUpdatedAt: reopened.document.updatedAt,
    title: "Nota v2",
    excerpt: "Resumo v2.",
    bodyMarkdown: "# Nota v2",
    tags: ["devos"],
    now: "2026-08-02T05:05:00.000Z",
  });
  if (!revised.ok) throw new Error(revised.code);
  const secondPublished = await approveAndPublish(db, revised.document, "b", 6);
  return { document: secondPublished, firstRevisionId };
}

const rollbackKey = "99999999-9999-4999-8999-999999999999";

describe("rollbackEditorialPublicationCommand", () => {
  it("publishes an older approved revision without replacing the working revision", async () => {
    const db = database();
    const { document, firstRevisionId } = await twoPublishedRevisions(db);
    const result = await rollbackEditorialPublicationCommand(db, {
      documentId: document.id,
      revisionId: firstRevisionId,
      ownerId: "owner-1",
      idempotencyKey: rollbackKey,
      expectedUpdatedAt: document.updatedAt,
      reason: "Restaurar a versão pública estável anterior.",
      now: "2026-08-02T05:10:00.000Z",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.document).toMatchObject({
      publicationStatus: "published",
      publishedRevisionId: firstRevisionId,
      lastPublishedRevisionId: firstRevisionId,
      workingRevisionId: document.workingRevisionId,
      approvedRevisionId: document.approvedRevisionId,
    });
    expect(result.revision?.id).toBe(firstRevisionId);
    expect(result.approval?.revisionId).toBe(firstRevisionId);

    const detail = await new SqliteEditorialReadModel(db).getDocument(document.id);
    expect(detail?.events[0]).toMatchObject({
      kind: "editorial.rolled_back",
      revisionId: firstRevisionId,
      reason: "Restaurar a versão pública estável anterior.",
    });
  });

  it("replays the same rollback identity without duplicating events", async () => {
    const db = database();
    const { document, firstRevisionId } = await twoPublishedRevisions(db);
    const input = {
      documentId: document.id,
      revisionId: firstRevisionId,
      ownerId: "owner-1",
      idempotencyKey: rollbackKey,
      expectedUpdatedAt: document.updatedAt,
      reason: "Restaurar a versão pública estável anterior.",
      now: "2026-08-02T05:10:00.000Z",
    };

    await rollbackEditorialPublicationCommand(db, input);
    const replay = await rollbackEditorialPublicationCommand(db, input);

    expect(replay.ok && replay.duplicate).toBe(true);
    const detail = await new SqliteEditorialReadModel(db).getDocument(document.id);
    expect(
      detail?.events.filter((event) => event.kind === "editorial.rolled_back"),
    ).toHaveLength(1);
  });

  it("requires an explicit audit reason", async () => {
    const db = database();
    const { document, firstRevisionId } = await twoPublishedRevisions(db);
    const result = await rollbackEditorialPublicationCommand(db, {
      documentId: document.id,
      revisionId: firstRevisionId,
      ownerId: "owner-1",
      idempotencyKey: rollbackKey,
      expectedUpdatedAt: document.updatedAt,
      reason: " ",
      now: "2026-08-02T05:10:00.000Z",
    });

    expect(result.ok).toBe(false);
    if (result.ok || result.code !== "VALIDATION_FAILED") return;
    expect(result.errors).toContain("REASON_REQUIRED");
  });
});
