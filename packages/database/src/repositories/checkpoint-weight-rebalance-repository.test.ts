import { afterEach, describe, expect, it } from "vitest";
import type {
  ApplyCheckpointWeightRebalanceRecord,
  CheckpointWeightSnapshot,
} from "@semogtw/domain/growth";
import { createSqliteDatabase, migrate } from "../adapters/sqlite";
import { SqliteCheckpointWeightRebalanceRepository } from "./checkpoint-weight-rebalance-repository";

const databases: ReturnType<typeof createSqliteDatabase>[] = [];

afterEach(() => {
  for (const database of databases.splice(0)) database.$client.close();
});

function harness() {
  const database = createSqliteDatabase(":memory:");
  databases.push(database);
  migrate(database);
  database.$client.prepare(
    `INSERT INTO learning_goals (
      id, owner_id, slug, title, description, motivation, status, priority,
      target_date, created_at, updated_at, version
    ) VALUES ('goal-1', 'owner-1', 'goal', 'Goal', '', NULL, 'active',
      'medium', NULL, '2026-08-04T00:00:00.000Z',
      '2026-08-04T00:00:00.000Z', 3)`,
  ).run();
  const insert = database.$client.prepare(
    `INSERT INTO learning_checkpoints (
      id, goal_id, title, description, status, required, sequence, weight,
      weight_mode, completion_mode, numeric_unit, numeric_target,
      accepted_value, due_date, created_at, updated_at, version
    ) VALUES (?, 'goal-1', ?, '', 'pending', 1, ?, ?, ?, 'binary',
      NULL, NULL, NULL, NULL, '2026-08-04T00:00:00.000Z',
      '2026-08-04T00:00:00.000Z', ?)`,
  );
  insert.run("a", "A", 1, 100, "custom", 2);
  insert.run("b", "B", 2, 50, "automatic", 1);
  database.$client.prepare(
    `INSERT INTO learning_checkpoint_events (
      id, checkpoint_id, sequence, action, before_json, after_json, reason,
      actor_id, occurred_at, correlation_id, idempotency_key
    ) VALUES (?, ?, 1, 'learning_checkpoint.add', NULL, ?, 'Seed',
      'owner-1', '2026-08-04T00:00:00.000Z', ?, ?)`,
  ).run("seed-a", "a", JSON.stringify({ id: "a" }), "seed-a", "seed-a");
  database.$client.prepare(
    `INSERT INTO learning_checkpoint_events (
      id, checkpoint_id, sequence, action, before_json, after_json, reason,
      actor_id, occurred_at, correlation_id, idempotency_key
    ) VALUES (?, ?, 1, 'learning_checkpoint.add', NULL, ?, 'Seed',
      'owner-1', '2026-08-04T00:00:00.000Z', ?, ?)`,
  ).run("seed-b", "b", JSON.stringify({ id: "b" }), "seed-b", "seed-b");
  return {
    database,
    repository: new SqliteCheckpointWeightRebalanceRepository(database),
  };
}

function record(before: CheckpointWeightSnapshot): ApplyCheckpointWeightRebalanceRecord {
  const after = {
    ...before,
    checkpoints: before.checkpoints.map((checkpoint) => ({
      ...checkpoint,
      weight: 50,
      version: checkpoint.version + 1,
      updatedAt: "2026-08-04T01:00:00.000Z",
    })),
  };
  return {
    before,
    after,
    proposal: {
      checkpoints: before.checkpoints.map((checkpoint) => ({
        id: checkpoint.id,
        before: checkpoint.weight,
        after: 50,
        weightMode: checkpoint.weightMode,
      })),
      total: 100,
      requiresConfirmation: true,
      reason: "custom_weights_need_rebalance",
    },
    reason: "Redistribuir pesos",
    occurredAt: "2026-08-04T01:00:00.000Z",
    context: {
      ownerId: "owner-1",
      actorId: "owner-1",
      correlationId: "correlation-1",
      idempotencyKey: "rebalance-1",
    },
  };
}

describe("SqliteCheckpointWeightRebalanceRepository", () => {
  it("loads owner-scoped modes and applies all updates atomically", async () => {
    const { database, repository } = harness();
    const before = await repository.getSnapshot("owner-1", "goal-1");
    expect(before).not.toBeNull();
    expect(before?.checkpoints).toMatchObject([
      { id: "a", weightMode: "custom", version: 2 },
      { id: "b", weightMode: "automatic", version: 1 },
    ]);

    await expect(repository.apply(record(before!))).resolves.toMatchObject({
      kind: "applied",
      value: { checkpoints: [{ weight: 50 }, { weight: 50 }] },
    });
    expect(
      database.$client.prepare(
        "SELECT id, weight, weight_mode, version FROM learning_checkpoints ORDER BY sequence",
      ).all(),
    ).toEqual([
      { id: "a", weight: 50, weight_mode: "custom", version: 3 },
      { id: "b", weight: 50, weight_mode: "automatic", version: 2 },
    ]);
    expect(database.$client.prepare(
      "SELECT COUNT(*) AS count FROM learning_checkpoint_events WHERE action = 'learning_checkpoint.rebalance_weights'",
    ).get()).toEqual({ count: 2 });
    expect(database.$client.prepare(
      "SELECT COUNT(*) AS count FROM audit_events WHERE action = 'learning_checkpoint.rebalance_weights'",
    ).get()).toEqual({ count: 1 });
  });

  it("replays the same semantic request and rejects stale snapshots", async () => {
    const { repository } = harness();
    const before = await repository.getSnapshot("owner-1", "goal-1");
    const input = record(before!);
    await repository.apply(input);
    await expect(repository.findReplay({
      ownerId: "owner-1",
      goalId: "goal-1",
      expectedGoalVersion: 3,
      expectedCheckpointVersions: [
        { id: "a", version: 2 },
        { id: "b", version: 1 },
      ],
      reason: "Redistribuir pesos",
      context: input.context,
    })).resolves.toMatchObject({ kind: "idempotent" });
    await expect(repository.apply(input)).resolves.toMatchObject({ kind: "idempotent" });
    await expect(repository.apply({
      ...input,
      before: {
        ...input.before,
        checkpoints: input.before.checkpoints.map((item) =>
          item.id === "a" ? { ...item, version: 99 } : item,
        ),
      },
    })).resolves.toEqual({ kind: "conflict" });
  });
});
