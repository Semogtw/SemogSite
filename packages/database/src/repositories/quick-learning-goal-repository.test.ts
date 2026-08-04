import type {
  QuickCreateLearningGoalPersistence,
  QuickLearningGoalRepository,
} from "@semogtw/domain/growth";
import { afterEach, describe, expect, it } from "vitest";
import { createSqliteDatabase, migrate } from "../adapters/sqlite";
import { SqliteQuickLearningGoalRepository } from "./quick-learning-goal-repository";

const databases: ReturnType<typeof createSqliteDatabase>[] = [];

afterEach(() => {
  for (const database of databases.splice(0)) database.$client.close();
});

function createHarness() {
  const database = createSqliteDatabase(":memory:");
  databases.push(database);
  migrate(database);
  const repository: QuickLearningGoalRepository =
    new SqliteQuickLearningGoalRepository(database);
  return { database, repository };
}

function persistenceInput(input?: {
  goalId?: string;
  eventId?: string;
  title?: string;
  occurredAt?: string;
  origin?: QuickCreateLearningGoalPersistence["origin"];
}): QuickCreateLearningGoalPersistence {
  const goalId = input?.goalId ?? "goal-1";
  const eventId = input?.eventId ?? "goal-event-1";
  const occurredAt = input?.occurredAt ?? "2026-08-04T03:00:00.000Z";
  const title = input?.title ?? "Aprender Python";
  const origin = input?.origin ?? {
    kind: "template" as const,
    templateId: "learn_programming_language" as const,
    templateVersion: 1 as const,
  };
  const goal = {
    id: goalId,
    ownerId: "owner-1",
    slug: title === "Aprender Rust" ? "aprender-rust" : "aprender-python",
    title,
    description: "",
    motivation: null,
    status: "draft" as const,
    priority: "medium" as const,
    targetDate: null,
    createdAt: occurredAt,
    updatedAt: occurredAt,
    version: 1,
  };
  const checkpoints = [
    {
      id: `${goalId}-checkpoint-1`,
      goalId,
      title: "Fundamentos",
      description: "",
      status: "pending" as const,
      required: true,
      sequence: 1,
      weight: 50,
      weightMode: "automatic" as const,
      completionMode: { kind: "binary" as const },
      acceptedValue: null,
      dueDate: null,
      createdAt: occurredAt,
      updatedAt: occurredAt,
      version: 1,
    },
    {
      id: `${goalId}-checkpoint-2`,
      goalId,
      title: "Projeto aplicado",
      description: "",
      status: "pending" as const,
      required: true,
      sequence: 2,
      weight: 50,
      weightMode: "automatic" as const,
      completionMode: { kind: "binary" as const },
      acceptedValue: null,
      dueDate: null,
      createdAt: occurredAt,
      updatedAt: occurredAt,
      version: 1,
    },
  ];
  const reason =
    origin.kind === "manual"
      ? "Create learning goal manually"
      : `Create learning goal from template ${origin.templateId}@${origin.templateVersion}`;
  return {
    goal,
    checkpoints,
    origin,
    goalEvent: {
      id: eventId,
      aggregateType: "learning_goal",
      aggregateId: goalId,
      sequence: 1,
      action: "learning_goal.quick_create",
      before: null,
      after: goal,
      reason,
      actorId: "owner-1",
      occurredAt,
      correlationId: "correlation-1",
      idempotencyKey: "idempotency-1",
    },
    checkpointEvents: checkpoints.map((checkpoint, index) => ({
      id: `${eventId}-checkpoint-${index + 1}`,
      aggregateType: "learning_checkpoint" as const,
      aggregateId: checkpoint.id,
      sequence: 1,
      action: "learning_checkpoint.template_add",
      before: null,
      after: checkpoint,
      reason: `${reason}; checkpoint ${index + 1}`,
      actorId: "owner-1",
      occurredAt,
      correlationId: "correlation-1",
      idempotencyKey: "idempotency-1",
    })),
    context: {
      ownerId: "owner-1",
      actorId: "owner-1",
      correlationId: "correlation-1",
      idempotencyKey: "idempotency-1",
    },
  };
}

