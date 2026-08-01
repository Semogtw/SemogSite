import { describe, expect, it } from "vitest";
import {
  devosOverviewOutputSchema,
  devosProjectOutputSchema,
  devosProjectsOutputSchema,
  devosRoadmapOutputSchema,
  devosTodayOutputSchema,
} from "./output-schemas";

const timestamp = "2026-08-01T20:00:00.000Z";

describe("Semogtw MCP output schemas", () => {
  it("accepts representative canonical DevOS projections", () => {
    expect(
      devosOverviewOutputSchema.safeParse({
        activeProjectCount: 1,
        inProgressStageCount: 1,
        highImpactAttentionCount: 0,
        projects: [{ id: "project-1", slug: "semog-site" }],
        currentStages: [{ id: "stage-1", state: "in_progress" }],
        attention: [],
        lastSyncedAt: null,
      }).success,
    ).toBe(true);

    expect(
      devosTodayOutputSchema.safeParse({
        executeNow: [],
        nextInQueue: [],
        needsOwner: [],
        externalDependencies: [],
        recentActivity: [{ id: "session-1", occurredAt: timestamp }],
      }).success,
    ).toBe(true);

    expect(
      devosProjectsOutputSchema.safeParse({
        activeProjects: [{ id: "project-1" }],
        activeRepositories: [{ id: "repository-1" }],
        repositoryCatalog: [{ id: "repository-1", status: "active" }],
      }).success,
    ).toBe(true);

    expect(
      devosProjectOutputSchema.safeParse({
        project: { id: "project-1", slug: "semog-site" },
        repositories: [],
        currentStages: [],
        attention: [],
        evidence: [],
        recentSessions: [],
        nextGate: null,
        safetyConstraint: null,
        dataSource: "manual",
        updatedAt: timestamp,
      }).success,
    ).toBe(true);

    expect(
      devosRoadmapOutputSchema.safeParse({
        items: [{ id: "stage-1", state: "in_progress" }],
        board: {
          backlog: [],
          next: [],
          in_progress: [{ id: "stage-1" }],
          blocked: [],
          completed: [],
        },
      }).success,
    ).toBe(true);
  });

  it.each([
    [devosOverviewOutputSchema, { activeProjectCount: "1" }],
    [devosTodayOutputSchema, { executeNow: null }],
    [devosProjectsOutputSchema, { activeProjects: [] }],
    [
      devosProjectOutputSchema,
      {
        project: {},
        repositories: [],
        currentStages: [],
        attention: [],
        evidence: [],
        recentSessions: [],
        nextGate: null,
        safetyConstraint: null,
        dataSource: "unknown",
        updatedAt: "not-a-date",
      },
    ],
    [
      devosRoadmapOutputSchema,
      {
        items: [],
        board: {
          backlog: [],
          next: [],
          in_progress: [],
          blocked: [],
        },
      },
    ],
  ])("rejects malformed projection %#", (schema, value) => {
    expect(schema.safeParse(value).success).toBe(false);
  });

  it("preserves compatible future fields at object boundaries", () => {
    const parsed = devosOverviewOutputSchema.parse({
      activeProjectCount: 0,
      inProgressStageCount: 0,
      highImpactAttentionCount: 0,
      projects: [],
      currentStages: [],
      attention: [],
      lastSyncedAt: timestamp,
      futureCompatibleField: { enabled: true },
    });

    expect(parsed).toMatchObject({
      futureCompatibleField: { enabled: true },
    });
  });
});
