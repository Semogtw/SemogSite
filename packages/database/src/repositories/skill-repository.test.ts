import type {
  CreateSkillRecord,
  LearningCheckpointSkillLink,
  LearningGoalSkillLink,
  SkillRecord,
  UpdateSkillRecord,
} from "@semogtw/domain/growth";
import { afterEach, describe, expect, it } from "vitest";
import { createSqliteDatabase, migrate } from "../adapters/sqlite";
import { SqliteSkillRepository } from "./skill-repository";

const databases: ReturnType<typeof createSqliteDatabase>[] = [];

afterEach(() => {
  for (const database of databases.splice(0)) database.$client.close();
});

function createHarness() {
  const database = createSqliteDatabase(":memory:");
  databases.push(database);
  migrate(database);
  return { database, repository: new SqliteSkillRepository(database) };
}

function skill(id: string, slug: string, name: string): SkillRecord {
  return {
    id,
    ownerId: "owner-1",
    slug,
    name,
    description: "",
    status: "active",
    mergedIntoSkillId: null,
    createdAt: "2026-08-04T00:00:00.000Z",
    updatedAt: "2026-08-04T00:00:00.000Z",
    version: 1,
  };
}

function createInput(value: SkillRecord, key: string): CreateSkillRecord {
  return {
    skill: value,
    event: {
      id: `event-${value.id}`,
      aggregateType: "skill",
      aggregateId: value.id,
      sequence: 1,
      action: "skill.create",
      before: null,
      after: value,
      reason: "Create skill",
      actorId: "owner-1",
      occurredAt: value.createdAt,
      correlationId: `correlation-${key}`,
      idempotencyKey: key,
    },
    context: {
      ownerId: "owner-1",
      actorId: "owner-1",
      correlationId: `correlation-${key}`,
      idempotencyKey: key,
    },
  };
}

