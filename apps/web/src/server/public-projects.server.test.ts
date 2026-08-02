import { describe, expect, it } from "vitest";
import {
  createSqliteDatabase,
  migrate,
  SqliteProjectRepository,
} from "@semogtw/database";
import { createPublicProjectReader } from "./public-projects.server";

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
  publicSummary: "Resumo editorial aprovado.",
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

describe("public project reader", () => {
  it("returns allowlisted DTOs and keeps the private seed invisible", async () => {
    const database = createSqliteDatabase(":memory:");
    migrate(database);
    await new SqliteProjectRepository(database).insert(publicProject);
    const reader = createPublicProjectReader(database);

    const projects = await reader.list();
    expect(projects).toEqual([
      {
        slug: "public-project",
        name: "Projeto público",
        publicSummary: "Resumo editorial aprovado.",
        publicProgress: 75,
        featured: true,
        liveUrl: "https://example.com",
        documentationUrl: null,
        lastPublicActivityAt: null,
      },
    ]);
    expect(JSON.stringify(projects)).not.toContain("PRIVATE_");
    await expect(reader.findBySlug("semogtw-platform-demo")).resolves.toBeNull();
  });
});
