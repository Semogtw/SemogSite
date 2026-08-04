import type {
  GrowthWriteResult,
  LearningCheckpointRecord,
  LearningGoalAggregate,
  LearningGoalRecord,
  QuickCreateLearningGoalPersistence,
  QuickLearningGoalRepository,
} from "@semogtw/domain/growth";
import type { SqliteDatabase } from "../adapters/sqlite";

type GoalRow = {
  id: string;
  owner_id: string;
  slug: string;
  title: string;
  description: string;
  motivation: string | null;
  status: LearningGoalRecord["status"];
  priority: LearningGoalRecord["priority"];
  target_date: string | null;
  created_at: string;
  updated_at: string;
  version: number;
};

type CheckpointRow = {
  id: string;
  goal_id: string;
  title: string;
  description: string;
  status: LearningCheckpointRecord["status"];
  required: number;
  sequence: number;
  weight: number;
  weight_mode: "automatic" | "custom";
  completion_mode: "binary" | "numeric";
  numeric_unit: string | null;
  numeric_target: number | null;
  accepted_value: number | null;
  due_date: string | null;
  created_at: string;
  updated_at: string;
  version: number;
};

type ExistingGoalEvent = {
  goal_id: string;
  action: string;
  reason: string;
};

function goalFromRow(row: GoalRow): LearningGoalRecord {
  return {
    id: row.id,
    ownerId: row.owner_id,
    slug: row.slug,
    title: row.title,
    description: row.description,
    motivation: row.motivation,
    status: row.status,
    priority: row.priority,
    targetDate: row.target_date,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    version: row.version,
  };
}

function checkpointFromRow(row: CheckpointRow): LearningCheckpointRecord {
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
    weightMode: row.weight_mode,
    completionMode,
    acceptedValue: row.accepted_value,
    dueDate: row.due_date,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    version: row.version,
  };
}

function completionColumns(checkpoint: LearningCheckpointRecord): {
  mode: "binary" | "numeric";
  unit: string | null;
  target: number | null;
} {
  return checkpoint.completionMode.kind === "binary"
    ? { mode: "binary", unit: null, target: null }
    : {
        mode: "numeric",
        unit: checkpoint.completionMode.unit,
        target: checkpoint.completionMode.target,
      };
}

function sameGoalSemantics(
  existing: LearningGoalRecord,
  proposed: LearningGoalRecord,
): boolean {
  return (
    existing.ownerId === proposed.ownerId &&
    existing.slug === proposed.slug &&
    existing.title === proposed.title &&
    existing.description === proposed.description &&
    existing.motivation === proposed.motivation &&
    existing.status === proposed.status &&
    existing.priority === proposed.priority &&
    existing.targetDate === proposed.targetDate &&
    existing.version === proposed.version
  );
}

function sameCheckpointSemantics(
  existing: LearningCheckpointRecord,
  proposed: LearningCheckpointRecord,
): boolean {
  return (
    existing.title === proposed.title &&
    existing.description === proposed.description &&
    existing.status === proposed.status &&
    existing.required === proposed.required &&
    existing.sequence === proposed.sequence &&
    existing.weight === proposed.weight &&
    (existing.weightMode ?? "automatic") ===
      (proposed.weightMode ?? "automatic") &&
    JSON.stringify(existing.completionMode) ===
      JSON.stringify(proposed.completionMode) &&
    existing.acceptedValue === proposed.acceptedValue &&
    existing.dueDate === proposed.dueDate &&
    existing.version === proposed.version
  );
}

function expectedReason(input: QuickCreateLearningGoalPersistence): string {
  return input.origin.kind === "manual"
    ? "Create learning goal manually"
    : `Create learning goal from template ${input.origin.templateId}@${input.origin.templateVersion}`;
}

