import { describe, expect, it } from "vitest";
import { createSqliteDatabase, migrate } from "../adapters/sqlite";
import { createSqliteDevOSReadService } from "./devos-read-service";

describe("createSqliteDevOSReadService", () => {
  it("composes the canonical read models against the migrated demo database", async () => {
    const database = createSqliteDatabase(":memory:");
    migrate(database);
    const service = createSqliteDevOSReadService(database);

    await expect(service.getOverview()).resolves.toMatchObject({
      activeProjectCount: 1,
      inProgressStageCount: 1,
      projects: [
        {
          id: "demo-project-platform",
          slug: "semogtw-platform-demo",
        },
      ],
    });
    await expect(service.getToday()).resolves.toMatchObject({
      executeNow: [
        {
          stageId: "demo-stage-database",
          projectSlug: "semogtw-platform-demo",
        },
      ],
    });
    await expect(service.listProjects()).resolves.toMatchObject({
      activeProjects: [
        {
          id: "demo-project-platform",
          slug: "semogtw-platform-demo",
        },
      ],
    });
    await expect(
      service.getProject("semogtw-platform-demo"),
    ).resolves.toMatchObject({
      ok: true,
      data: {
        project: { id: "demo-project-platform" },
        currentStages: [{ id: "demo-stage-database" }],
      },
    });
    await expect(
      service.queryRoadmap({
        projectIds: [],
        states: [],
        areas: [],
        includeCompleted: false,
      }),
    ).resolves.toMatchObject({
      ok: true,
      data: {
        items: [{ id: "demo-stage-database" }],
        board: { in_progress: [{ id: "demo-stage-database" }] },
      },
    });

    database.$client.close();
  });
});
