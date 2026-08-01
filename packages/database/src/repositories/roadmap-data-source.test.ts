import { describe, expect, it } from "vitest";
import { createSqliteDatabase, migrate } from "../adapters/sqlite";
import { SqliteRoadmapDataSource } from "./roadmap-data-source";

describe("SqliteRoadmapDataSource", () => {
  it("reads canonical stage order with its project name", async () => {
    const database = createSqliteDatabase(":memory:");
    migrate(database);
    const source = new SqliteRoadmapDataSource(database);

    await expect(source.listRoadmapItems()).resolves.toMatchObject([
      {
        id: "demo-stage-database",
        projectId: "demo-project-platform",
        projectName: "Semogtw Platform — demonstração",
        area: "validation",
        state: "in_progress",
        orderIndex: 1,
      },
    ]);
  });
});
