import { describe, expect, it } from "vitest";
import { createSqliteDatabase, migrate } from "../adapters/sqlite";
import { SqliteProjectDataSource } from "./project-data-source";

describe("SqliteProjectDataSource", () => {
  it("reads the demo portfolio and project hub from canonical tables", async () => {
    const database = createSqliteDatabase(":memory:");
    migrate(database);
    const source = new SqliteProjectDataSource(database);

    await expect(source.listProjects()).resolves.toMatchObject([
      {
        slug: "semogtw-platform-demo",
        status: "active",
        priority: "medium",
      },
    ]);
    await expect(source.listRepositories()).resolves.toEqual([]);

    const hub = await source.getProjectHub("semogtw-platform-demo");
    expect(hub).toMatchObject({
      project: { id: "demo-project-platform" },
      dataSource: "seed_demo",
    });
    expect(hub?.currentStages).toMatchObject([
      { id: "demo-stage-database", state: "in_progress" },
    ]);
  });
});
