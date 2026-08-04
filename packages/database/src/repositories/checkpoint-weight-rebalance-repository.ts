import type {
  ApplyCheckpointWeightRebalanceRecord,
  CheckpointWeightReplayRequest,
  CheckpointWeightRebalanceRepository,
  CheckpointWeightSnapshot,
  CheckpointWeightSnapshotItem,
  GrowthWriteResult,
  LearningGoalStatus,
} from "@semogtw/domain/growth";
import type { SqliteDatabase } from "../adapters/sqlite";

type GoalRow = {
  id: string;
  owner_id: string;
  status: LearningGoalStatus;
  version: number;
  updated_at: string;
};

type CheckpointRow = {
  id: string;
  sequence: number;
  weight: number;
  weight_mode: "automatic" | "custom";
  version: number;
  updated_at: string;
};

type ReplayRow = {
  checkpoint_id: string;
  before_json: string;
  after_json: string;
  reason: string;
};

function item(row: CheckpointRow): CheckpointWeightSnapshotItem {
  return {
    id: row.id,
    sequence: row.sequence,
    weight: row.weight,
    weightMode: row.weight_mode,
    version: row.version,
    updatedAt: row.updated_at,
  };
}

function sameItem(
  left: CheckpointWeightSnapshotItem,
  right: CheckpointWeightSnapshotItem,
): boolean {
  return (
    left.id === right.id &&
    left.sequence === right.sequence &&
    left.weight === right.weight &&
    left.weightMode === right.weightMode &&
    left.version === right.version &&
    left.updatedAt === right.updatedAt
  );
}

function sameSnapshot(
  left: CheckpointWeightSnapshot,
  right: CheckpointWeightSnapshot,
): boolean {
  return (
    left.goalId === right.goalId &&
    left.ownerId === right.ownerId &&
    left.goalStatus === right.goalStatus &&
    left.goalVersion === right.goalVersion &&
    left.goalUpdatedAt === right.goalUpdatedAt &&
    left.checkpoints.length === right.checkpoints.length &&
    left.checkpoints.every((checkpoint, index) =>
      sameItem(checkpoint, right.checkpoints[index]!),
    )
  );
}

function parseItem(value: string): CheckpointWeightSnapshotItem | null {
  try {
    const parsed = JSON.parse(value) as Partial<CheckpointWeightSnapshotItem>;
    if (
      typeof parsed.id !== "string" ||
      typeof parsed.sequence !== "number" ||
      typeof parsed.weight !== "number" ||
      (parsed.weightMode !== "automatic" && parsed.weightMode !== "custom") ||
      typeof parsed.version !== "number" ||
      typeof parsed.updatedAt !== "string"
    ) {
      return null;
    }
    return parsed as CheckpointWeightSnapshotItem;
  } catch {
    return null;
  }
}

function bindingsValid(input: ApplyCheckpointWeightRebalanceRecord): boolean {
  if (
    input.before.ownerId !== input.context.ownerId ||
    input.after.ownerId !== input.context.ownerId ||
    input.before.goalId !== input.after.goalId ||
    input.before.goalVersion !== input.after.goalVersion ||
    input.before.goalUpdatedAt !== input.after.goalUpdatedAt ||
    input.before.checkpoints.length === 0 ||
    input.before.checkpoints.length !== input.after.checkpoints.length ||
    input.proposal.total !== 100 ||
    input.proposal.checkpoints.length !== input.after.checkpoints.length
  ) {
    return false;
  }
  const proposal = new Map(
    input.proposal.checkpoints.map((checkpoint) => [checkpoint.id, checkpoint]),
  );
  return input.before.checkpoints.every((before, index) => {
    const after = input.after.checkpoints[index];
    const proposed = proposal.get(before.id);
    return (
      after !== undefined &&
      proposed !== undefined &&
      after.id === before.id &&
      after.sequence === before.sequence &&
      after.version === before.version + 1 &&
      after.updatedAt === input.occurredAt &&
      after.weight === proposed.after &&
      after.weightMode === proposed.weightMode &&
      proposed.before === before.weight
    );
  });
}

