import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSqliteDatabase, migrate } from "../adapters/sqlite";
import { SqliteGrowthReadModel } from "../repositories/growth-read-model";
import { createVerifiedSqliteBackup } from "./sqlite-backup";

const temporaryDirectories: string[] = [];

function temporaryDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), "semogtw-growth-backup-"));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("Growth backup", () => {
  it("restores goals, checkpoints, skills, aliases and links", async () => {
    const database = createSqliteDatabase(":memory:");
    migrate(database);
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
        "Automação pessoal",
        "Criar ferramentas",
        "active",
        "high",
        "2026-12-31",
        "2026-08-04T00:00:00.000Z",
        "2026-08-04T00:00:00.000Z",
        1,
      );
    database.$client
      .prepare(
        `INSERT INTO learning_checkpoints (
          id, goal_id, title, description, status, required, sequence, weight,
          completion_mode, numeric_unit, numeric_target, accepted_value,
          due_date, created_at, updated_at, version
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        "checkpoint-1",
        "goal-1",
        "Prática",
        "",
        "in_progress",
        1,
        1,
        100,
        "numeric",
        "horas",
        10,
        4,
        "2026-08-10",
        "2026-08-04T00:00:00.000Z",
        "2026-08-04T00:00:00.000Z",
        1,
      );
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
        "python",
        "Python",
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
        "alias-1",
        "owner-1",
        "python",
        "skill-1",
        1,
        "created",
        "owner-1",
        "Create alias",
        "2026-08-04T00:00:00.000Z",
        "correlation-1",
        "idempotency-1",
      );
    database.$client
      .prepare(
        `INSERT INTO learning_goal_skills (
          goal_id, skill_id, desired_stage, created_at
        ) VALUES (?, ?, ?, ?)`,
      )
      .run(
        "goal-1",
        "skill-1",
        "applied",
        "2026-08-04T00:00:00.000Z",
      );

    const destination = join(temporaryDirectory(), "growth.sqlite");
    const backup = await createVerifiedSqliteBackup(database, destination);
    database.$client.close();

    expect(backup.migrations.at(-1)).toBe(
      "0017a_command_receipt_semantic_key.sql",
    );
    expect(backup.migrations).toContain(
      "0015a_learning_checkpoint_weight_modes.sql",
    );
    const restored = createSqliteDatabase(destination);
    const readModel = new SqliteGrowthReadModel(
      restored,
      () => "2026-08-04T02:00:00.000Z",
    );
    await expect(
      readModel.getGoal({ ownerId: "owner-1", goalId: "goal-1" }),
    ).resolves.toMatchObject({
      id: "goal-1",
      title: "Aprender Python",
      progress: {
        percent: 40,
        measurable: true,
      },
      checkpoints: [
        expect.objectContaining({
          id: "checkpoint-1",
          acceptedValue: 4,
        }),
      ],
      skills: [
        {
          skillId: "skill-1",
          canonicalSkillId: "skill-1",
          name: "Python",
          desiredStage: "applied",
        },
      ],
    });
    await expect(
      readModel.listSkills({
        ownerId: "owner-1",
        includeArchived: false,
        limit: 20,
      }),
    ).resolves.toEqual([
      expect.objectContaining({
        id: "skill-1",
        aliases: ["python"],
      }),
    ]);
    restored.$client.close();
  });
});
