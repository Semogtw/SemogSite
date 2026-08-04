import type {
  AddLearningCheckpointRecord,
  GrowthWriteResult,
  LearningCheckpointRecord,
  LearningCheckpointRepository,
  ReorderLearningCheckpointsRecord,
  UpdateLearningCheckpointRecord,
} from "@semogtw/domain/growth";
import type { SqliteDatabase } from "../adapters/sqlite";

type CheckpointRow = {
  id: string;
  goal_id: string;
  title: string;
  description: string;
  status: LearningCheckpointRecord["status"];
  required: number;
  sequence: number;
  weight: number;
  completion_mode: "binary" | "numeric";
  numeric_unit: string | null;
  numeric_target: number | null;
  accepted_value: number | null;
  due_date: string | null;
  created_at: string;
  updated_at: string;
  version: number;
};

type StoredCheckpointEvent = {
  id: string;
  checkpoint_id: string;
  sequence: number;
  action: string;
  before_json: string | null;
  after_json: string;
  reason: string;
  actor_id: string;
  occurred_at: string;
  correlation_id: string;
  idempotency_key: string;
};

function toCheckpoint(row: CheckpointRow): LearningCheckpointRecord {
  const completionMode =
    row.completion_mode === "binary"
      ? ({ kind: "binary" } as const)
      : row.numeric_unit !== null && row.numeric_target !== null
        ? ({
            kind: "numeric",
            unit: row.numeric_unit,
            target: row.numeric_target,
          } as const)
        : null;
  if (completionMode === null) throw new Error("GROWTH_CHECKPOINT_ROW_INVALID");
  return {
    id: row.id,
    goalId: row.goal_id,
    title: row.title,
    description: row.description,
    status: row.status,
    required: row.required === 1,
    sequence: row.sequence,
    weight: row.weight,
    completionMode,
    acceptedValue: row.accepted_value,
    dueDate: row.due_date,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    version: row.version,
  };
}

function completionColumns(checkpoint: LearningCheckpointRecord): {
  completionMode: "binary" | "numeric";
  numericUnit: string | null;
  numericTarget: number | null;
} {
  return checkpoint.completionMode.kind === "binary"
    ? { completionMode: "binary", numericUnit: null, numericTarget: null }
    : {
        completionMode: "numeric",
        numericUnit: checkpoint.completionMode.unit,
        numericTarget: checkpoint.completionMode.target,
      };
}

function sameAddSemantics(
  existing: LearningCheckpointRecord,
  proposed: LearningCheckpointRecord,
): boolean {
  return (
    existing.goalId === proposed.goalId &&
    existing.title === proposed.title &&
    existing.description === proposed.description &&
    existing.status === proposed.status &&
    existing.required === proposed.required &&
    existing.sequence === proposed.sequence &&
    existing.weight === proposed.weight &&
    JSON.stringify(existing.completionMode) ===
      JSON.stringify(proposed.completionMode) &&
    existing.acceptedValue === proposed.acceptedValue &&
    existing.dueDate === proposed.dueDate &&
    existing.version === proposed.version
  );
}

function bindingsValidForAdd(input: AddLearningCheckpointRecord): boolean {
  return (
    input.goal.ownerId === input.context.ownerId &&
    input.checkpoint.goalId === input.goal.id &&
    input.event.aggregateType === "learning_checkpoint" &&
    input.event.aggregateId === input.checkpoint.id &&
    input.event.sequence === 1 &&
    input.event.before === null &&
    JSON.stringify(input.event.after) === JSON.stringify(input.checkpoint) &&
    input.event.actorId === input.context.actorId &&
    input.event.correlationId === input.context.correlationId &&
    input.event.idempotencyKey === input.context.idempotencyKey
  );
}

