import { afterEach, describe, expect, it } from "vitest";
import { createSqliteDatabase, migrate } from "./adapters/sqlite";

const databases: ReturnType<typeof createSqliteDatabase>[] = [];

afterEach(() => {
  for (const database of databases.splice(0)) database.$client.close();
});

describe("Growth checkpoint weight mode migration", () => {
  it("persists an explicit automatic/custom mode with a safe automatic default", () => {
    const database = createSqliteDatabase(":memory:");
    databases.push(database);
    migrate(database);

    const columns = database.$client
      .prepare("PRAGMA table_info(learning_checkpoints)")
      .all() as Array<{
      name: string;
      notnull: number;
      dflt_value: string | null;
    }>;
    const weightMode = columns.find((column) => column.name === "weight_mode");

    expect(weightMode).toEqual(
      expect.objectContaining({
        name: "weight_mode",
        notnull: 1,
        dflt_value: "'automatic'",
      }),
    );

    expect(() =>
      database.$client
        .prepare(
          `INSERT INTO learning_goals (
            id, owner_id, slug, title, description, motivation, status, priority,
            target_date, created_at, updated_at, version
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          "goal-1",
          "owner-1",
          "goal",
          "Goal",
          "",
          null,
          "draft",
          "medium",
          null,
          "2026-08-04T00:00:00.000Z",
          "2026-08-04T00:00:00.000Z",
          1,
        ),
    ).not.toThrow();

    expect(() =>
      database.$client
        .prepare(
          `INSERT INTO learning_checkpoints (
            id, goal_id, title, description, status, required, sequence, weight,
            weight_mode, completion_mode, numeric_unit, numeric_target,
            accepted_value, due_date, created_at, updated_at, version
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          "checkpoint-1",
          "goal-1",
          "Checkpoint",
          "",
          "pending",
          1,
          1,
          100,
          "invalid",
          "binary",
          null,
          null,
          null,
          null,
          "2026-08-04T00:00:00.000Z",
          "2026-08-04T00:00:00.000Z",
          1,
        ),
    ).toThrow();
  });
});
