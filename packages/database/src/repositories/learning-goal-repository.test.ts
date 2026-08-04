import type {
  CreateLearningGoalRecord,
  LearningGoalAggregate,
  UpdateLearningGoalRecord,
} from "@semogtw/domain/growth";
import { afterEach, describe, expect, it } from "vitest";
import { createSqliteDatabase, migrate } from "../adapters/sqlite";
import { SqliteLearningGoalRepository } from "./learning-goal-repository";

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
    repository: new SqliteLearningGoalRepository(database),
  };
}

function createInput(
  overrides: Partial<CreateLearningGoalRecord> = {},
): CreateLearningGoalRecord {
  const goal = {
    id: "goal-1",
    ownerId: "owner-1",
    slug: "aprender-python",
    title: "Aprender Python",
    description: "Automação pessoal",
    motivation: "Criar ferramentas",
    status: "draft" as const,
    priority: "medium" as const,
    targetDate: null,
    createdAt: "2026-08-04T00:00:00.000Z",
    updatedAt: "2026-08-04T00:00:00.000Z",
    version: 1,
  };
  return {
    goal,
    event: {
      id: "goal-event-1",
      aggregateType: "learning_goal",
      aggregateId: goal.id,
      sequence: 1,
      action: "learning_goal.create_draft",
      before: null,
      after: goal,
      reason: "Create learning goal draft",
      actorId: "owner-1",
      occurredAt: goal.createdAt,
      correlationId: "correlation-1",
      idempotencyKey: "idempotency-1",
    },
    context: {
      ownerId: "owner-1",
      actorId: "owner-1",
      correlationId: "correlation-1",
      idempotencyKey: "idempotency-1",
    },
    ...overrides,
  };
}

function updateInput(
  before: LearningGoalAggregate,
  overrides: Partial<UpdateLearningGoalRecord> = {},
): UpdateLearningGoalRecord {
  const after: LearningGoalAggregate = {
    ...before,
    status: "active",
    updatedAt: "2026-08-04T00:01:00.000Z",
    version: before.version + 1,
  };
  return {
    before,
    after,
    event: {
      id: "goal-event-2",
      aggregateType: "learning_goal",
      aggregateId: before.id,
      sequence: 2,
      action: "learning_goal.activate",
      before: {
        id: before.id,
        ownerId: before.ownerId,
        slug: before.slug,
        title: before.title,
        description: before.description,
        motivation: before.motivation,
        status: before.status,
        priority: before.priority,
        targetDate: before.targetDate,
        createdAt: before.createdAt,
        updatedAt: before.updatedAt,
        version: before.version,
      },
      after: {
        id: after.id,
        ownerId: after.ownerId,
        slug: after.slug,
        title: after.title,
        description: after.description,
        motivation: after.motivation,
        status: after.status,
        priority: after.priority,
        targetDate: after.targetDate,
        createdAt: after.createdAt,
        updatedAt: after.updatedAt,
        version: after.version,
      },
      reason: "Start learning",
      actorId: "owner-1",
      occurredAt: after.updatedAt,
      correlationId: "correlation-2",
      idempotencyKey: "idempotency-2",
    },
    context: {
      ownerId: "owner-1",
      actorId: "owner-1",
      correlationId: "correlation-2",
      idempotencyKey: "idempotency-2",
    },
    ...overrides,
  };
}

