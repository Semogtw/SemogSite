import {
  createSqliteDatabase,
  migrate,
  SqliteProjectRepository,
  type SqliteDatabase,
} from "@semogtw/database";
import type { EditorialSensitiveReviewChecks } from "@semogtw/domain";
import { afterEach, describe, expect, it } from "vitest";
import { approveEditorialRevisionCommand } from "./editorial-approve-command";
import { createEditorialDocumentCommand } from "./editorial-document-command";
import { publishEditorialRevisionCommand } from "./editorial-publish-command";
import { createPublicProjectReader } from "./public-projects.server";
import { submitEditorialForReviewCommand } from "./editorial-submit-review-command";

const opened: SqliteDatabase[] = [];

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

const legacyOperationalProject = {
  id: "legacy-project",
  slug: "legacy-project",
  name: "LEGACY_OPERATIONAL_TITLE",
  icon: null,
  status: "active" as const,
  health: "healthy" as const,
  priority: "high" as const,
  progressEstimate: 80,
  focus: "PRIVATE_FOCUS",
  nextAction: "PRIVATE_NEXT_ACTION",
  branchSummary: "private/branch",
  statusBasis: "PRIVATE_STATUS_BASIS",
  confidence: "high" as const,
  visibility: "public" as const,
  publicSummary: "LEGACY_OPERATIONAL_SUMMARY",
  privateSummary: "PRIVATE_SUMMARY",
  publicProgress: 75,
  featured: true,
  liveUrl: "https://example.com",
  documentationUrl: null,
  lastActivityAt: "2026-08-01T12:00:00.000Z",
  lastSyncedAt: null,
  manualLock: false,
  dataSource: "manual" as const,
  createdAt: "2026-08-01T12:00:00.000Z",
  updatedAt: "2026-08-01T12:00:00.000Z",
};

async function publishEditorialProject(database: SqliteDatabase) {
  const created = await createEditorialDocumentCommand(database, {
    ownerId: "owner-1",
    idempotencyKey: "11111111-1111-4111-8111-111111111111",
    kind: "project",
    slug: "semogtw-platform",
    title: "Semogtw Platform",
    excerpt: "Plataforma pessoal publicada por revisão editorial.",
    bodyMarkdown: "# Semogtw Platform\n\nArquitetura e decisões públicas.",
    tags: ["produto", "arquitetura"],
    now: "2026-08-02T06:00:00.000Z",
  });
  if (!created.ok) throw new Error(created.code);

  const submitted = await submitEditorialForReviewCommand(database, {
    documentId: created.document.id,
    ownerId: "owner-1",
    idempotencyKey: "22222222-2222-4222-8222-222222222222",
    expectedUpdatedAt: created.document.updatedAt,
    now: "2026-08-02T06:05:00.000Z",
  });
  if (!submitted.ok) throw new Error(submitted.code);

  const approved = await approveEditorialRevisionCommand(database, {
    documentId: submitted.document.id,
    revisionId: submitted.document.workingRevisionId,
    ownerId: "owner-1",
    idempotencyKey: "33333333-3333-4333-8333-333333333333",
    expectedUpdatedAt: submitted.document.updatedAt,
    reason: "Revisão pública do projeto.",
    notes: null,
    checks: completeChecks,
    now: "2026-08-02T06:10:00.000Z",
  });
  if (!approved.ok) throw new Error(approved.code);

  const published = await publishEditorialRevisionCommand(database, {
    documentId: approved.document.id,
    revisionId: approved.document.approvedRevisionId as string,
    ownerId: "owner-1",
    idempotencyKey: "44444444-4444-4444-8444-444444444444",
    expectedUpdatedAt: approved.document.updatedAt,
    now: "2026-08-02T06:15:00.000Z",
  });
  if (!published.ok) throw new Error(published.code);
}

describe("public project reader", () => {
  it("publishes compact editorial summaries and ignores operational project rows", async () => {
    const database = createSqliteDatabase(":memory:");
    opened.push(database);
    migrate(database);
    await new SqliteProjectRepository(database).insert(legacyOperationalProject);
    await publishEditorialProject(database);

    const reader = createPublicProjectReader(database);
    const projects = await reader.list();

    expect(projects).toEqual([
      {
        slug: "semogtw-platform",
        title: "Semogtw Platform",
        excerpt: "Plataforma pessoal publicada por revisão editorial.",
        tags: ["produto", "arquitetura"],
        updatedAt: "2026-08-02T06:15:00.000Z",
      },
    ]);
    expect(projects[0]).not.toHaveProperty("bodyMarkdown");
    expect(projects[0]).not.toHaveProperty("contentHash");
    expect(projects[0]).not.toHaveProperty("publishedRevisionId");
    expect(JSON.stringify(projects)).not.toContain("LEGACY_OPERATIONAL");
    expect(JSON.stringify(projects)).not.toContain("PRIVATE_");

    const project = await reader.findBySlug("semogtw-platform");
    expect(project?.bodyMarkdown).toBe(
      "# Semogtw Platform\n\nArquitetura e decisões públicas.",
    );
    await expect(reader.findBySlug("legacy-project")).resolves.toBeNull();
  });
});
