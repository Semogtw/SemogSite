import type {
  AddLearningCheckpointRecord,
  LearningCheckpointRecord,
  LearningGoalAggregate,
  ReorderLearningCheckpointsRecord,
  UpdateLearningCheckpointRecord,
} from "@semogtw/domain/growth";
import { afterEach, describe, expect, it } from "vitest";
import { createSqliteDatabase, migrate } from "../adapters/sqlite";
import { SqliteLearningGoalRepository } from "./learning-goal-repository";
import { SqliteLearningCheckpointRepository } from "./learning-checkpoint-repository";

const databases: ReturnType<typeof createSqliteDatabase>[] = [];

afterEach(() => {
  for (const database of databases.splice(0)) database.$client.close();
});

async function createHarness() {
  const database = createSqliteDatabase(":memory:");
  databases.push(database);
  migrate(database);
  const goalRepository = new SqliteLearningGoalRepository(database);
  const created = await goalRepository.create({
    goal: {
      id: "goal-1",
      ownerId: "owner-1",
      slug: "aprender-python",
      title: "Aprender Python",
      description: "",
      motivation: null,
      status: "active",
      priority: "medium",
      targetDate: null,
      createdAt: "2026-08-04T00:00:00.000Z",
      updatedAt: "2026-08-04T00:00:00.000Z",
      version: 1,
    },
    event: {
      id: "goal-event-1",
      aggregateType: "learning_goal",
      aggregateId: "goal-1",
      sequence: 1,
      action: "learning_goal.create_draft",
      before: null,
      after: {
        id: "goal-1",
        ownerId: "owner-1",
        slug: "aprender-python",
        title: "Aprender Python",
        description: "",
        motivation: null,
        status: "active",
        priority: "medium",
        targetDate: null,
        createdAt: "2026-08-04T00:00:00.000Z",
        updatedAt: "2026-08-04T00:00:00.000Z",
        version: 1,
      },
      reason: "Create",
      actorId: "owner-1",
      occurredAt: "2026-08-04T00:00:00.000Z",
      correlationId: "correlation-goal",
      idempotencyKey: "idempotency-goal",
    },
    context: {
      ownerId: "owner-1",
      actorId: "owner-1",
      correlationId: "correlation-goal",
      idempotencyKey: "idempotency-goal",
    },
  });
  if (created.kind === "conflict") throw new Error("goal create conflict");
  return {
    database,
    goalRepository,
    repository: new SqliteLearningCheckpointRepository(database),
    goal: created.value,
  };
}

function checkpoint(
  id: string,
  sequence: number,
  overrides: Partial<LearningCheckpointRecord> = {},
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
    createdAt: "2026-08-04T00:01:00.000Z",
    updatedAt: "2026-08-04T00:01:00.000Z",
    version: 1,
    ...overrides,
  };
}

