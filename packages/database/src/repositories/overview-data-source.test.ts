import { describe, expect, it } from "vitest";
import { createSqliteDatabase, migrate } from "../adapters/sqlite";
import { SqliteOverviewDataSource } from "./overview-data-source";

describe("SqliteOverviewDataSource", () => {
  it("reads the demo project and current stage without inventing sync state", async () => {
    const database = createSqliteDatabase(":memory:");
    migrate(database);
    const source = new SqliteOverviewDataSource(database);

    await expect(source.listActiveProjects()).resolves.toMatchObject([
      {
        id: "demo-project-platform",
        slug: "semogtw-platform-demo",
        priority: "medium",
      },
    ]);
    await expect(source.listCurrentStages()).resolves.toMatchObject([
      {
        id: "demo-stage-database",
        state: "in_progress",
        progress: 10,
      },
    ]);
    await expect(source.listOpenAttention()).resolves.toEqual([]);
    await expect(source.getLastSuccessfulSyncAt()).resolves.toBeNull();
  });
});
