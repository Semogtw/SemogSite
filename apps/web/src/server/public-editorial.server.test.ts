import {
  createSqliteDatabase,
  migrate,
  type SqliteDatabase,
} from "@semogtw/database";
import type { EditorialSensitiveReviewChecks } from "@semogtw/domain";
import { afterEach, describe, expect, it } from "vitest";
import { approveEditorialRevisionCommand } from "./editorial-approve-command";
import { createEditorialDocumentCommand } from "./editorial-document-command";
import { publishEditorialRevisionCommand } from "./editorial-publish-command";
import {
  createPublicEditorialReader,
  type PublicEditorialReader,
} from "./public-editorial.server";
import { submitEditorialForReviewCommand } from "./editorial-submit-review-command";

const opened: SqliteDatabase[] = [];

function database(): SqliteDatabase {
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

async function publishNote(db: SqliteDatabase) {
  const created = await createEditorialDocumentCommand(db, {
    ownerId: "owner-1",
    idempotencyKey: "11111111-1111-4111-8111-111111111111",
    kind: "note",
    slug: "nota-publica",
    title: "Nota pública",
    excerpt: "Resumo aprovado para a rota pública.",
    bodyMarkdown: "# Nota pública\n\nConteúdo editorial aprovado.",
    tags: ["arquitetura", "devos"],
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
    reason: "PRIVATE_REVIEW_REASON",
    notes: "PRIVATE_REVIEW_NOTES",
    checks: completeChecks,
    now: "2026-08-02T04:55:00.000Z",
  });
  if (!approved.ok) throw new Error(approved.code);

  const published = await publishEditorialRevisionCommand(db, {
    documentId: approved.document.id,
    revisionId: approved.document.approvedRevisionId as string,
    ownerId: "owner-1",
    idempotencyKey: "44444444-4444-4444-8444-444444444444",
    expectedUpdatedAt: approved.document.updatedAt,
    now: "2026-08-02T05:00:00.000Z",
  });
  if (!published.ok) throw new Error(published.code);
  return published.document;
}

async function createPrivateDraft(db: SqliteDatabase) {
  const created = await createEditorialDocumentCommand(db, {
    ownerId: "owner-1",
    idempotencyKey: "55555555-5555-4555-8555-555555555555",
    kind: "note",
    slug: "nota-privada",
    title: "PRIVATE_DRAFT_TITLE",
    excerpt: "PRIVATE_DRAFT_EXCERPT",
    bodyMarkdown: "PRIVATE_DRAFT_BODY",
    tags: ["privado"],
    now: "2026-08-02T05:05:00.000Z",
  });
  if (!created.ok) throw new Error(created.code);
}

async function readerWithFixtures(): Promise<PublicEditorialReader> {
  const db = database();
  await publishNote(db);
  await createPrivateDraft(db);
  return createPublicEditorialReader(db);
}

describe("public editorial reader", () => {
  it("returns only allowlisted fields from the exact published revision", async () => {
    const reader = await readerWithFixtures();

    const notes = await reader.list({ kind: "note", limit: 20 });

    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatchObject({
      kind: "note",
      slug: "nota-publica",
      title: "Nota pública",
      excerpt: "Resumo aprovado para a rota pública.",
      bodyMarkdown: "# Nota pública\n\nConteúdo editorial aprovado.",
      tags: ["arquitetura", "devos"],
      updatedAt: "2026-08-02T05:00:00.000Z",
    });
    const serialized = JSON.stringify(notes);
    expect(serialized).not.toContain("PRIVATE_");
    expect(serialized).not.toContain("reviewer");
    expect(serialized).not.toContain("workflowStatus");
  });

  it("returns not found for private drafts and kind mismatches", async () => {
    const reader = await readerWithFixtures();

    await expect(reader.findBySlug("nota-privada", "note")).resolves.toBeNull();
    await expect(reader.findBySlug("nota-publica", "project")).resolves.toBeNull();
    await expect(reader.findBySlug("nota-publica", "note")).resolves.toMatchObject({
      slug: "nota-publica",
      kind: "note",
    });
  });
});