function bindingsValidForUpdate(input: UpdateLearningCheckpointRecord): boolean {
  return (
    input.goal.ownerId === input.context.ownerId &&
    input.before.goalId === input.goal.id &&
    input.after.goalId === input.goal.id &&
    input.before.id === input.after.id &&
    input.after.version === input.before.version + 1 &&
    input.event.aggregateType === "learning_checkpoint" &&
    input.event.aggregateId === input.before.id &&
    input.event.sequence === input.after.version &&
    JSON.stringify(input.event.before) === JSON.stringify(input.before) &&
    JSON.stringify(input.event.after) === JSON.stringify(input.after) &&
    input.event.actorId === input.context.actorId &&
    input.event.correlationId === input.context.correlationId &&
    input.event.idempotencyKey === input.context.idempotencyKey
  );
}

function eventMatchesUpdate(
  stored: StoredCheckpointEvent,
  input: UpdateLearningCheckpointRecord,
): boolean {
  return (
    stored.id === input.event.id &&
    stored.checkpoint_id === input.before.id &&
    stored.sequence === input.event.sequence &&
    stored.action === input.event.action &&
    stored.before_json === JSON.stringify(input.before) &&
    stored.after_json === JSON.stringify(input.after) &&
    stored.reason === input.event.reason &&
    stored.actor_id === input.event.actorId &&
    stored.occurred_at === input.event.occurredAt &&
    stored.correlation_id === input.event.correlationId &&
    stored.idempotency_key === input.event.idempotencyKey
  );
}

function bindingsValidForReorder(
  input: ReorderLearningCheckpointsRecord,
): boolean {
  if (
    input.goal.ownerId !== input.context.ownerId ||
    input.before.length === 0 ||
    input.before.length !== input.after.length ||
    input.event.aggregateType !== "learning_goal" ||
    input.event.aggregateId !== input.goal.id ||
    input.event.actorId !== input.context.actorId ||
    input.event.correlationId !== input.context.correlationId ||
    input.event.idempotencyKey !== input.context.idempotencyKey ||
    JSON.stringify(input.event.before) !== JSON.stringify(input.before) ||
    JSON.stringify(input.event.after) !== JSON.stringify(input.after)
  ) {
    return false;
  }
  const beforeIds = new Set(input.before.map((checkpoint) => checkpoint.id));
  const afterIds = new Set(input.after.map((checkpoint) => checkpoint.id));
  if (beforeIds.size !== input.before.length || afterIds.size !== input.after.length) {
    return false;
  }
  return input.after.every((after, index) => {
    const before = input.before.find((candidate) => candidate.id === after.id);
    return (
      before !== undefined &&
      before.goalId === input.goal.id &&
      after.goalId === input.goal.id &&
      after.version === before.version + 1 &&
      after.sequence === index + 1
    );
  });
}

