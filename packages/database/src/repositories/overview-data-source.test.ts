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
  it("excludes non-current stage states from the overview", async () => {
    const database = createSqliteDatabase(":memory:");
    migrate(database);
    database.$client
      .prepare(
        `INSERT INTO stages (
          id, project_id, title, area, state, progress, order_index,
          planned_result, current_position, next_step, blocker, evidence_summary,
          done, manual_lock, updated_from, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        "demo-stage-backlog",
        "demo-project-platform",
        "Backlog stage",
        "planning",
        "backlog",
        0,
        99,
        "Planned result",
        "Waiting",
        "Plan",
        null,
        null,
        0,
        0,
        "manual",
        "2026-08-01T12:00:00.000Z",
        "2026-08-01T12:00:00.000Z",
      );
    database.$client
      .prepare(
        `INSERT INTO stages (
          id, project_id, title, area, state, progress, order_index,
          planned_result, current_position, next_step, blocker, evidence_summary,
          done, manual_lock, updated_from, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        "demo-stage-blocked",
        "demo-project-platform",
        "Blocked stage",
        "validation",
        "blocked",
        20,
        2,
        "Validated result",
        "Blocked",
        "Unblock",
        "External dependency",
        null,
        0,
        0,
        "manual",
        "2026-08-01T13:00:00.000Z",
        "2026-08-01T13:00:00.000Z",
      );
    const source = new SqliteOverviewDataSource(database);

    const stages = await source.listCurrentStages();

    expect(stages.map((stage) => stage.id)).toEqual([
      "demo-stage-database",
      "demo-stage-blocked",
    ]);
    expect(stages.every((stage) =>
      stage.state === "in_progress" || stage.state === "blocked"
    )).toBe(true);
    database.$client.close();
  });

});