function bindingsValid(input: QuickCreateLearningGoalPersistence): boolean {
  if (
    input.goal.ownerId !== input.context.ownerId ||
    input.goalEvent.aggregateType !== "learning_goal" ||
    input.goalEvent.aggregateId !== input.goal.id ||
    input.goalEvent.sequence !== 1 ||
    input.goalEvent.action !== "learning_goal.quick_create" ||
    input.goalEvent.before !== null ||
    JSON.stringify(input.goalEvent.after) !== JSON.stringify(input.goal) ||
    input.goalEvent.reason !== expectedReason(input) ||
    input.goalEvent.actorId !== input.context.actorId ||
    input.goalEvent.correlationId !== input.context.correlationId ||
    input.goalEvent.idempotencyKey !== input.context.idempotencyKey ||
    input.checkpoints.length !== input.checkpointEvents.length
  ) {
    return false;
  }

  if (input.origin.kind === "manual" && input.checkpoints.length !== 0) {
    return false;
  }
  if (input.origin.kind === "template" && input.checkpoints.length === 0) {
    return false;
  }
  if (
    input.checkpoints.length > 0 &&
    input.checkpoints.reduce((total, checkpoint) => total + checkpoint.weight, 0) !==
      100
  ) {
    return false;
  }

  const ids = new Set<string>();
  return input.checkpoints.every((checkpoint, index) => {
    const event = input.checkpointEvents[index];
    if (event === undefined || ids.has(checkpoint.id)) return false;
    ids.add(checkpoint.id);
    return (
      checkpoint.goalId === input.goal.id &&
      checkpoint.sequence === index + 1 &&
      checkpoint.version === 1 &&
      checkpoint.weightMode === "automatic" &&
      event.aggregateType === "learning_checkpoint" &&
      event.aggregateId === checkpoint.id &&
      event.sequence === 1 &&
      event.action === "learning_checkpoint.template_add" &&
      event.before === null &&
      JSON.stringify(event.after) === JSON.stringify(checkpoint) &&
      event.actorId === input.context.actorId &&
      event.correlationId === input.context.correlationId &&
      event.idempotencyKey === input.context.idempotencyKey
    );
  });
}

