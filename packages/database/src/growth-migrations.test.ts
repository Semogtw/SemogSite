import { describe, expect, it } from "vitest";
import { createSqliteDatabase, migrate } from "./adapters/sqlite";

function insertGoal(database: ReturnType<typeof createSqliteDatabase>): void {
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
      "aprender-python",
      "Aprender Python",
      "",
      null,
      "active",
      "medium",
      null,
      "2026-08-04T00:00:00.000Z",
      "2026-08-04T00:00:00.000Z",
      1,
    );
}

describe("learning goals migration", () => {
  it("applies Growth migrations idempotently without claiming migration 0014", () => {
    const database = createSqliteDatabase(":memory:");

    migrate(database);
    migrate(database);

    const migrationNames = database.$client
      .prepare("SELECT name FROM _semogtw_migrations ORDER BY name ASC")
      .all()
      .map((row) => (row as { name: string }).name);

    expect(migrationNames).toContain("0015_learning_goals.sql");
    expect(migrationNames).toContain(
      "0015a_learning_checkpoint_weight_modes.sql",
    );
    expect(migrationNames).not.toContain("0014_mcp_oauth.sql");
    expect(migrationNames.at(-1)).toBe(
      "0015a_learning_checkpoint_weight_modes.sql",
    );

    database.$client.close();
  });

  it("creates the complete private Growth table set", () => {
    const database = createSqliteDatabase(":memory:");
    migrate(database);

    const tables = database.$client
      .prepare(
        `SELECT name FROM sqlite_master
         WHERE type = 'table' AND name IN (
           'learning_goals',
           'learning_goal_events',
           'learning_checkpoints',
           'learning_checkpoint_events',
           'skills',
           'skill_alias_events',
           'learning_goal_skills',
           'learning_checkpoint_skills'
         )
         ORDER BY name ASC`,
      )
      .all();

    expect(tables).toEqual([
      { name: "learning_checkpoint_events" },
      { name: "learning_checkpoint_skills" },
      { name: "learning_checkpoints" },
      { name: "learning_goal_events" },
      { name: "learning_goal_skills" },
      { name: "learning_goals" },
      { name: "skill_alias_events" },
      { name: "skills" },
    ]);

    database.$client.close();
  });

  it("contains no canonical percentage column", () => {
    const database = createSqliteDatabase(":memory:");
    migrate(database);

    for (const table of ["learning_goals", "learning_checkpoints", "skills"]) {
      const columns = database.$client
        .prepare(`PRAGMA table_info(${table})`)
        .all()
        .map((row) => (row as { name: string }).name);
      expect(columns).not.toContain("goal_progress_percent");
      expect(columns).not.toContain("progress_percent");
      expect(columns).not.toContain("progress");
    }

    database.$client.close();
  });

  it("enforces canonical slugs, checkpoint sequence, weight and completion mode", () => {
    const database = createSqliteDatabase(":memory:");
    migrate(database);
    insertGoal(database);

    const insertCheckpoint = database.$client.prepare(
      `INSERT INTO learning_checkpoints (
        id, goal_id, title, description, status, required, sequence, weight,
        completion_mode, numeric_unit, numeric_target, accepted_value,
        due_date, created_at, updated_at, version
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );

    insertCheckpoint.run(
      "checkpoint-1",
      "goal-1",
      "Prática",
      "",
      "in_progress",
      1,
      1,
      40,
      "numeric",
      "horas",
      10,
      4,
      null,
      "2026-08-04T00:00:00.000Z",
      "2026-08-04T00:00:00.000Z",
      1,
    );

    expect(() =>
      insertCheckpoint.run(
        "checkpoint-weight",
        "goal-1",
        "Peso inválido",
        "",
        "pending",
        0,
        2,
        0,
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

    expect(() =>
      insertCheckpoint.run(
        "checkpoint-sequence",
        "goal-1",
        "Sequência duplicada",
        "",
        "pending",
        0,
        1,
        60,
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

    expect(() =>
      insertCheckpoint.run(
        "checkpoint-numeric",
        "goal-1",
        "Meta inválida",
        "",
        "pending",
        0,
        2,
        60,
        "numeric",
        "horas",
        0,
        null,
        null,
        "2026-08-04T00:00:00.000Z",
        "2026-08-04T00:00:00.000Z",
        1,
      ),
    ).toThrow();

    expect(() =>
      database.$client
        .prepare(
          `INSERT INTO learning_goals (
            id, owner_id, slug, title, description, motivation, status, priority,
            target_date, created_at, updated_at, version
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          "goal-duplicate",
          "owner-1",
          "aprender-python",
          "Outro goal",
          "",
          null,
          "draft",
          "low",
          null,
          "2026-08-04T00:00:00.000Z",
          "2026-08-04T00:00:00.000Z",
          1,
        ),
    ).toThrow();

    database.$client.close();
  });

  it("enforces skill merge invariants and unique links", () => {
    const database = createSqliteDatabase(":memory:");
    migrate(database);
    insertGoal(database);

    const insertSkill = database.$client.prepare(
      `INSERT INTO skills (
        id, owner_id, slug, name, description, status, merged_into_skill_id,
        created_at, updated_at, version
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    insertSkill.run(
      "skill-a",
      "owner-1",
      "typescript",
      "TypeScript",
      "",
      "active",
      null,
      "2026-08-04T00:00:00.000Z",
      "2026-08-04T00:00:00.000Z",
      1,
    );
    insertSkill.run(
      "skill-b",
      "owner-1",
      "javascript",
      "JavaScript",
      "",
      "active",
      null,
      "2026-08-04T00:00:00.000Z",
      "2026-08-04T00:00:00.000Z",
      1,
    );

    expect(() =>
      database.$client
        .prepare(
          `UPDATE skills
           SET status = 'merged', merged_into_skill_id = id, version = version + 1
           WHERE id = 'skill-a'`,
        )
        .run(),
    ).toThrow();

    const link = database.$client.prepare(
      `INSERT INTO learning_goal_skills (
        goal_id, skill_id, desired_stage, created_at
      ) VALUES (?, ?, ?, ?)`,
    );
    link.run(
      "goal-1",
      "skill-a",
      "applied",
      "2026-08-04T00:00:00.000Z",
    );
    expect(() =>
      link.run(
        "goal-1",
        "skill-a",
        "demonstrated",
        "2026-08-04T00:00:00.000Z",
      ),
    ).toThrow();

    database.$client.close();
  });

  it("keeps domain and alias events append-only with contiguous sequences", () => {
    const database = createSqliteDatabase(":memory:");
    migrate(database);
    insertGoal(database);

    const insertGoalEvent = database.$client.prepare(
      `INSERT INTO learning_goal_events (
        id, goal_id, sequence, action, before_json, after_json, reason,
        actor_id, occurred_at, correlation_id, idempotency_key
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );

    insertGoalEvent.run(
      "goal-event-1",
      "goal-1",
      1,
      "learning_goal.create_draft",
      null,
      '{"status":"draft"}',
      "Create goal",
      "owner-1",
      "2026-08-04T00:00:00.000Z",
      "correlation-1",
      "idempotency-1",
    );

    expect(() =>
      insertGoalEvent.run(
        "goal-event-3",
        "goal-1",
        3,
        "learning_goal.activate",
        '{"status":"draft"}',
        '{"status":"active"}',
        "Activate",
        "owner-1",
        "2026-08-04T00:01:00.000Z",
        "correlation-2",
        "idempotency-2",
      ),
    ).toThrow("LEARNING_GOAL_EVENT_SEQUENCE_INVALID");

    expect(() =>
      database.$client
        .prepare(
          "UPDATE learning_goal_events SET reason = 'changed' WHERE id = ?",
        )
        .run("goal-event-1"),
    ).toThrow("LEARNING_GOAL_EVENTS_IMMUTABLE");

    expect(() =>
      database.$client
        .prepare("DELETE FROM learning_goal_events WHERE id = ?")
        .run("goal-event-1"),
    ).toThrow("LEARNING_GOAL_EVENTS_IMMUTABLE");

    database.$client
      .prepare(
        `INSERT INTO skills (
          id, owner_id, slug, name, description, status, merged_into_skill_id,
          created_at, updated_at, version
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        "skill-1",
        "owner-1",
        "typescript",
        "TypeScript",
        "",
        "active",
        null,
        "2026-08-04T00:00:00.000Z",
        "2026-08-04T00:00:00.000Z",
        1,
      );

    database.$client
      .prepare(
        `INSERT INTO skill_alias_events (
          id, owner_id, alias_slug, skill_id, sequence, action, actor_id,
          reason, occurred_at, correlation_id, idempotency_key
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        "alias-event-1",
        "owner-1",
        "ts",
        "skill-1",
        1,
        "created",
        "owner-1",
        "Create alias",
        "2026-08-04T00:00:00.000Z",
        "correlation-3",
        "idempotency-3",
      );

    expect(() =>
      database.$client
        .prepare(
          "DELETE FROM skill_alias_events WHERE id = 'alias-event-1'",
        )
        .run(),
    ).toThrow("SKILL_ALIAS_EVENTS_IMMUTABLE");

    database.$client.close();
  });
});
