import { describe, expect, it } from "vitest";
import { OverviewService, type OverviewDataSource } from "./overview-service";

const source: OverviewDataSource = {
  listActiveProjects: async () => [
    {
      id: "p1",
      slug: "one",
      name: "One",
      priority: "critical",
      health: "attention",
      progressEstimate: 40,
      focus: "Foco",
      nextAction: "Próximo",
      branchSummary: "main",
      lastActivityAt: "2026-08-01T00:00:00.000Z",
      lastSyncedAt: "2026-08-01T00:00:00.000Z",
    },
  ],
  listCurrentStages: async () => [
    { id: "s1", projectId: "p1", title: "A", state: "in_progress", progress: 20, orderIndex: 1 },
    { id: "s2", projectId: "p1", title: "B", state: "in_progress", progress: 40, orderIndex: 2 },
    { id: "s3", projectId: "p1", title: "C", state: "blocked", progress: 50, orderIndex: 3 },
  ],
  listOpenAttention: async () => [
    { id: "a1", projectId: "p1", title: "Atenção", impact: "high", owner: "owner", nextAction: "Decidir" },
  ],
  getLastSuccessfulSyncAt: async () => "2026-08-01T00:00:00.000Z",
};

describe("OverviewService", () => {
  it("returns metrics and at most two current stages per project", async () => {
    const overview = await new OverviewService(source).getOverview();

    expect(overview.activeProjectCount).toBe(1);
    expect(overview.inProgressStageCount).toBe(2);
    expect(overview.highImpactAttentionCount).toBe(1);
    expect(overview.currentStages).toHaveLength(2);
    expect(overview.currentStages.map((stage) => stage.id)).toEqual(["s1", "s2"]);
  });
});
