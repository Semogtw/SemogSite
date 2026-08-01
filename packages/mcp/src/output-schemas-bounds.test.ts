import { describe, expect, it } from "vitest";
import {
  devosOverviewOutputSchema,
  devosProjectOutputSchema,
  devosProjectsOutputSchema,
  devosRoadmapOutputSchema,
  devosTodayOutputSchema,
} from "./output-schemas";

const records = Array.from({ length: 2_001 }, (_, index) => ({
  id: `record-${index}`,
}));
const timestamp = "2026-08-01T20:00:00.000Z";

describe("Semogtw MCP output collection bounds", () => {
  it("rejects more than 2,000 records in any projection collection", () => {
    expect(
      devosOverviewOutputSchema.safeParse({
        activeProjectCount: records.length,
        inProgressStageCount: 0,
        highImpactAttentionCount: 0,
        projects: records,
        currentStages: [],
        attention: [],
        lastSyncedAt: null,
      }).success,
    ).toBe(false);

    expect(
      devosTodayOutputSchema.safeParse({
        executeNow: records,
        nextInQueue: [],
        needsOwner: [],
        externalDependencies: [],
        recentActivity: [],
      }).success,
    ).toBe(false);

    expect(
      devosProjectsOutputSchema.safeParse({
        activeProjects: records,
        activeRepositories: [],
        repositoryCatalog: [],
      }).success,
    ).toBe(false);

    expect(
      devosProjectOutputSchema.safeParse({
        project: { id: "project-1" },
        repositories: records,
        currentStages: [],
        attention: [],
        evidence: [],
        recentSessions: [],
        nextGate: null,
        safetyConstraint: null,
        dataSource: "manual",
        updatedAt: timestamp,
      }).success,
    ).toBe(false);

    expect(
      devosRoadmapOutputSchema.safeParse({
        items: records,
        board: {
          backlog: [],
          next: [],
          in_progress: [],
          blocked: [],
          completed: [],
        },
      }).success,
    ).toBe(false);
  });

  it("accepts the reviewed collection boundary", () => {
    const boundary = Array.from({ length: 2_000 }, (_, index) => ({
      id: `record-${index}`,
    }));

    expect(
      devosRoadmapOutputSchema.safeParse({
        items: boundary,
        board: {
          backlog: [],
          next: [],
          in_progress: [],
          blocked: [],
          completed: [],
        },
      }).success,
    ).toBe(true);
  });
});