describe("SqliteQuickLearningGoalRepository", () => {
  it("persists goal, checkpoints, events and audit atomically", async () => {
    const { database, repository } = createHarness();
    const result = await repository.create(persistenceInput());

    expect(result).toMatchObject({
      kind: "applied",
      value: {
        id: "goal-1",
        checkpoints: [
          { sequence: 1, weightMode: "automatic" },
          { sequence: 2, weightMode: "automatic" },
        ],
      },
    });
    expect(
      database.$client.prepare("SELECT COUNT(*) AS count FROM learning_goals").get(),
    ).toEqual({ count: 1 });
    expect(
      database.$client
        .prepare("SELECT COUNT(*) AS count FROM learning_checkpoints")
        .get(),
    ).toEqual({ count: 2 });
    expect(
      database.$client
        .prepare("SELECT COUNT(*) AS count FROM learning_goal_events")
        .get(),
    ).toEqual({ count: 1 });
    expect(
      database.$client
        .prepare("SELECT COUNT(*) AS count FROM learning_checkpoint_events")
        .get(),
    ).toEqual({ count: 2 });
    const audit = database.$client
      .prepare(
        "SELECT action, after_json FROM audit_events WHERE entity_type = 'learning_goal'",
      )
      .get() as { action: string; after_json: string };
    expect(audit.action).toBe("learning_goal.quick_create");
    expect(JSON.parse(audit.after_json)).toMatchObject({
      origin: {
        kind: "template",
        templateId: "learn_programming_language",
        templateVersion: 1,
      },
      checkpoints: [
        { title: "Fundamentos", weightMode: "automatic" },
        { title: "Projeto aplicado", weightMode: "automatic" },
      ],
    });
  });

  it("replays the first aggregate despite regenerated IDs and timestamps", async () => {
    const { repository } = createHarness();
    await repository.create(persistenceInput());

    await expect(
      repository.create(
        persistenceInput({
          goalId: "goal-regenerated",
          eventId: "event-regenerated",
          occurredAt: "2026-08-04T03:00:05.000Z",
        }),
      ),
    ).resolves.toMatchObject({
      kind: "idempotent",
      value: {
        id: "goal-1",
        checkpoints: [
          { id: "goal-1-checkpoint-1", weightMode: "automatic" },
        ],
      },
    });
  });

  it("conflicts when the same key is reused with different semantics", async () => {
    const { repository } = createHarness();
    await repository.create(persistenceInput());

    await expect(
      repository.create(persistenceInput({ title: "Aprender Rust" })),
    ).resolves.toEqual({ kind: "conflict" });
  });

  it("rolls back every row when the aggregate audit cannot be inserted", async () => {
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

    await expect(repository.create(persistenceInput())).rejects.toThrow();
    expect(
      database.$client.prepare("SELECT COUNT(*) AS count FROM learning_goals").get(),
    ).toEqual({ count: 0 });
    expect(
      database.$client
        .prepare("SELECT COUNT(*) AS count FROM learning_checkpoints")
        .get(),
    ).toEqual({ count: 0 });
    expect(
      database.$client
        .prepare("SELECT COUNT(*) AS count FROM learning_goal_events")
        .get(),
    ).toEqual({ count: 0 });
    expect(
      database.$client
        .prepare("SELECT COUNT(*) AS count FROM learning_checkpoint_events")
        .get(),
    ).toEqual({ count: 0 });
  });

  it("rejects mismatched event bindings before mutation", async () => {
    const { database, repository } = createHarness();
    const input = persistenceInput();
    input.checkpointEvents[0]!.aggregateId = "different";

    await expect(repository.create(input)).resolves.toEqual({ kind: "conflict" });
    expect(
      database.$client.prepare("SELECT COUNT(*) AS count FROM learning_goals").get(),
    ).toEqual({ count: 0 });
  });
});
