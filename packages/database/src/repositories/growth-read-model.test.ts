import { afterEach, describe, expect, it } from "vitest";
import { createSqliteDatabase, migrate } from "../adapters/sqlite";
import { SqliteGrowthReadModel } from "./growth-read-model";

const databases: ReturnType<typeof createSqliteDatabase>[] = [];

afterEach(() => {
  for (const database of databases.splice(0)) database.$client.close();
});

function createHarness() {
  const database = createSqliteDatabase(":memory:");
  databases.push(database);
  migrate(database);
  return {
    database,
    readModel: new SqliteGrowthReadModel(
      database,
      () => "2026-08-04T02:00:00.000Z",
    ),
  };
}

function insertGoal(input: {
  database: ReturnType<typeof createSqliteDatabase>;
  id: string;
  ownerId: string;
  slug: string;
  title: string;
  status?: "draft" | "active" | "paused" | "completed" | "cancelled" | "archived";
  priority?: "critical" | "high" | "medium" | "low";
  targetDate?: string | null;
  updatedAt?: string;
}): void {
  input.database.$client
    .prepare(
      `INSERT INTO learning_goals (
        id, owner_id, slug, title, description, motivation, status, priority,
        target_date, created_at, updated_at, version
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      input.id,
      input.ownerId,
      input.slug,
      input.title,
      "",
      null,
      input.status ?? "active",
      input.priority ?? "medium",
      input.targetDate ?? null,
      "2026-08-04T00:00:00.000Z",
      input.updatedAt ?? "2026-08-04T00:00:00.000Z",
      1,
    );
}

function insertCheckpoint(input: {
  database: ReturnType<typeof createSqliteDatabase>;
  id: string;
  goalId: string;
  title: string;
  status: "pending" | "in_progress" | "completed" | "waived" | "cancelled";
  required: boolean;
  sequence: number;
  weight: number;
  mode: "binary" | "numeric";
  target?: number | null;
  acceptedValue?: number | null;
  dueDate?: string | null;
}): void {
  input.database.$client
    .prepare(
      `INSERT INTO learning_checkpoints (
        id, goal_id, title, description, status, required, sequence, weight,
        completion_mode, numeric_unit, numeric_target, accepted_value,
        due_date, created_at, updated_at, version
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      input.id,
      input.goalId,
      input.title,
      "",
      input.status,
      input.required ? 1 : 0,
      input.sequence,
      input.weight,
      input.mode,
      input.mode === "numeric" ? "horas" : null,
      input.mode === "numeric" ? (input.target ?? 10) : null,
      input.mode === "numeric" ? (input.acceptedValue ?? null) : null,
      input.dueDate ?? null,
      "2026-08-04T00:00:00.000Z",
      "2026-08-04T00:00:00.000Z",
      1,
    );
}

function insertSkill(input: {
  database: ReturnType<typeof createSqliteDatabase>;
  id: string;
  ownerId: string;
  slug: string;
  name: string;
  status: "active" | "archived" | "merged";
  mergedIntoSkillId?: string | null;
}): void {
  input.database.$client
    .prepare(
      `INSERT INTO skills (
        id, owner_id, slug, name, description, status, merged_into_skill_id,
        created_at, updated_at, version
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      input.id,
      input.ownerId,
      input.slug,
      input.name,
      "",
      input.status,
      input.mergedIntoSkillId ?? null,
      "2026-08-04T00:00:00.000Z",
      "2026-08-04T00:00:00.000Z",
      1,
    );
}

function insertAlias(input: {
  database: ReturnType<typeof createSqliteDatabase>;
  id: string;
  ownerId: string;
  alias: string;
  skillId: string;
  sequence: number;
  action: "created" | "revoked";
}): void {
  input.database.$client
    .prepare(
      `INSERT INTO skill_alias_events (
        id, owner_id, alias_slug, skill_id, sequence, action, actor_id,
        reason, occurred_at, correlation_id, idempotency_key
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      input.id,
      input.ownerId,
      input.alias,
      input.skillId,
      input.sequence,
      input.action,
      input.ownerId,
      "test",
      `2026-08-04T00:0${input.sequence}:00.000Z`,
      `correlation-${input.id}`,
      `idempotency-${input.id}`,
    );
}

describe("SqliteGrowthReadModel", () => {
  it("lists owner-scoped goals with deterministic derived progress", async () => {
    const { database, readModel } = createHarness();
    insertGoal({
      database,
      id: "goal-1",
      ownerId: "owner-1",
      slug: "python",
      title: "Aprender Python",
      priority: "high",
      updatedAt: "2026-08-04T01:00:00.000Z",
    });
    insertCheckpoint({
      database,
      id: "checkpoint-1",
      goalId: "goal-1",
      title: "Fundamentos",
      status: "completed",
      required: true,
      sequence: 1,
      weight: 20,
      mode: "binary",
    });
    insertCheckpoint({
      database,
      id: "checkpoint-2",
      goalId: "goal-1",
      title: "Prática",
      status: "in_progress",
      required: true,
      sequence: 2,
      weight: 80,
      mode: "numeric",
      target: 10,
      acceptedValue: 5,
      dueDate: "2026-08-10",
    });
    insertGoal({
      database,
      id: "goal-other-owner",
      ownerId: "owner-2",
      slug: "private-other",
      title: "Outro proprietário",
    });

    await expect(
      readModel.listGoals({
        ownerId: "owner-1",
        statuses: ["active"],
        limit: 10,
      }),
    ).resolves.toEqual([
      expect.objectContaining({
        id: "goal-1",
        title: "Aprender Python",
        progress: {
          percent: 60,
          measurable: true,
          completedWeight: 60,
          effectiveWeight: 100,
          requiredCheckpointsComplete: false,
        },
        checkpointCount: 2,
        nextCheckpoint: {
          id: "checkpoint-2",
          title: "Prática",
          status: "in_progress",
          dueDate: "2026-08-10",
        },
      }),
    ]);
  });

  it("returns indeterminate progress for a goal without measurable checkpoints", async () => {
    const { database, readModel } = createHarness();
    insertGoal({
      database,
      id: "goal-empty",
      ownerId: "owner-1",
      slug: "empty",
      title: "Meta sem checkpoints",
    });

    await expect(
      readModel.getGoal({ ownerId: "owner-1", goalId: "goal-empty" }),
    ).resolves.toMatchObject({
      progress: {
        percent: null,
        measurable: false,
        completedWeight: 0,
        effectiveWeight: 0,
        requiredCheckpointsComplete: false,
      },
      checkpoints: [],
    });
  });

  it("builds an overview with active goals and ordered due checkpoints", async () => {
    const { database, readModel } = createHarness();
    insertGoal({
      database,
      id: "goal-1",
      ownerId: "owner-1",
      slug: "goal-1",
      title: "Goal 1",
    });
    insertCheckpoint({
      database,
      id: "due-later",
      goalId: "goal-1",
      title: "Depois",
      status: "pending",
      required: false,
      sequence: 2,
      weight: 50,
      mode: "binary",
      dueDate: "2026-08-20",
    });
    insertCheckpoint({
      database,
      id: "due-first",
      goalId: "goal-1",
      title: "Primeiro",
      status: "in_progress",
      required: true,
      sequence: 1,
      weight: 50,
      mode: "binary",
      dueDate: "2026-08-05",
    });

    await expect(readModel.getOverview({ ownerId: "owner-1" })).resolves.toMatchObject({
      generatedAt: "2026-08-04T02:00:00.000Z",
      activeGoals: [expect.objectContaining({ id: "goal-1" })],
      dueCheckpoints: [
        expect.objectContaining({ id: "due-first", dueDate: "2026-08-05" }),
        expect.objectContaining({ id: "due-later", dueDate: "2026-08-20" }),
      ],
    });
  });

  it("resolves active aliases to the canonical skill", async () => {
    const { database, readModel } = createHarness();
    insertSkill({
      database,
      id: "skill-target",
      ownerId: "owner-1",
      slug: "javascript",
      name: "JavaScript",
      status: "active",
    });
    insertSkill({
      database,
      id: "skill-source",
      ownerId: "owner-1",
      slug: "typescript",
      name: "TypeScript antigo",
      status: "merged",
      mergedIntoSkillId: "skill-target",
    });
    insertAlias({
      database,
      id: "alias-target",
      ownerId: "owner-1",
      alias: "javascript",
      skillId: "skill-target",
      sequence: 1,
      action: "created",
    });
    insertAlias({
      database,
      id: "alias-source-created",
      ownerId: "owner-1",
      alias: "typescript",
      skillId: "skill-source",
      sequence: 1,
      action: "created",
    });
    insertAlias({
      database,
      id: "alias-source-revoked",
      ownerId: "owner-1",
      alias: "typescript",
      skillId: "skill-source",
      sequence: 2,
      action: "revoked",
    });
    insertAlias({
      database,
      id: "alias-source-redirect",
      ownerId: "owner-1",
      alias: "typescript",
      skillId: "skill-target",
      sequence: 3,
      action: "created",
    });

    await expect(
      readModel.listSkills({
        ownerId: "owner-1",
        includeArchived: false,
        limit: 20,
      }),
    ).resolves.toEqual([
      expect.objectContaining({
        id: "skill-target",
        canonicalSkillId: "skill-target",
        aliases: ["javascript", "typescript"],
      }),
    ]);

    const all = await readModel.listSkills({
      ownerId: "owner-1",
      includeArchived: true,
      limit: 20,
    });
    expect(all.find((value) => value.id === "skill-source")).toMatchObject({
      status: "merged",
      canonicalSkillId: "skill-target",
    });
  });

  it("rejects invalid filters and limits before reading", async () => {
    const { readModel } = createHarness();
    await expect(
      readModel.listGoals({
        ownerId: "owner-1",
        statuses: ["active"],
        limit: 0,
      }),
    ).rejects.toThrow("GROWTH_READ_LIMIT_INVALID");
    await expect(
      readModel.listGoals({
        ownerId: "owner-1",
        statuses: [],
        limit: 10,
      }),
    ).rejects.toThrow("GROWTH_STATUS_FILTER_REQUIRED");
  });

  it("fails closed when a numeric checkpoint row is corrupted", async () => {
    const { database, readModel } = createHarness();
    insertGoal({
      database,
      id: "goal-corrupt",
      ownerId: "owner-1",
      slug: "corrupt",
      title: "Corrupt",
    });
    insertCheckpoint({
      database,
      id: "checkpoint-corrupt",
      goalId: "goal-corrupt",
      title: "Corrupt",
      status: "in_progress",
      required: true,
      sequence: 1,
      weight: 100,
      mode: "numeric",
      target: 10,
      acceptedValue: 1,
    });
    database.$client.pragma("ignore_check_constraints = ON");
    database.$client
      .prepare(
        "UPDATE learning_checkpoints SET numeric_unit = NULL WHERE id = ?",
      )
      .run("checkpoint-corrupt");
    database.$client.pragma("ignore_check_constraints = OFF");

    await expect(
      readModel.getGoal({ ownerId: "owner-1", goalId: "goal-corrupt" }),
    ).rejects.toThrow("GROWTH_CHECKPOINT_ROW_INVALID");
  });

  it("returns DTOs without audit, event or idempotency fields", async () => {
    const { database, readModel } = createHarness();
    insertGoal({
      database,
      id: "goal-1",
      ownerId: "owner-1",
      slug: "goal-1",
      title: "Goal 1",
    });

    const detail = await readModel.getGoal({
      ownerId: "owner-1",
      goalId: "goal-1",
    });
    const serialized = JSON.stringify(detail);
    expect(serialized).not.toContain("idempotency");
    expect(serialized).not.toContain("correlation");
    expect(serialized).not.toContain("audit");
    expect(serialized).not.toContain("event");
    expect(serialized).not.toContain("beforeJson");
    expect(serialized).not.toContain("afterJson");
  });
});