export class SqliteCheckpointWeightRebalanceRepository
  implements CheckpointWeightRebalanceRepository
{
  constructor(private readonly database: SqliteDatabase) {}

  async getSnapshot(
    ownerId: string,
    goalId: string,
  ): Promise<CheckpointWeightSnapshot | null> {
    return this.getSnapshotSync(ownerId, goalId);
  }

  async findReplay(
    input: CheckpointWeightReplayRequest,
  ): Promise<GrowthWriteResult<CheckpointWeightSnapshot> | null> {
    return this.findReplaySync(input);
  }

  async apply(
    input: ApplyCheckpointWeightRebalanceRecord,
  ): Promise<GrowthWriteResult<CheckpointWeightSnapshot>> {
    if (!bindingsValid(input)) return { kind: "conflict" };
    const transaction = this.database.$client.transaction(() => {
      const replay = this.findReplaySync({
        ownerId: input.context.ownerId,
        goalId: input.before.goalId,
        expectedGoalVersion: input.before.goalVersion,
        expectedCheckpointVersions: input.before.checkpoints.map(
          ({ id, version }) => ({ id, version }),
        ),
        reason: input.reason,
        context: input.context,
      });
      if (replay !== null) return replay;

      const current = this.getSnapshotSync(
        input.context.ownerId,
        input.before.goalId,
      );
      if (current === null || !sameSnapshot(current, input.before)) {
        return { kind: "conflict" } as const;
      }

      for (let index = 0; index < input.before.checkpoints.length; index += 1) {
        const before = input.before.checkpoints[index]!;
        const after = input.after.checkpoints[index]!;
        const result = this.database.$client
          .prepare(
            `UPDATE learning_checkpoints
             SET weight = ?, weight_mode = ?, updated_at = ?, version = ?
             WHERE id = ? AND goal_id = ? AND weight = ? AND weight_mode = ?
               AND version = ? AND updated_at = ?`,
          )
          .run(
            after.weight,
            after.weightMode,
            after.updatedAt,
            after.version,
            before.id,
            input.before.goalId,
            before.weight,
            before.weightMode,
            before.version,
            before.updatedAt,
          );
        if (result.changes !== 1) {
          throw new Error("CHECKPOINT_WEIGHT_REBALANCE_CONFLICT");
        }
        this.database.$client
          .prepare(
            `INSERT INTO learning_checkpoint_events (
              id, checkpoint_id, sequence, action, before_json, after_json,
              reason, actor_id, occurred_at, correlation_id, idempotency_key
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(
            `${input.context.correlationId}:weight:${after.id}`,
            after.id,
            after.version,
            "learning_checkpoint.rebalance_weights",
            JSON.stringify(before),
            JSON.stringify(after),
            input.reason,
            input.context.actorId,
            input.occurredAt,
            input.context.correlationId,
            input.context.idempotencyKey,
          );
      }

      this.database.$client
        .prepare(
          `INSERT INTO audit_events (
            id, actor, action, entity_type, entity_id, before_json, after_json,
            reason, occurred_at, source, confirmed, correlation_id
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          `${input.context.correlationId}:growth-weight-rebalance`,
          input.context.actorId,
          "learning_checkpoint.rebalance_weights",
          "learning_goal",
          input.before.goalId,
          JSON.stringify(input.before),
          JSON.stringify(input.after),
          input.reason,
          input.occurredAt,
          "manual",
          input.proposal.requiresConfirmation ? 1 : 0,
          input.context.correlationId,
        );

      return { kind: "applied", value: input.after } as const;
    });

    try {
      return transaction.immediate();
    } catch (error) {
      if (
        error instanceof Error &&
        (error.message === "CHECKPOINT_WEIGHT_REBALANCE_CONFLICT" ||
          error.message.includes("UNIQUE constraint failed"))
      ) {
        return { kind: "conflict" };
      }
      throw error;
    }
  }

  private getSnapshotSync(
    ownerId: string,
    goalId: string,
  ): CheckpointWeightSnapshot | null {
    const goal = this.database.$client
      .prepare(
        `SELECT id, owner_id, status, version, updated_at
         FROM learning_goals
         WHERE id = ? AND owner_id = ?`,
      )
      .get(goalId, ownerId) as GoalRow | undefined;
    if (goal === undefined) return null;
    const checkpoints = this.database.$client
      .prepare(
        `SELECT id, sequence, weight, weight_mode, version, updated_at
         FROM learning_checkpoints
         WHERE goal_id = ?
         ORDER BY sequence ASC, id ASC`,
      )
      .all(goalId) as CheckpointRow[];
    return {
      goalId: goal.id,
      ownerId: goal.owner_id,
      goalStatus: goal.status,
      goalVersion: goal.version,
      goalUpdatedAt: goal.updated_at,
      checkpoints: checkpoints.map(item),
    };
  }

  private findReplaySync(
    input: CheckpointWeightReplayRequest,
  ): GrowthWriteResult<CheckpointWeightSnapshot> | null {
    const rows = this.database.$client
      .prepare(
        `SELECT e.checkpoint_id, e.before_json, e.after_json, e.reason
         FROM learning_checkpoint_events e
         JOIN learning_checkpoints c ON c.id = e.checkpoint_id
         JOIN learning_goals g ON g.id = c.goal_id
         WHERE g.id = ? AND g.owner_id = ? AND e.actor_id = ?
           AND e.idempotency_key = ?
           AND e.action = 'learning_checkpoint.rebalance_weights'
         ORDER BY c.sequence ASC, c.id ASC`,
      )
      .all(
        input.goalId,
        input.ownerId,
        input.context.actorId,
        input.context.idempotencyKey,
      ) as ReplayRow[];
    if (rows.length === 0) return null;
    if (
      rows.some((row) => row.reason !== input.reason) ||
      rows.length !== input.expectedCheckpointVersions.length
    ) {
      return { kind: "conflict" };
    }

    const expected = new Map(
      input.expectedCheckpointVersions.map((entry) => [entry.id, entry.version]),
    );
    const storedAfter: CheckpointWeightSnapshotItem[] = [];
    for (const row of rows) {
      const before = parseItem(row.before_json);
      const after = parseItem(row.after_json);
      if (
        before === null ||
        after === null ||
        before.id !== row.checkpoint_id ||
        after.id !== row.checkpoint_id ||
        expected.get(before.id) !== before.version
      ) {
        return { kind: "conflict" };
      }
      storedAfter.push(after);
    }

    const current = this.getSnapshotSync(input.ownerId, input.goalId);
    if (
      current === null ||
      current.goalVersion !== input.expectedGoalVersion ||
      current.checkpoints.length !== storedAfter.length ||
      current.checkpoints.some(
        (checkpoint, index) => !sameItem(checkpoint, storedAfter[index]!),
      )
    ) {
      return { kind: "conflict" };
    }
    return { kind: "idempotent", value: current };
  }
}
