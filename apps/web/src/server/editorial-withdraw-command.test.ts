import {
  createSqliteDatabase,
  migrate,
  SqliteEditorialReadModel,
} from "@semogtw/database";
import type { EditorialSensitiveReviewChecks } from "@semogtw/domain";
import { afterEach, describe, expect, it } from "vitest";
import { approveEditorialRevisionCommand } from "./editorial-approve-command";
import { createEditorialDocumentCommand } from "./editorial-document-command";
import { publishEditorialRevisionCommand } from "./editorial-publish-command";
import { submitEditorialForReviewCommand } from "./editorial-submit-review-command";
import { withdrawEditorialPublicationCommand } from "./editorial-withdraw-command";

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

async function published(db: ReturnType<typeof createSqliteDatabase>) {
  const created = await createEditorialDocumentCommand(db, {
    ownerId: "owner-1",
    idempotencyKey: "11111111-1111-4111-8111-111111111111",
    kind: "note",
    slug: "nota-retiravel",
    title: "Nota pública",
    excerpt: "Resumo aprovado para publicação.",
    bodyMarkdown: "# Nota pública",
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

  const approved = await approveEditorialRevisionCommand(db, {
    documentId: submitted.document.id,
    revisionId: submitted.document.workingRevisionId,
    ownerId: "owner-1",
    idempotencyKey: "33333333-3333-4333-8333-333333333333",
    expectedUpdatedAt: submitted.document.updatedAt,
    reason: "Checklist sensível concluído.",
    notes: null,
    checks: completeChecks,
    now: "2026-08-02T04:55:00.000Z",
  });
  if (!approved.ok) throw new Error(approved.code);

  const result = await publishEditorialRevisionCommand(db, {
    documentId: approved.document.id,
    revisionId: approved.document.approvedRevisionId as string,
    ownerId: "owner-1",
    idempotencyKey: "55555555-5555-4555-8555-555555555555",
    expectedUpdatedAt: approved.document.updatedAt,
    now: "2026-08-02T05:00:00.000Z",
  });
  if (!result.ok) throw new Error(result.code);
  return result.document;
}

const withdrawKey = "66666666-6666-4666-8666-666666666666";

describe("withdrawEditorialPublicationCommand", () => {
  it("withdraws the public projection while preserving publication history", async () => {
    const db = database();
    const document = await published(db);
    const result = await withdrawEditorialPublicationCommand(db, {
      documentId: document.id,
      ownerId: "owner-1",
      idempotencyKey: withdrawKey,
      expectedUpdatedAt: document.updatedAt,
      reason: "Correção factual necessária antes de republicar.",
      now: "2026-08-02T05:05:00.000Z",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.document).toMatchObject({
      publicationStatus: "withdrawn",
      publishedRevisionId: null,
      lastPublishedRevisionId: document.publishedRevisionId,
      workingRevisionId: document.workingRevisionId,
      approvedRevisionId: document.approvedRevisionId,
    });

    const detail = await new SqliteEditorialReadModel(db).getDocument(document.id);
    expect(detail?.events[0]).toMatchObject({
      kind: "editorial.withdrawn",
      reason: "Correção factual necessária antes de republicar.",
    });
  });

  it("replays the same withdrawal identity without duplicating events", async () => {
    const db = database();
    const document = await published(db);
    const input = {
      documentId: document.id,
      ownerId: "owner-1",
      idempotencyKey: withdrawKey,
      expectedUpdatedAt: document.updatedAt,
      reason: "Correção factual necessária antes de republicar.",
      now: "2026-08-02T05:05:00.000Z",
    };

    await withdrawEditorialPublicationCommand(db, input);
    const replay = await withdrawEditorialPublicationCommand(db, input);

    expect(replay.ok && replay.duplicate).toBe(true);
    const detail = await new SqliteEditorialReadModel(db).getDocument(document.id);
    expect(
      detail?.events.filter((event) => event.kind === "editorial.withdrawn"),
    ).toHaveLength(1);
  });

  it("requires an explicit audit reason", async () => {
    const db = database();
    const document = await published(db);
    const result = await withdrawEditorialPublicationCommand(db, {
      documentId: document.id,
      ownerId: "owner-1",
      idempotencyKey: withdrawKey,
      expectedUpdatedAt: document.updatedAt,
      reason: "   ",
      now: "2026-08-02T05:05:00.000Z",
    });

    expect(result.ok).toBe(false);
    if (result.ok || result.code !== "VALIDATION_FAILED") return;
    expect(result.errors).toContain("REASON_REQUIRED");
  });

  it("rejects withdrawal based on stale aggregate state", async () => {
    const db = database();
    const document = await published(db);
    const result = await withdrawEditorialPublicationCommand(db, {
      documentId: document.id,
      ownerId: "owner-1",
      idempotencyKey: withdrawKey,
      expectedUpdatedAt: "2026-08-02T04:40:00.000Z",
      reason: "Correção factual necessária antes de republicar.",
      now: "2026-08-02T05:05:00.000Z",
    });

    expect(result).toEqual({ ok: false, code: "STALE_STATE" });
  });
});