describe("SqliteSkillRepository", () => {
  it("creates a skill, canonical alias event and audit atomically", async () => {
    const { database, repository } = createHarness();
    const value = skill("skill-1", "typescript", "TypeScript");

    await expect(repository.create(createInput(value, "skill-create-1"))).resolves.toMatchObject({
      kind: "applied",
      value: { id: "skill-1", status: "active" },
    });
    expect(
      database.$client
        .prepare(
          "SELECT alias_slug, skill_id, sequence, action FROM skill_alias_events",
        )
        .get(),
    ).toEqual({
      alias_slug: "typescript",
      skill_id: "skill-1",
      sequence: 1,
      action: "created",
    });
    expect(
      database.$client
        .prepare(
          "SELECT action, entity_type, entity_id FROM audit_events WHERE entity_type = 'skill'",
        )
        .get(),
    ).toEqual({
      action: "skill.create",
      entity_type: "skill",
      entity_id: "skill-1",
    });
  });

  it("replays semantic creation and conflicts on changed payload", async () => {
    const { repository } = createHarness();
    await repository.create(
      createInput(skill("skill-1", "typescript", "TypeScript"), "skill-create-1"),
    );

    await expect(
      repository.create(
        createInput(
          {
            ...skill("skill-regenerated", "typescript", "TypeScript"),
            createdAt: "2026-08-04T00:00:05.000Z",
            updatedAt: "2026-08-04T00:00:05.000Z",
          },
          "skill-create-1",
        ),
      ),
    ).resolves.toMatchObject({ kind: "idempotent", value: { id: "skill-1" } });

    await expect(
      repository.create(
        createInput(skill("skill-other", "typescript", "TS diferente"), "skill-create-1"),
      ),
    ).resolves.toEqual({ kind: "conflict" });
  });

  it("archives by revoking the canonical alias", async () => {
    const { database, repository } = createHarness();
    const before = skill("skill-1", "typescript", "TypeScript");
    await repository.create(createInput(before, "skill-create-1"));
    const after: SkillRecord = {
      ...before,
      status: "archived",
      updatedAt: "2026-08-04T00:01:00.000Z",
      version: 2,
    };
    const input: UpdateSkillRecord = {
      before,
      after,
      event: {
        id: "skill-event-archive",
        aggregateType: "skill",
        aggregateId: before.id,
        sequence: 2,
        action: "skill.archive",
        before,
        after,
        reason: "Archive",
        actorId: "owner-1",
        occurredAt: after.updatedAt,
        correlationId: "correlation-archive",
        idempotencyKey: "skill-archive-1",
      },
      context: {
        ownerId: "owner-1",
        actorId: "owner-1",
        correlationId: "correlation-archive",
        idempotencyKey: "skill-archive-1",
      },
    };

    await expect(repository.update(input)).resolves.toMatchObject({
      kind: "applied",
      value: { status: "archived", version: 2 },
    });
    expect(
      database.$client
        .prepare(
          "SELECT sequence, action FROM skill_alias_events WHERE alias_slug = ? ORDER BY sequence",
        )
        .all("typescript"),
    ).toEqual([
      { sequence: 1, action: "created" },
      { sequence: 2, action: "revoked" },
    ]);
    await expect(repository.update(input)).resolves.toMatchObject({
      kind: "idempotent",
      value: { status: "archived" },
    });
  });

  it("merges a skill and redirects its canonical alias to the target", async () => {
    const { database, repository } = createHarness();
    const source = skill("skill-source", "typescript", "TypeScript");
    const target = skill("skill-target", "javascript", "JavaScript");
    await repository.create(createInput(source, "skill-create-source"));
    await repository.create(createInput(target, "skill-create-target"));
    const after: SkillRecord = {
      ...source,
      status: "merged",
      mergedIntoSkillId: target.id,
      updatedAt: "2026-08-04T00:02:00.000Z",
      version: 2,
    };

    await repository.update({
      before: source,
      after,
      event: {
        id: "skill-event-merge",
        aggregateType: "skill",
        aggregateId: source.id,
        sequence: 2,
        action: "skill.merge",
        before: source,
        after,
        reason: "Merge duplicate",
        actorId: "owner-1",
        occurredAt: after.updatedAt,
        correlationId: "correlation-merge",
        idempotencyKey: "skill-merge-1",
      },
      context: {
        ownerId: "owner-1",
        actorId: "owner-1",
        correlationId: "correlation-merge",
        idempotencyKey: "skill-merge-1",
      },
    });

    expect(
      database.$client
        .prepare(
          `SELECT sequence, action, skill_id
           FROM skill_alias_events
           WHERE alias_slug = 'typescript'
           ORDER BY sequence`,
        )
        .all(),
    ).toEqual([
      { sequence: 1, action: "created", skill_id: "skill-source" },
      { sequence: 2, action: "revoked", skill_id: "skill-source" },
      { sequence: 3, action: "created", skill_id: "skill-target" },
    ]);
  });

  it("detects a merge cycle through persisted redirects", async () => {
    const { database, repository } = createHarness();
    const first = skill("skill-a", "a", "A");
    const second = skill("skill-b", "b", "B");
    await repository.create(createInput(first, "create-a"));
    await repository.create(createInput(second, "create-b"));
    database.$client
      .prepare(
        "UPDATE skills SET status = 'merged', merged_into_skill_id = ?, version = 2 WHERE id = ?",
      )
      .run("skill-a", "skill-b");

    await expect(
      repository.isMergeTargetInChain({
        ownerId: "owner-1",
        sourceSkillId: "skill-a",
        targetSkillId: "skill-b",
      }),
    ).resolves.toBe(true);
  });

  it("creates idempotent goal and checkpoint links with expected-version guards", async () => {
    const { database, repository } = createHarness();
    const value = skill("skill-1", "typescript", "TypeScript");
    await repository.create(createInput(value, "skill-create-1"));
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
        "active",
        "medium",
        null,
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
        "Checkpoint",
        "",
        "pending",
        1,
        1,
        100,
        "binary",
        null,
        null,
        null,
        null,
        "2026-08-04T00:00:00.000Z",
        "2026-08-04T00:00:00.000Z",
        1,
      );

    const context = {
      ownerId: "owner-1",
      actorId: "owner-1",
      correlationId: "correlation-link",
      idempotencyKey: "link-1",
    };
    const goalLink: LearningGoalSkillLink = {
      goalId: "goal-1",
      skillId: "skill-1",
      desiredStage: "applied",
      createdAt: "2026-08-04T00:03:00.000Z",
    };
    await expect(
      repository.linkGoal({ link: goalLink, expectedGoalVersion: 1, context }),
    ).resolves.toMatchObject({ kind: "applied" });
    await expect(
      repository.linkGoal({ link: goalLink, expectedGoalVersion: 1, context }),
    ).resolves.toMatchObject({ kind: "idempotent" });

    const checkpointLink: LearningCheckpointSkillLink = {
      checkpointId: "checkpoint-1",
      skillId: "skill-1",
      desiredStage: "demonstrated",
      createdAt: "2026-08-04T00:03:00.000Z",
    };
    await expect(
      repository.linkCheckpoint({
        link: checkpointLink,
        expectedCheckpointVersion: 99,
        context: { ...context, idempotencyKey: "link-2" },
      }),
    ).resolves.toEqual({ kind: "conflict" });
  });
});
