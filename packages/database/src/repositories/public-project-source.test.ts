import { describe, expect, it } from "vitest";
import { createSqliteDatabase, migrate } from "../adapters/sqlite";
import { SqliteProjectRepository } from "./project-repository";
import { SqlitePublicProjectSource } from "./public-project-source";

const publicProject = {
  id: "public-project",
  slug: "public-project",
  name: "Projeto público",
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
  publicSummary: "Resumo aprovado para publicação.",
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

describe("SqlitePublicProjectSource", () => {
  it("keeps private seed records out of public listings", async () => {
    const database = createSqliteDatabase(":memory:");
    migrate(database);
    const source = new SqlitePublicProjectSource(database);

    await expect(source.listListed()).resolves.toEqual([]);
    await expect(
      source.findPublishableBySlug("semogtw-platform-demo"),
    ).resolves.toBeNull();
  });

  it("returns only explicitly approved editorial fields as publishable input", async () => {
    const database = createSqliteDatabase(":memory:");
    migrate(database);
    await new SqliteProjectRepository(database).insert(publicProject);
    const source = new SqlitePublicProjectSource(database);

    await expect(source.listListed()).resolves.toMatchObject([
      {
        slug: "public-project",
        visibility: "public",
        publicSummary: "Resumo aprovado para publicação.",
        publicProgress: 75,
        lastPublicActivityAt: null,
        privateSummary: "PRIVATE_SUMMARY",
        branchSummary: "private/branch",
      },
    ]);
  });
});