export class SqliteQuickLearningGoalRepository
  implements QuickLearningGoalRepository
{
  constructor(private readonly database: SqliteDatabase) {}

  async create(
    input: QuickCreateLearningGoalPersistence,
  ): Promise<GrowthWriteResult<LearningGoalAggregate>> {
    if (!bindingsValid(input)) return { kind: "conflict" };

    const transaction = this.database.$client.transaction(() => {
      const existingEvent = this.database.$client
        .prepare(
          `SELECT goal_id, action, reason
           FROM learning_goal_events
           WHERE actor_id = ? AND idempotency_key = ?
           ORDER BY occurred_at DESC, id DESC
           LIMIT 1`,
        )
        .get(input.context.actorId, input.context.idempotencyKey) as
        | ExistingGoalEvent
        | undefined;

      if (existingEvent !== undefined) {
        const existing = this.getAggregateSync(
          input.context.ownerId,
          existingEvent.goal_id,
        );
        if (
          existing === null ||
          existingEvent.action !== input.goalEvent.action ||
          existingEvent.reason !== input.goalEvent.reason ||
          !sameGoalSemantics(existing, input.goal) ||
          existing.checkpoints.length !== input.checkpoints.length ||
          existing.checkpoints.some(
            (checkpoint, index) =>
              !sameCheckpointSemantics(checkpoint, input.checkpoints[index]!),
          )
        ) {
          return { kind: "conflict" } as const;
        }
        return { kind: "idempotent", value: existing } as const;
      }

      const duplicateSlug = this.database.$client
        .prepare(
          `SELECT id
           FROM learning_goals
           WHERE owner_id = ? AND slug = ?`,
        )
        .get(input.context.ownerId, input.goal.slug) as
        | { id: string }
        | undefined;
      if (duplicateSlug !== undefined) return { kind: "conflict" } as const;

      this.insertGoal(input.goal);
      this.insertGoalEvent(input);
      input.checkpoints.forEach((checkpoint, index) => {
        this.insertCheckpoint(checkpoint);
        this.insertCheckpointEvent(input, index);
      });
      this.insertAudit(input);

      return {
        kind: "applied",
        value: {
          ...input.goal,
          checkpoints: input.checkpoints,
          skills: [],
        },
      } as const;
    });

    return transaction.immediate();
  }

  private getAggregateSync(
    ownerId: string,
    goalId: string,
  ): LearningGoalAggregate | null {
    const goalRow = this.database.$client
      .prepare(
        `SELECT id, owner_id, slug, title, description, motivation, status,
                priority, target_date, created_at, updated_at, version
         FROM learning_goals
         WHERE id = ? AND owner_id = ?`,
      )
      .get(goalId, ownerId) as GoalRow | undefined;
    if (goalRow === undefined) return null;
    const checkpointRows = this.database.$client
      .prepare(
        `SELECT id, goal_id, title, description, status, required, sequence,
                weight, weight_mode, completion_mode, numeric_unit,
                numeric_target, accepted_value, due_date, created_at,
                updated_at, version
         FROM learning_checkpoints
         WHERE goal_id = ?
         ORDER BY sequence ASC, id ASC`,
      )
      .all(goalId) as CheckpointRow[];
    return {
      ...goalFromRow(goalRow),
      checkpoints: checkpointRows.map(checkpointFromRow),
      skills: [],
    };
  }

  private insertGoal(goal: LearningGoalRecord): void {
    this.database.$client
      .prepare(
        `INSERT INTO learning_goals (
          id, owner_id, slug, title, description, motivation, status, priority,
          target_date, created_at, updated_at, version
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        goal.id,
        goal.ownerId,
        goal.slug,
        goal.title,
        goal.description,
        goal.motivation,
        goal.status,
        goal.priority,
        goal.targetDate,
        goal.createdAt,
        goal.updatedAt,
        goal.version,
      );
  }

  private insertGoalEvent(input: QuickCreateLearningGoalPersistence): void {
    const event = input.goalEvent;
    this.database.$client
      .prepare(
        `INSERT INTO learning_goal_events (
          id, goal_id, sequence, action, before_json, after_json, reason,
          actor_id, occurred_at, correlation_id, idempotency_key
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        event.id,
        event.aggregateId,
        event.sequence,
        event.action,
        null,
        JSON.stringify(event.after),
        event.reason,
        event.actorId,
        event.occurredAt,
        event.correlationId,
        event.idempotencyKey,
      );
  }

  private insertCheckpoint(checkpoint: LearningCheckpointRecord): void {
    const completion = completionColumns(checkpoint);
    this.database.$client
      .prepare(
        `INSERT INTO learning_checkpoints (
          id, goal_id, title, description, status, required, sequence, weight,
          weight_mode, completion_mode, numeric_unit, numeric_target,
          accepted_value, due_date, created_at, updated_at, version
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        checkpoint.id,
        checkpoint.goalId,
        checkpoint.title,
        checkpoint.description,
        checkpoint.status,
        checkpoint.required ? 1 : 0,
        checkpoint.sequence,
        checkpoint.weight,
        checkpoint.weightMode ?? "automatic",
        completion.mode,
        completion.unit,
        completion.target,
        checkpoint.acceptedValue,
        checkpoint.dueDate,
        checkpoint.createdAt,
        checkpoint.updatedAt,
        checkpoint.version,
      );
  }

  private insertCheckpointEvent(
    input: QuickCreateLearningGoalPersistence,
    index: number,
  ): void {
    const event = input.checkpointEvents[index];
    if (event === undefined) throw new Error("QUICK_CREATE_EVENT_MISSING");
    this.database.$client
      .prepare(
        `INSERT INTO learning_checkpoint_events (
          id, checkpoint_id, sequence, action, before_json, after_json, reason,
          actor_id, occurred_at, correlation_id, idempotency_key
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        event.id,
        event.aggregateId,
        event.sequence,
        event.action,
        null,
        JSON.stringify(event.after),
        event.reason,
        event.actorId,
        event.occurredAt,
        event.correlationId,
        event.idempotencyKey,
      );
  }

  private insertAudit(input: QuickCreateLearningGoalPersistence): void {
    this.database.$client
      .prepare(
        `INSERT INTO audit_events (
          id, actor, action, entity_type, entity_id, before_json, after_json,
          reason, occurred_at, source, confirmed, correlation_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        `growth-audit-${input.goalEvent.id}`,
        input.goalEvent.actorId,
        input.goalEvent.action,
        "learning_goal",
        input.goal.id,
        null,
        JSON.stringify({
          goal: input.goal,
          checkpoints: input.checkpoints,
          origin: input.origin,
        }),
        input.goalEvent.reason,
        input.goalEvent.occurredAt,
        "manual",
        0,
        input.goalEvent.correlationId,
      );
  }
}
