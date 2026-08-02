import { describe, expect, it } from "vitest";
import { ProjectService, type ProjectDataSource } from "./project-service";

const source: ProjectDataSource = {
  listProjects: async () => [
    {
      id: "p1",
      slug: "active",
      name: "Ativo",
      status: "active",
      health: "healthy",
      priority: "high",
      progressEstimate: 50,
      focus: "Entregar",
      nextAction: "Validar",
      branchSummary: "main",
      confidence: "high",
      lastActivityAt: null,
      lastSyncedAt: null,
    },
    {
      id: "p2",
      slug: "paused",
      name: "Pausado",
      status: "paused",
      health: "unknown",
      priority: "low",
      progressEstimate: 20,
      focus: "",
      nextAction: "",
      branchSummary: null,
      confidence: "low",
      lastActivityAt: null,
      lastSyncedAt: null,
    },
  ],
  listRepositories: async () => [
    { id: "r1", projectId: "p1", fullName: "Semogtw/active", role: "product", visibility: "private", status: "active", defaultBranch: "main", activeBranch: "main", githubUrl: "https://github.com/Semogtw/active", lastSyncedAt: null },
    { id: "r2", projectId: "p2", fullName: "Semogtw/history", role: "academic", visibility: "public", status: "historical", defaultBranch: "main", activeBranch: null, githubUrl: "https://github.com/Semogtw/history", lastSyncedAt: null },
  ],
  getProjectHub: async () => null,
};

describe("ProjectService", () => {
  it("separates active portfolio from the complete repository catalog", async () => {
    const result = await new ProjectService(source).listOperationalPortfolio();

    expect(result.activeProjects.map((project) => project.id)).toEqual(["p1"]);
    expect(result.activeRepositories.map((repository) => repository.id)).toEqual(["r1"]);
    expect(result.repositoryCatalog.map((repository) => repository.id)).toEqual(["r1", "r2"]);
  });
});
