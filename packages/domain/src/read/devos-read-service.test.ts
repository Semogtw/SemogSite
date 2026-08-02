import { describe, expect, it, vi } from "vitest";
import {
  DevOSReadService,
  type DevOSReadDependencies,
} from "./devos-read-service";

function dependencies(): DevOSReadDependencies {
  return {
    overview: {
      getOverview: vi.fn().mockResolvedValue({
        activeProjectCount: 1,
        inProgressStageCount: 1,
        highImpactAttentionCount: 0,
        projects: [],
        currentStages: [],
        attention: [],
        lastSyncedAt: null,
      }),
    },
    today: {
      getQueue: vi.fn().mockResolvedValue({
        executeNow: [],
        nextInQueue: [],
        needsOwner: [],
        externalDependencies: [],
        recentActivity: [],
      }),
    },
    projects: {
      listOperationalPortfolio: vi.fn().mockResolvedValue({
        activeProjects: [],
        activeRepositories: [],
        repositoryCatalog: [],
      }),
      getProjectHub: vi.fn().mockImplementation(async (slug: string) =>
        slug === "semog-site"
          ? {
              project: {
                id: "project-1",
                slug,
                name: "SemogSite",
                status: "active",
                health: "healthy",
                priority: "high",
                progressEstimate: 50,
                focus: "MCP read adapter",
                nextAction: "Implement protocol bridge",
                branchSummary: "develop/foundation-bootstrap",
                confidence: "high",
                lastActivityAt: null,
                lastSyncedAt: null,
              },
              repositories: [],
              currentStages: [],
              attention: [],
              evidence: [],
              recentSessions: [],
              nextGate: null,
              safetyConstraint: null,
              dataSource: "seed_demo",
              updatedAt: "2026-08-01T20:00:00.000Z",
            }
          : null,
      ),
    },
    roadmap: {
      query: vi.fn().mockImplementation(async (filters) => ({
        items: [],
        board: {
          backlog: [],
          next: [],
          in_progress: [],
          blocked: [],
          completed: [],
        },
        receivedFilters: filters,
      })),
    },
  };
}

describe("DevOSReadService", () => {
  it("delegates overview, today and portfolio reads without rewriting DTOs", async () => {
    const deps = dependencies();
    const service = new DevOSReadService(deps);

    await expect(service.getOverview()).resolves.toMatchObject({
      activeProjectCount: 1,
    });
    await expect(service.getToday()).resolves.toMatchObject({
      executeNow: [],
    });
    await expect(service.listProjects()).resolves.toMatchObject({
      activeProjects: [],
    });

    expect(deps.overview.getOverview).toHaveBeenCalledTimes(1);
    expect(deps.today.getQueue).toHaveBeenCalledTimes(1);
    expect(deps.projects.listOperationalPortfolio).toHaveBeenCalledTimes(1);
  });

  it("normalizes a project slug and preserves not-found separately", async () => {
    const deps = dependencies();
    const service = new DevOSReadService(deps);

    await expect(service.getProject("  semog-site  ")).resolves.toMatchObject({
      ok: true,
      data: { project: { slug: "semog-site" } },
    });
    await expect(service.getProject("missing")).resolves.toEqual({
      ok: false,
      code: "NOT_FOUND",
    });
    expect(deps.projects.getProjectHub).toHaveBeenNthCalledWith(1, "semog-site");
  });

  it.each(["", "   ", "/private", "bad slug", "a".repeat(121)])(
    "rejects unsafe project slug %j before the source",
    async (slug) => {
      const deps = dependencies();
      const service = new DevOSReadService(deps);

      await expect(service.getProject(slug)).resolves.toEqual({
        ok: false,
        code: "INVALID_INPUT",
      });
      expect(deps.projects.getProjectHub).not.toHaveBeenCalled();
    },
  );

  it("normalizes and deduplicates roadmap filters", async () => {
    const deps = dependencies();
    const service = new DevOSReadService(deps);

    const result = await service.queryRoadmap({
      projectIds: [" project-1 ", "project-1", "project-2"],
      states: ["blocked", "in_progress", "blocked"],
      areas: ["implementation", "validation", "implementation"],
      includeCompleted: true,
    });

    expect(result).toMatchObject({ ok: true });
    expect(deps.roadmap.query).toHaveBeenCalledWith({
      projectIds: ["project-1", "project-2"],
      states: ["blocked", "in_progress"],
      areas: ["implementation", "validation"],
      includeCompleted: true,
    });
  });

  it("rejects invalid or unbounded roadmap filters before the source", async () => {
    const deps = dependencies();
    const service = new DevOSReadService(deps);

    await expect(
      service.queryRoadmap({
        projectIds: ["valid", "bad id"],
        states: ["unknown"],
        areas: ["implementation"],
        includeCompleted: false,
      }),
    ).resolves.toEqual({ ok: false, code: "INVALID_INPUT" });

    await expect(
      service.queryRoadmap({
        projectIds: Array.from({ length: 51 }, (_, index) => `project-${index}`),
        states: [],
        areas: [],
        includeCompleted: false,
      }),
    ).resolves.toEqual({ ok: false, code: "INVALID_INPUT" });
    expect(deps.roadmap.query).not.toHaveBeenCalled();
  });
});
