import { describe, expect, it } from "vitest";
import { createSqliteDatabase, migrate } from "../adapters/sqlite";
import { SqliteProjectRepository } from "./project-repository";

const seedProject = {
  id: "project-seed",
  slug: "semogtw-platform-demo",
  name: "Semogtw Platform Demo",
  icon: null,
  status: "active" as const,
  health: "unknown" as const,
  priority: "medium" as const,
  progressEstimate: 10,
  focus: "Validar persistência local",
  nextAction: "Executar contrato do repositório",
  branchSummary: null,
  statusBasis: "Registro demonstrativo",
  confidence: "low" as const,
  visibility: "private" as const,
  publicSummary: null,
  privateSummary: "Dado demonstrativo, não migrado.",
  publicProgress: null,
  featured: false,
  liveUrl: null,
  documentationUrl: null,
  lastActivityAt: null,
  lastSyncedAt: null,
  manualLock: false,
  dataSource: "seed_demo" as const,
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-01T00:00:00.000Z",
};

describe("SqliteProjectRepository", () => {
  it("round-trips visibility and source metadata", async () => {
    const database = createSqliteDatabase(":memory:");
    migrate(database);
    const repository = new SqliteProjectRepository(database);

    await repository.insert(seedProject);

    await expect(repository.findBySlug(seedProject.slug)).resolves.toMatchObject({
      slug: seedProject.slug,
      visibility: "private",
      dataSource: "seed_demo",
    });
  });

  it("orders active projects by semantic priority before name", async () => {
    const database = createSqliteDatabase(":memory:");
    migrate(database);
    const repository = new SqliteProjectRepository(database);

    await repository.insert({
      ...seedProject,
      id: "project-low",
      slug: "project-low",
      name: "A low project",
      priority: "low",
    });
    await repository.insert({
      ...seedProject,
      id: "project-critical",
      slug: "project-critical",
      name: "Z critical project",
      priority: "critical",
    });

    const active = await repository.listActive();
    expect(active[0]?.slug).toBe("project-critical");
    expect(active.at(-1)?.slug).toBe("project-low");
  });
});