describe("SqliteLearningGoalRepository", () => {
  it("creates goal, domain event and audit atomically", async () => {
    const { database, repository } = createHarness();

    const result = await repository.create(createInput());

    expect(result).toMatchObject({
      kind: "applied",
      value: { id: "goal-1", status: "draft", checkpoints: [], skills: [] },
    });
    expect(
      database.$client
        .prepare("SELECT COUNT(*) AS count FROM learning_goals")
        .get(),
    ).toEqual({ count: 1 });
    expect(
      database.$client
        .prepare("SELECT COUNT(*) AS count FROM learning_goal_events")
        .get(),
    ).toEqual({ count: 1 });
    expect(
      database.$client
        .prepare(
          "SELECT action, entity_type, entity_id, correlation_id FROM audit_events",
        )
        .get(),
    ).toEqual({
      action: "learning_goal.create_draft",
      entity_type: "learning_goal",
      entity_id: "goal-1",
      correlation_id: "correlation-1",
    });
  });

  it("replays semantic create input despite regenerated IDs and timestamps", async () => {
    const { repository } = createHarness();
    await repository.create(createInput());

    const retry = createInput({
      goal: {
        ...createInput().goal,
        id: "goal-regenerated",
        createdAt: "2026-08-04T00:00:05.000Z",
        updatedAt: "2026-08-04T00:00:05.000Z",
      },
      event: {
        ...createInput().event,
        id: "goal-event-regenerated",
        aggregateId: "goal-regenerated",
        after: {
          ...createInput().goal,
          id: "goal-regenerated",
          createdAt: "2026-08-04T00:00:05.000Z",
          updatedAt: "2026-08-04T00:00:05.000Z",
        },
        occurredAt: "2026-08-04T00:00:05.000Z",
      },
    });

    await expect(repository.create(retry)).resolves.toMatchObject({
      kind: "idempotent",
      value: { id: "goal-1" },
    });
  });

  it("conflicts when one create key is reused with different semantics", async () => {
    const { repository } = createHarness();
    await repository.create(createInput());

    await expect(
      repository.create(
        createInput({
          goal: { ...createInput().goal, title: "Aprender Rust" },
        }),
      ),
    ).resolves.toEqual({ kind: "conflict" });
  });

  it("rolls back goal and domain event when audit insertion fails", async () => {
    const { database, repository } = createHarness();
    database.$client
      .prepare(
        `INSERT INTO audit_events (
          id, actor, action, entity_type, entity_id, before_json, after_json,
          reason, occurred_at, source, confirmed, correlation_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        "growth-audit-goal-event-1",
        "owner-1",
        "existing",
        "learning_goal",
        "other",
        null,
        null,
        "existing",
        "2026-08-04T00:00:00.000Z",
        "manual",
        0,
        "existing",
      );

    await expect(repository.create(createInput())).rejects.toThrow();
    expect(
      database.$client
        .prepare("SELECT COUNT(*) AS count FROM learning_goals")
        .get(),
    ).toEqual({ count: 0 });
    expect(
      database.$client
        .prepare("SELECT COUNT(*) AS count FROM learning_goal_events")
        .get(),
    ).toEqual({ count: 0 });
  });

  it("updates with optimistic concurrency and exact idempotent replay", async () => {
    const { repository } = createHarness();
    const created = await repository.create(createInput());
    if (created.kind === "conflict") throw new Error("unexpected conflict");

    const input = updateInput(created.value);
    const applied = await repository.update(input);
    expect(applied).toMatchObject({
      kind: "applied",
      value: { status: "active", version: 2 },
    });
    await expect(repository.update(input)).resolves.toMatchObject({
      kind: "idempotent",
      value: { status: "active", version: 2 },
    });
  });

  it("rejects stale or changed update payloads without partial writes", async () => {
    const { database, repository } = createHarness();
    const created = await repository.create(createInput());
    if (created.kind === "conflict") throw new Error("unexpected conflict");
    await repository.update(updateInput(created.value));

    const changed = updateInput(created.value, {
      after: {
        ...created.value,
        status: "paused",
        updatedAt: "2026-08-04T00:01:00.000Z",
        version: 2,
      },
    });
    await expect(repository.update(changed)).resolves.toEqual({
      kind: "conflict",
    });

    expect(
      database.$client
        .prepare("SELECT status, version FROM learning_goals WHERE id = ?")
        .get("goal-1"),
    ).toEqual({ status: "active", version: 2 });
    expect(
      database.$client
        .prepare("SELECT COUNT(*) AS count FROM learning_goal_events")
        .get(),
    ).toEqual({ count: 2 });
  });

  it("isolates goals by owner", async () => {
    const { repository } = createHarness();
    await repository.create(createInput());

    await expect(repository.getById("owner-2", "goal-1")).resolves.toBeNull();
    await expect(repository.getById("owner-1", "goal-1")).resolves.toMatchObject({
      id: "goal-1",
    });
  });
});
