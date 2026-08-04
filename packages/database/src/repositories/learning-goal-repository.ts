import type {
  CreateLearningGoalRecord,
  GrowthWriteResult,
  LearningCheckpointRecord,
  LearningGoalAggregate,
  LearningGoalRecord,
  LearningGoalRepository,
  LearningGoalSkillLink,
  UpdateLearningGoalRecord,
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
  completion_mode: "binary" | "numeric";
  numeric_unit: string | null;
  numeric_target: number | null;
  accepted_value: number | null;
  due_date: string | null;
  created_at: string;
  updated_at: string;
  version: number;
};

type GoalSkillRow = {
  goal_id: string;
  skill_id: string;
  desired_stage: LearningGoalSkillLink["desiredStage"];
  created_at: string;
};

type StoredGoalEventRow = {
  id: string;
  goal_id: string;
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

function toGoalRecord(row: GoalRow): LearningGoalRecord {
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

function toCheckpointRecord(row: CheckpointRow): LearningCheckpointRecord {
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

function toGoalSkillLink(row: GoalSkillRow): LearningGoalSkillLink {
  return {
    goalId: row.goal_id,
    skillId: row.skill_id,
    desiredStage: row.desired_stage,
    createdAt: row.created_at,
  };
}

function goalEventBeforeJson(
  event: UpdateLearningGoalRecord["event"],
): string | null {
  return event.before === null ? null : JSON.stringify(event.before);
}

function sameCreateSemantics(
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

function goalRecordFromAggregate(
  aggregate: LearningGoalAggregate,
): LearningGoalRecord {
  return {
    id: aggregate.id,
    ownerId: aggregate.ownerId,
    slug: aggregate.slug,
    title: aggregate.title,
    description: aggregate.description,
    motivation: aggregate.motivation,
    status: aggregate.status,
    priority: aggregate.priority,
    targetDate: aggregate.targetDate,
    createdAt: aggregate.createdAt,
    updatedAt: aggregate.updatedAt,
    version: aggregate.version,
  };
}

function eventMatchesUpdate(
  stored: StoredGoalEventRow,
  input: UpdateLearningGoalRecord,
): boolean {
  return (
    stored.id === input.event.id &&
    stored.goal_id === input.before.id &&
    stored.sequence === input.event.sequence &&
    stored.action === input.event.action &&
    stored.before_json === goalEventBeforeJson(input.event) &&
    stored.after_json === JSON.stringify(input.event.after) &&
    stored.reason === input.event.reason &&
    stored.actor_id === input.event.actorId &&
    stored.occurred_at === input.event.occurredAt &&
    stored.correlation_id === input.event.correlationId &&
    stored.idempotency_key === input.event.idempotencyKey
  );
}

function bindingsValidForCreate(input: CreateLearningGoalRecord): boolean {
  return (
    input.goal.ownerId === input.context.ownerId &&
    input.event.aggregateType === "learning_goal" &&
    input.event.aggregateId === input.goal.id &&
    input.event.sequence === 1 &&
    input.event.before === null &&
    JSON.stringify(input.event.after) === JSON.stringify(input.goal) &&
    input.event.actorId === input.context.actorId &&
    input.event.correlationId === input.context.correlationId &&
    input.event.idempotencyKey === input.context.idempotencyKey
  );
}

function bindingsValidForUpdate(input: UpdateLearningGoalRecord): boolean {
  return (
    input.before.id === input.after.id &&
    input.before.ownerId === input.context.ownerId &&
    input.after.ownerId === input.context.ownerId &&
    input.after.version === input.before.version + 1 &&
    input.event.aggregateType === "learning_goal" &&
    input.event.aggregateId === input.before.id &&
    input.event.sequence === input.after.version &&
    JSON.stringify(input.event.before) ===
      JSON.stringify(goalRecordFromAggregate(input.before)) &&
    JSON.stringify(input.event.after) ===
      JSON.stringify(goalRecordFromAggregate(input.after)) &&
    input.event.actorId === input.context.actorId &&
    input.event.correlationId === input.context.correlationId &&
    input.event.idempotencyKey === input.context.idempotencyKey
  );
}

export class SqliteLearningGoalRepository implements LearningGoalRepository {
  constructor(private readonly database: SqliteDatabase) {}

  async create(
    input: CreateLearningGoalRecord,
  ): Promise<GrowthWriteResult<LearningGoalAggregate>> {
    if (!bindingsValidForCreate(input)) return { kind: "conflict" };

    const transaction = this.database.$client.transaction(() => {
      const existingEvent = this.database.$client
        .prepare(
          `SELECT id, goal_id, sequence, action, before_json, after_json,
                  reason, actor_id, occurred_at, correlation_id, idempotency_key
           FROM learning_goal_events
           WHERE actor_id = ? AND idempotency_key = ?
           ORDER BY occurred_at DESC, id DESC
           LIMIT 1`,
        )
        .get(input.context.actorId, input.context.idempotencyKey) as
        | StoredGoalEventRow
        | undefined;

      if (existingEvent !== undefined) {
        const existing = this.getAggregateSync(
          input.context.ownerId,
          existingEvent.goal_id,
        );
        if (
          existing === null ||
          existingEvent.action !== input.event.action ||
          !sameCreateSemantics(existing, input.goal)
        ) {
          return { kind: "conflict" } as const;
        }
        return { kind: "idempotent", value: existing } as const;
      }

      this.database.$client
        .prepare(
          `INSERT INTO learning_goals (
            id, owner_id, slug, title, description, motivation, status, priority,
            target_date, created_at, updated_at, version
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          input.goal.id,
          input.goal.ownerId,
          input.goal.slug,
          input.goal.title,
          input.goal.description,
          input.goal.motivation,
          input.goal.status,
          input.goal.priority,
          input.goal.targetDate,
          input.goal.createdAt,
          input.goal.updatedAt,
          input.goal.version,
        );
      this.insertGoalEvent(input.event);
      this.insertAudit({
        eventId: input.event.id,
        actor: input.event.actorId,
        action: input.event.action,
        entityId: input.goal.id,
        beforeJson: null,
        afterJson: JSON.stringify(input.goal),
        reason: input.event.reason,
        occurredAt: input.event.occurredAt,
        correlationId: input.event.correlationId,
      });

      return {
        kind: "applied",
        value: { ...input.goal, checkpoints: [], skills: [] },
      } as const;
    });

    return transaction.immediate();
  }

  async getById(
    ownerId: string,
    id: string,
  ): Promise<LearningGoalAggregate | null> {
    return this.getAggregateSync(ownerId, id);
  }

  async update(
    input: UpdateLearningGoalRecord,
  ): Promise<GrowthWriteResult<LearningGoalAggregate>> {
    if (!bindingsValidForUpdate(input)) return { kind: "conflict" };

    const transaction = this.database.$client.transaction(() => {
      const existingEvent = this.database.$client
        .prepare(
          `SELECT id, goal_id, sequence, action, before_json, after_json,
                  reason, actor_id, occurred_at, correlation_id, idempotency_key
           FROM learning_goal_events
           WHERE goal_id = ? AND idempotency_key = ?`,
        )
        .get(input.before.id, input.context.idempotencyKey) as
        | StoredGoalEventRow
        | undefined;

      if (existingEvent !== undefined) {
        if (!eventMatchesUpdate(existingEvent, input)) {
          return { kind: "conflict" } as const;
        }
        const existing = this.getAggregateSync(
          input.context.ownerId,
          input.before.id,
        );
        return existing === null
          ? ({ kind: "conflict" } as const)
          : ({ kind: "idempotent", value: existing } as const);
      }

      const result = this.database.$client
        .prepare(
          `UPDATE learning_goals
           SET slug = ?, title = ?, description = ?, motivation = ?, status = ?,
               priority = ?, target_date = ?, updated_at = ?, version = ?
           WHERE id = ? AND owner_id = ? AND version = ? AND updated_at = ?`,
        )
        .run(
          input.after.slug,
          input.after.title,
          input.after.description,
          input.after.motivation,
          input.after.status,
          input.after.priority,
          input.after.targetDate,
          input.after.updatedAt,
          input.after.version,
          input.before.id,
          input.context.ownerId,
          input.before.version,
          input.before.updatedAt,
        );
      if (result.changes !== 1) return { kind: "conflict" } as const;

      this.insertGoalEvent(input.event);
      this.insertAudit({
        eventId: input.event.id,
        actor: input.event.actorId,
        action: input.event.action,
        entityId: input.before.id,
        beforeJson: JSON.stringify(input.event.before),
        afterJson: JSON.stringify(input.event.after),
        reason: input.event.reason,
        occurredAt: input.event.occurredAt,
        correlationId: input.event.correlationId,
      });

      return {
        kind: "applied",
        value: {
          ...input.after,
          checkpoints: input.before.checkpoints,
          skills: input.before.skills,
        },
      } as const;
    });

    return transaction.immediate();
  }

  private getAggregateSync(
    ownerId: string,
    id: string,
  ): LearningGoalAggregate | null {
    const goalRow = this.database.$client
      .prepare(
        `SELECT id, owner_id, slug, title, description, motivation, status,
                priority, target_date, created_at, updated_at, version
         FROM learning_goals
         WHERE id = ? AND owner_id = ?`,
      )
      .get(id, ownerId) as GoalRow | undefined;
    if (goalRow === undefined) return null;

    const checkpoints = this.database.$client
      .prepare(
        `SELECT id, goal_id, title, description, status, required, sequence,
                weight, completion_mode, numeric_unit, numeric_target,
                accepted_value, due_date, created_at, updated_at, version
         FROM learning_checkpoints
         WHERE goal_id = ?
         ORDER BY sequence ASC, id ASC`,
      )
      .all(id) as CheckpointRow[];
    const skills = this.database.$client
      .prepare(
        `SELECT goal_id, skill_id, desired_stage, created_at
         FROM learning_goal_skills
         WHERE goal_id = ?
         ORDER BY skill_id ASC`,
      )
      .all(id) as GoalSkillRow[];

    return {
      ...toGoalRecord(goalRow),
      checkpoints: checkpoints.map(toCheckpointRecord),
      skills: skills.map(toGoalSkillLink),
    };
  }

  private insertGoalEvent(event: CreateLearningGoalRecord["event"]): void {
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
        event.before === null ? null : JSON.stringify(event.before),
        JSON.stringify(event.after),
        event.reason,
        event.actorId,
        event.occurredAt,
        event.correlationId,
        event.idempotencyKey,
      );
  }

  private insertAudit(input: {
    eventId: string;
    actor: string;
    action: string;
    entityId: string;
    beforeJson: string | null;
    afterJson: string | null;
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
        `growth-audit-${input.eventId}`,
        input.actor,
        input.action,
        "learning_goal",
        input.entityId,
        input.beforeJson,
        input.afterJson,
        input.reason,
        input.occurredAt,
        "manual",
        0,
        input.correlationId,
      );
  }
}
