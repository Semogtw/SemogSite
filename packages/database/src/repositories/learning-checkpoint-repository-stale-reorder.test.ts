import type {
  LearningCheckpointRecord,
  LearningGoalAggregate,
  ReorderLearningCheckpointsRecord,
} from "@semogtw/domain/growth";
import { afterEach, describe, expect, it } from "vitest";
import { createSqliteDatabase, migrate } from "../adapters/sqlite";
import { SqliteLearningCheckpointRepository } from "./learning-checkpoint-repository";

const databases: ReturnType<typeof createSqliteDatabase>[] = [];

afterEach(() => {
  for (const database of databases.splice(0)) database.$client.close();
});

function checkpoint(
  id: string,
  sequence: number,
  version = 1,
): LearningCheckpointRecord {
  return {
    id,
    goalId: "goal-1",
    title: `Checkpoint ${sequence}`,
    description: "",
    status: "pending",
    required: true,
    sequence,
    weight: 50,
    completionMode: { kind: "binary" },
    acceptedValue: null,
    dueDate: null,
    createdAt: "2026-08-04T00:00:00.000Z",
    updatedAt: "2026-08-04T00:00:00.000Z",
    version,
  };
}

function insertCheckpoint(
  database: ReturnType<typeof createSqliteDatabase>,
  value: LearningCheckpointRecord,
): void {
  database.$client
    .prepare(
      `INSERT INTO learning_checkpoints (
        id, goal_id, title, description, status, required, sequence, weight,
        completion_mode, numeric_unit, numeric_target, accepted_value,
        due_date, created_at, updated_at, version
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      value.id,
      value.goalId,
      value.title,
      value.description,
      value.status,
      value.required ? 1 : 0,
      value.sequence,
      value.weight,
      "binary",
      null,
      null,
      null,
      value.dueDate,
      value.createdAt,
      value.updatedAt,
      value.version,
    );
}

describe("SqliteLearningCheckpointRepository stale reorder", () => {
  it("reaches the snapshot conflict and leaves every checkpoint unchanged", async () => {
    const database = createSqliteDatabase(":memory:");
    databases.push(database);
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
        "goal-1",
        "Goal 1",
        "",
        null,
        "active",
        "medium",
        null,
        "2026-08-04T00:00:00.000Z",
        "2026-08-04T00:00:00.000Z",
        1,
      );

    const first = checkpoint("checkpoint-1", 1);
    const second = checkpoint("checkpoint-2", 2);
    insertCheckpoint(database, first);
    insertCheckpoint(database, second);

    const staleSecond = checkpoint("checkpoint-2", 2, 99);
    const desired = [
      {
        ...staleSecond,
        sequence: 1,
        version: 100,
        updatedAt: "2026-08-04T00:01:00.000Z",
      },
      {
        ...first,
        sequence: 2,
        version: 2,
        updatedAt: "2026-08-04T00:01:00.000Z",
      },
    ];
    const goal: LearningGoalAggregate = {
      id: "goal-1",
      ownerId: "owner-1",
      slug: "goal-1",
      title: "Goal 1",
      description: "",
      motivation: null,
      status: "active",
      priority: "medium",
      targetDate: null,
      createdAt: "2026-08-04T00:00:00.000Z",
      updatedAt: "2026-08-04T00:00:00.000Z",
      version: 1,
      checkpoints: [first, staleSecond],
      skills: [],
    };
    const input: ReorderLearningCheckpointsRecord = {
      goal,
      before: [first, staleSecond],
      after: desired,
      event: {
        id: "reorder-event-stale",
        aggregateType: "learning_goal",
        aggregateId: goal.id,
        sequence: 2,
        action: "learning_checkpoint.reorder",
        before: [first, staleSecond],
        after: desired,
        reason: "Reorder with a stale snapshot",
        actorId: "owner-1",
        occurredAt: "2026-08-04T00:01:00.000Z",
        correlationId: "correlation-stale-reorder",
        idempotencyKey: "idempotency-stale-reorder",
      },
      context: {
        ownerId: "owner-1",
        actorId: "owner-1",
        correlationId: "correlation-stale-reorder",
        idempotencyKey: "idempotency-stale-reorder",
      },
    };

    const repository = new SqliteLearningCheckpointRepository(database);
    await expect(repository.reorder(input)).resolves.toEqual({
      kind: "conflict",
    });
    expect(
      database.$client
        .prepare(
          `SELECT id, sequence, version
           FROM learning_checkpoints
           ORDER BY sequence ASC`,
        )
        .all(),
    ).toEqual([
      { id: "checkpoint-1", sequence: 1, version: 1 },
      { id: "checkpoint-2", sequence: 2, version: 1 },
    ]);
    expect(
      database.$client
        .prepare(
          `SELECT COUNT(*) AS count
           FROM learning_checkpoint_events
           WHERE action = 'learning_checkpoint.reorder'`,
        )
        .get(),
    ).toEqual({ count: 0 });
  });
});