export class SqliteLearningCheckpointRepository
  implements LearningCheckpointRepository
{
  constructor(private readonly database: SqliteDatabase) {}

  async add(
    input: AddLearningCheckpointRecord,
  ): Promise<GrowthWriteResult<LearningCheckpointRecord>> {
    if (!bindingsValidForAdd(input)) return { kind: "conflict" };

    const transaction = this.database.$client.transaction(() => {
      const existingEvent = this.database.$client
        .prepare(
          `SELECT checkpoint_id, action
           FROM learning_checkpoint_events
           WHERE actor_id = ? AND idempotency_key = ?
           ORDER BY occurred_at DESC, id DESC
           LIMIT 1`,
        )
        .get(input.context.actorId, input.context.idempotencyKey) as
        | { checkpoint_id: string; action: string }
        | undefined;
      if (existingEvent !== undefined) {
        const existing = this.getCheckpointSync(existingEvent.checkpoint_id);
        if (
          existing === null ||
          existingEvent.action !== input.event.action ||
          !sameAddSemantics(existing, input.checkpoint)
        ) {
          return { kind: "conflict" } as const;
        }
        return { kind: "idempotent", value: existing } as const;
      }

      if (!this.goalSnapshotMatches(input)) return { kind: "conflict" } as const;
      const mode = completionColumns(input.checkpoint);
      this.database.$client
        .prepare(
          `INSERT INTO learning_checkpoints (
            id, goal_id, title, description, status, required, sequence, weight,
            completion_mode, numeric_unit, numeric_target, accepted_value,
            due_date, created_at, updated_at, version
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          input.checkpoint.id,
          input.checkpoint.goalId,
          input.checkpoint.title,
          input.checkpoint.description,
          input.checkpoint.status,
          input.checkpoint.required ? 1 : 0,
          input.checkpoint.sequence,
          input.checkpoint.weight,
          mode.completionMode,
          mode.numericUnit,
          mode.numericTarget,
          input.checkpoint.acceptedValue,
          input.checkpoint.dueDate,
          input.checkpoint.createdAt,
          input.checkpoint.updatedAt,
          input.checkpoint.version,
        );
      this.insertCheckpointEvent({
        id: input.event.id,
        checkpointId: input.checkpoint.id,
        sequence: input.event.sequence,
        action: input.event.action,
        before: null,
        after: input.checkpoint,
        reason: input.event.reason,
        actorId: input.event.actorId,
        occurredAt: input.event.occurredAt,
        correlationId: input.event.correlationId,
        idempotencyKey: input.event.idempotencyKey,
      });
      this.insertAudit({
        id: `growth-audit-${input.event.id}`,
        actor: input.event.actorId,
        action: input.event.action,
        entityType: "learning_checkpoint",
        entityId: input.checkpoint.id,
        before: null,
        after: input.checkpoint,
        reason: input.event.reason,
        occurredAt: input.event.occurredAt,
        correlationId: input.event.correlationId,
      });
      return { kind: "applied", value: input.checkpoint } as const;
    });

    return transaction.immediate();
  }

  async update(
    input: UpdateLearningCheckpointRecord,
  ): Promise<GrowthWriteResult<LearningCheckpointRecord>> {
    if (!bindingsValidForUpdate(input)) return { kind: "conflict" };

    const transaction = this.database.$client.transaction(() => {
      const existingEvent = this.database.$client
        .prepare(
          `SELECT id, checkpoint_id, sequence, action, before_json, after_json,
                  reason, actor_id, occurred_at, correlation_id, idempotency_key
           FROM learning_checkpoint_events
           WHERE checkpoint_id = ? AND idempotency_key = ?`,
        )
        .get(input.before.id, input.context.idempotencyKey) as
        | StoredCheckpointEvent
        | undefined;
      if (existingEvent !== undefined) {
        if (!eventMatchesUpdate(existingEvent, input)) {
          return { kind: "conflict" } as const;
        }
        const current = this.getCheckpointSync(input.before.id);
        return current === null
          ? ({ kind: "conflict" } as const)
          : ({ kind: "idempotent", value: current } as const);
      }

      if (!this.goalSnapshotMatches({ goal: input.goal })) {
        return { kind: "conflict" } as const;
      }
      const mode = completionColumns(input.after);
      const result = this.database.$client
        .prepare(
          `UPDATE learning_checkpoints
           SET title = ?, description = ?, status = ?, required = ?, sequence = ?,
               weight = ?, completion_mode = ?, numeric_unit = ?, numeric_target = ?,
               accepted_value = ?, due_date = ?, updated_at = ?, version = ?
           WHERE id = ? AND goal_id = ? AND version = ? AND updated_at = ?`,
        )
        .run(
          input.after.title,
          input.after.description,
          input.after.status,
          input.after.required ? 1 : 0,
          input.after.sequence,
          input.after.weight,
          mode.completionMode,
          mode.numericUnit,
          mode.numericTarget,
          input.after.acceptedValue,
          input.after.dueDate,
          input.after.updatedAt,
          input.after.version,
          input.before.id,
          input.goal.id,
          input.before.version,
          input.before.updatedAt,
        );
      if (result.changes !== 1) return { kind: "conflict" } as const;

      this.insertCheckpointEvent({
        id: input.event.id,
        checkpointId: input.before.id,
        sequence: input.event.sequence,
        action: input.event.action,
        before: input.before,
        after: input.after,
        reason: input.event.reason,
        actorId: input.event.actorId,
        occurredAt: input.event.occurredAt,
        correlationId: input.event.correlationId,
        idempotencyKey: input.event.idempotencyKey,
      });
      this.insertAudit({
        id: `growth-audit-${input.event.id}`,
        actor: input.event.actorId,
        action: input.event.action,
        entityType: "learning_checkpoint",
        entityId: input.before.id,
        before: input.before,
        after: input.after,
        reason: input.event.reason,
        occurredAt: input.event.occurredAt,
        correlationId: input.event.correlationId,
      });
      return { kind: "applied", value: input.after } as const;
    });

    return transaction.immediate();
  }

  async reorder(
    input: ReorderLearningCheckpointsRecord,
  ): Promise<GrowthWriteResult<readonly LearningCheckpointRecord[]>> {
    if (!bindingsValidForReorder(input)) return { kind: "conflict" };

    const transaction = this.database.$client.transaction(() => {
      const existing = this.database.$client
        .prepare(
          `SELECT checkpoint_id
           FROM learning_checkpoint_events
           WHERE actor_id = ? AND idempotency_key = ?
           ORDER BY occurred_at DESC, id DESC
           LIMIT 1`,
        )
        .get(input.context.actorId, input.context.idempotencyKey) as
        | { checkpoint_id: string }
        | undefined;
      if (existing !== undefined) {
        const current = this.listGoalCheckpointsSync(input.goal.id);
        const currentOrder = current.map((checkpoint) => checkpoint.id);
        const desiredOrder = [...input.after]
          .sort((left, right) => left.sequence - right.sequence)
          .map((checkpoint) => checkpoint.id);
        return JSON.stringify(currentOrder) === JSON.stringify(desiredOrder)
          ? ({ kind: "idempotent", value: current } as const)
          : ({ kind: "conflict" } as const);
      }

      if (!this.goalSnapshotMatches({ goal: input.goal })) {
        return { kind: "conflict" } as const;
      }
      const current = this.listGoalCheckpointsSync(input.goal.id);
      if (
        current.length !== input.before.length ||
        input.before.some((before) => {
          const row = current.find((candidate) => candidate.id === before.id);
          return (
            row === undefined ||
            row.version !== before.version ||
            row.sequence !== before.sequence ||
            row.updatedAt !== before.updatedAt
          );
        })
      ) {
        return { kind: "conflict" } as const;
      }

      this.database.$client
        .prepare(
          `UPDATE learning_checkpoints
           SET sequence = sequence + 1000000
           WHERE goal_id = ?`,
        )
        .run(input.goal.id);

      for (const after of input.after) {
        const before = input.before.find((candidate) => candidate.id === after.id);
        if (before === undefined) throw new Error("CHECKPOINT_REORDER_BINDING_INVALID");
        const mode = completionColumns(after);
        const result = this.database.$client
          .prepare(
            `UPDATE learning_checkpoints
             SET title = ?, description = ?, status = ?, required = ?, sequence = ?,
                 weight = ?, completion_mode = ?, numeric_unit = ?, numeric_target = ?,
                 accepted_value = ?, due_date = ?, updated_at = ?, version = ?
             WHERE id = ? AND goal_id = ? AND version = ? AND sequence = ?`,
          )
          .run(
            after.title,
            after.description,
            after.status,
            after.required ? 1 : 0,
            after.sequence,
            after.weight,
            mode.completionMode,
            mode.numericUnit,
            mode.numericTarget,
            after.acceptedValue,
            after.dueDate,
            after.updatedAt,
            after.version,
            before.id,
            input.goal.id,
            before.version,
            before.sequence + 1000000,
          );
        if (result.changes !== 1) {
          throw new Error("CHECKPOINT_REORDER_CONCURRENT_CHANGE");
        }
      }

      const orderedAfter = [...input.after].sort(
        (left, right) => left.sequence - right.sequence,
      );
      orderedAfter.forEach((after, index) => {
        const before = input.before.find((candidate) => candidate.id === after.id);
        if (before === undefined) throw new Error("CHECKPOINT_REORDER_BINDING_INVALID");
        this.insertCheckpointEvent({
          id: `${input.event.id}:${after.id}`,
          checkpointId: after.id,
          sequence: after.version,
          action: input.event.action,
          before,
          after,
          reason: input.event.reason,
          actorId: input.event.actorId,
          occurredAt: input.event.occurredAt,
          correlationId: input.event.correlationId,
          idempotencyKey:
            index === 0
              ? input.event.idempotencyKey
              : `${input.event.idempotencyKey}:${after.id}`,
        });
      });
      this.insertAudit({
        id: `growth-audit-${input.event.id}`,
        actor: input.event.actorId,
        action: input.event.action,
        entityType: "learning_goal",
        entityId: input.goal.id,
        before: input.before,
        after: input.after,
        reason: input.event.reason,
        occurredAt: input.event.occurredAt,
        correlationId: input.event.correlationId,
      });
      return { kind: "applied", value: orderedAfter } as const;
    });

    try {
      return transaction.immediate();
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === "CHECKPOINT_REORDER_CONCURRENT_CHANGE"
      ) {
        return { kind: "conflict" };
      }
      throw error;
    }
  }

  private goalSnapshotMatches(input: { goal: { id: string; ownerId: string; version: number; updatedAt: string } }): boolean {
    const row = this.database.$client
      .prepare(
        `SELECT version, updated_at
         FROM learning_goals
         WHERE id = ? AND owner_id = ?`,
      )
      .get(input.goal.id, input.goal.ownerId) as
      | { version: number; updated_at: string }
      | undefined;
    return (
      row !== undefined &&
      row.version === input.goal.version &&
      row.updated_at === input.goal.updatedAt
    );
  }

  private getCheckpointSync(id: string): LearningCheckpointRecord | null {
    const row = this.database.$client
      .prepare(
        `SELECT id, goal_id, title, description, status, required, sequence,
                weight, completion_mode, numeric_unit, numeric_target,
                accepted_value, due_date, created_at, updated_at, version
         FROM learning_checkpoints
         WHERE id = ?`,
      )
      .get(id) as CheckpointRow | undefined;
    return row === undefined ? null : toCheckpoint(row);
  }

  private listGoalCheckpointsSync(goalId: string): readonly LearningCheckpointRecord[] {
    return (
      this.database.$client
        .prepare(
          `SELECT id, goal_id, title, description, status, required, sequence,
                  weight, completion_mode, numeric_unit, numeric_target,
                  accepted_value, due_date, created_at, updated_at, version
           FROM learning_checkpoints
           WHERE goal_id = ?
           ORDER BY sequence ASC, id ASC`,
        )
        .all(goalId) as CheckpointRow[]
    ).map(toCheckpoint);
  }

  private insertCheckpointEvent(input: {
    id: string;
    checkpointId: string;
    sequence: number;
    action: string;
    before: LearningCheckpointRecord | null;
    after: LearningCheckpointRecord;
    reason: string;
    actorId: string;
    occurredAt: string;
    correlationId: string;
    idempotencyKey: string;
  }): void {
    this.database.$client
      .prepare(
        `INSERT INTO learning_checkpoint_events (
          id, checkpoint_id, sequence, action, before_json, after_json, reason,
          actor_id, occurred_at, correlation_id, idempotency_key
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        input.id,
        input.checkpointId,
        input.sequence,
        input.action,
        input.before === null ? null : JSON.stringify(input.before),
        JSON.stringify(input.after),
        input.reason,
        input.actorId,
        input.occurredAt,
        input.correlationId,
        input.idempotencyKey,
      );
  }

  private insertAudit(input: {
    id: string;
    actor: string;
    action: string;
    entityType: string;
    entityId: string;
    before: unknown;
    after: unknown;
    reason: string;
    occurredAt: string;
    correlationId: string;
  }): void {
    this.database.$client
      .prepare(
        `INSERT INTO audit_events (
          id, actor, action, entity_type, entity_id, before_json, after_json,
          reason, occurred_at, source, confirmed, correlation_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        input.id,
        input.actor,
        input.action,
        input.entityType,
        input.entityId,
        input.before === null ? null : JSON.stringify(input.before),
        input.after === null ? null : JSON.stringify(input.after),
        input.reason,
        input.occurredAt,
        "manual",
        0,
        input.correlationId,
      );
  }
}
