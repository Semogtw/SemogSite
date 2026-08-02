import { describe, expect, it } from "vitest";
import { createSqliteDatabase, migrate } from "../adapters/sqlite";
import { SqliteTodayDataSource } from "./today-data-source";

describe("SqliteTodayDataSource", () => {
  it("reads the current demo stage without inventing attention or activity", async () => {
    const database = createSqliteDatabase(":memory:");
    migrate(database);
    const source = new SqliteTodayDataSource(database);

    await expect(source.listCurrentWork()).resolves.toMatchObject([
      {
        stageId: "demo-stage-database",
        projectId: "demo-project-platform",
        projectSlug: "semogtw-platform-demo",
        projectPriority: "medium",
        partiallyBlocked: false,
      },
    ]);
    await expect(source.listNextWork()).resolves.toEqual([]);
    await expect(source.listOwnerAttention()).resolves.toEqual([]);
    await expect(source.listExternalDependencies()).resolves.toEqual([]);
    await expect(source.listRecentActivity()).resolves.toEqual([]);
  });
});