function addInput(
  goal: LearningGoalAggregate,
  value: LearningCheckpointRecord,
  key: string,
): AddLearningCheckpointRecord {
  return {
    goal,
    checkpoint: value,
    event: {
      id: `event-${value.id}`,
      aggregateType: "learning_checkpoint",
      aggregateId: value.id,
      sequence: 1,
      action: "learning_checkpoint.add",
      before: null,
      after: value,
      reason: "Add checkpoint",
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

describe("SqliteLearningCheckpointRepository", () => {
  it("adds checkpoint, event and audit atomically", async () => {
    const { database, repository, goal } = await createHarness();
    const result = await repository.add(
      addInput(goal, checkpoint("checkpoint-1", 1), "checkpoint-add-1"),
    );

    expect(result).toMatchObject({
      kind: "applied",
      value: { id: "checkpoint-1", sequence: 1 },
    });
    expect(
      database.$client
        .prepare("SELECT COUNT(*) AS count FROM learning_checkpoint_events")
        .get(),
    ).toEqual({ count: 1 });
    expect(
      database.$client
        .prepare(
          "SELECT COUNT(*) AS count FROM audit_events WHERE entity_type = 'learning_checkpoint'",
        )
        .get(),
    ).toEqual({ count: 1 });
  });

  it("replays semantic add despite regenerated IDs and rejects changed payload", async () => {
    const { repository, goal } = await createHarness();
    await repository.add(
      addInput(goal, checkpoint("checkpoint-1", 1), "checkpoint-add-1"),
    );

    const retry = checkpoint("checkpoint-regenerated", 1, {
      createdAt: "2026-08-04T00:01:05.000Z",
      updatedAt: "2026-08-04T00:01:05.000Z",
    });
    await expect(
      repository.add(addInput(goal, retry, "checkpoint-add-1")),
    ).resolves.toMatchObject({
      kind: "idempotent",
      value: { id: "checkpoint-1" },
    });

    await expect(
      repository.add(
        addInput(
          goal,
          checkpoint("checkpoint-other", 1, { title: "Outro conteúdo" }),
          "checkpoint-add-1",
        ),
      ),
    ).resolves.toEqual({ kind: "conflict" });
  });

  it("updates with optimistic concurrency and exact replay", async () => {
    const { repository, goal } = await createHarness();
    const before = checkpoint("checkpoint-1", 1);
    await repository.add(addInput(goal, before, "checkpoint-add-1"));
    const after = checkpoint("checkpoint-1", 1, {
      status: "in_progress",
      updatedAt: "2026-08-04T00:02:00.000Z",
      version: 2,
    });
    const input: UpdateLearningCheckpointRecord = {
      goal: { ...goal, checkpoints: [before] },
      before,
      after,
      event: {
        id: "checkpoint-event-2",
        aggregateType: "learning_checkpoint",
        aggregateId: before.id,
        sequence: 2,
        action: "learning_checkpoint.start",
        before,
        after,
        reason: "Start",
        actorId: "owner-1",
        occurredAt: after.updatedAt,
        correlationId: "correlation-update",
        idempotencyKey: "checkpoint-update-1",
      },
      context: {
        ownerId: "owner-1",
        actorId: "owner-1",
        correlationId: "correlation-update",
        idempotencyKey: "checkpoint-update-1",
      },
    };

    await expect(repository.update(input)).resolves.toMatchObject({
      kind: "applied",
      value: { status: "in_progress", version: 2 },
    });
    await expect(repository.update(input)).resolves.toMatchObject({
      kind: "idempotent",
      value: { status: "in_progress", version: 2 },
    });
  });

  it("reorders all checkpoints atomically and replays by desired order", async () => {
    const { database, repository, goal } = await createHarness();
    const first = checkpoint("checkpoint-1", 1);
    const second = checkpoint("checkpoint-2", 2);
    await repository.add(addInput(goal, first, "checkpoint-add-1"));
    await repository.add(addInput(goal, second, "checkpoint-add-2"));

    const after = [
      { ...second, sequence: 1, version: 2, updatedAt: "2026-08-04T00:03:00.000Z" },
      { ...first, sequence: 2, version: 2, updatedAt: "2026-08-04T00:03:00.000Z" },
    ];
    const input: ReorderLearningCheckpointsRecord = {
      goal: { ...goal, checkpoints: [first, second] },
      before: [first, second],
      after,
      event: {
        id: "checkpoint-reorder-event",
        aggregateType: "learning_goal",
        aggregateId: "goal-1",
        sequence: 2,
        action: "learning_checkpoint.reorder",
        before: [first, second],
        after,
        reason: "Reorder",
        actorId: "owner-1",
        occurredAt: "2026-08-04T00:03:00.000Z",
        correlationId: "correlation-reorder",
        idempotencyKey: "checkpoint-reorder-1",
      },
      context: {
        ownerId: "owner-1",
        actorId: "owner-1",
        correlationId: "correlation-reorder",
        idempotencyKey: "checkpoint-reorder-1",
      },
    };

    await expect(repository.reorder(input)).resolves.toMatchObject({
      kind: "applied",
      value: [
        { id: "checkpoint-2", sequence: 1 },
        { id: "checkpoint-1", sequence: 2 },
      ],
    });
    expect(
      database.$client
        .prepare(
          "SELECT id, sequence FROM learning_checkpoints ORDER BY sequence ASC",
        )
        .all(),
    ).toEqual([
      { id: "checkpoint-2", sequence: 1 },
      { id: "checkpoint-1", sequence: 2 },
    ]);
    expect(
      database.$client
        .prepare(
          "SELECT COUNT(*) AS count FROM learning_checkpoint_events WHERE action = 'learning_checkpoint.reorder'",
        )
        .get(),
    ).toEqual({ count: 2 });
    await expect(repository.reorder(input)).resolves.toMatchObject({
      kind: "idempotent",
    });
  });

  it("rolls back an entire reorder when one expected version is stale", async () => {
    const { database, repository, goal } = await createHarness();
    const first = checkpoint("checkpoint-1", 1);
    const second = checkpoint("checkpoint-2", 2);
    await repository.add(addInput(goal, first, "checkpoint-add-1"));
    await repository.add(addInput(goal, second, "checkpoint-add-2"));

    const staleBefore = { ...second, version: 99 };
    const input: ReorderLearningCheckpointsRecord = {
      goal: { ...goal, checkpoints: [first, second] },
      before: [first, staleBefore],
      after: [
        { ...staleBefore, sequence: 1, version: 100 },
        { ...first, sequence: 2, version: 2 },
      ],
      event: {
        id: "stale-reorder",
        aggregateType: "learning_goal",
        aggregateId: "goal-1",
        sequence: 2,
        action: "learning_checkpoint.reorder",
        before: [first, staleBefore],
        after: [],
        reason: "Stale",
        actorId: "owner-1",
        occurredAt: "2026-08-04T00:04:00.000Z",
        correlationId: "correlation-stale",
        idempotencyKey: "checkpoint-reorder-stale",
      },
      context: {
        ownerId: "owner-1",
        actorId: "owner-1",
        correlationId: "correlation-stale",
        idempotencyKey: "checkpoint-reorder-stale",
      },
    };

    await expect(repository.reorder(input)).resolves.toEqual({
      kind: "conflict",
    });
    expect(
      database.$client
        .prepare(
          "SELECT id, sequence, version FROM learning_checkpoints ORDER BY sequence ASC",
        )
        .all(),
    ).toEqual([
      { id: "checkpoint-1", sequence: 1, version: 1 },
      { id: "checkpoint-2", sequence: 2, version: 1 },
    ]);
  });
});
