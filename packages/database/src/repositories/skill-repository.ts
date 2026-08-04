import type {
  CreateSkillRecord,
  GrowthMutationContext,
  GrowthWriteResult,
  LearningCheckpointSkillLink,
  LearningGoalSkillLink,
  SkillRecord,
  SkillRepository,
  UpdateSkillRecord,
} from "@semogtw/domain/growth";
import { createHash } from "node:crypto";
import type { SqliteDatabase } from "../adapters/sqlite";

type SkillRow = {
  id: string;
  owner_id: string;
  slug: string;
  name: string;
  description: string;
  status: SkillRecord["status"];
  merged_into_skill_id: string | null;
  created_at: string;
  updated_at: string;
  version: number;
};

type AliasEventRow = {
  id: string;
  owner_id: string;
  alias_slug: string;
  skill_id: string;
  sequence: number;
  action: "created" | "revoked";
  actor_id: string;
  reason: string;
  occurred_at: string;
  correlation_id: string;
  idempotency_key: string;
};

type GoalSkillRow = {
  goal_id: string;
  skill_id: string;
  desired_stage: LearningGoalSkillLink["desiredStage"];
  created_at: string;
};

type CheckpointSkillRow = {
  checkpoint_id: string;
  skill_id: string;
  desired_stage: LearningCheckpointSkillLink["desiredStage"];
  created_at: string;
};

type AuditRow = {
  after_json: string | null;
};

function toSkill(row: SkillRow): SkillRecord {
  return {
    id: row.id,
    ownerId: row.owner_id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    status: row.status,
    mergedIntoSkillId: row.merged_into_skill_id,
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

function toCheckpointSkillLink(
  row: CheckpointSkillRow,
): LearningCheckpointSkillLink {
  return {
    checkpointId: row.checkpoint_id,
    skillId: row.skill_id,
    desiredStage: row.desired_stage,
    createdAt: row.created_at,
  };
}

function sameCreateSemantics(
  existing: SkillRecord,
  proposed: SkillRecord,
): boolean {
  return (
    existing.ownerId === proposed.ownerId &&
    existing.slug === proposed.slug &&
    existing.name === proposed.name &&
    existing.description === proposed.description &&
    existing.status === proposed.status &&
    existing.mergedIntoSkillId === proposed.mergedIntoSkillId &&
    existing.version === proposed.version
  );
}

function sameSkill(left: SkillRecord, right: SkillRecord): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function bindingsValidForCreate(input: CreateSkillRecord): boolean {
  return (
    input.skill.ownerId === input.context.ownerId &&
    input.event.aggregateType === "skill" &&
    input.event.aggregateId === input.skill.id &&
    input.event.sequence === 1 &&
    input.event.before === null &&
    JSON.stringify(input.event.after) === JSON.stringify(input.skill) &&
    input.event.actorId === input.context.actorId &&
    input.event.correlationId === input.context.correlationId &&
    input.event.idempotencyKey === input.context.idempotencyKey
  );
}

function bindingsValidForUpdate(input: UpdateSkillRecord): boolean {
  return (
    input.before.id === input.after.id &&
    input.before.ownerId === input.context.ownerId &&
    input.after.ownerId === input.context.ownerId &&
    input.after.version === input.before.version + 1 &&
    input.event.aggregateType === "skill" &&
    input.event.aggregateId === input.before.id &&
    input.event.sequence === input.after.version &&
    JSON.stringify(input.event.before) === JSON.stringify(input.before) &&
    JSON.stringify(input.event.after) === JSON.stringify(input.after) &&
    input.event.actorId === input.context.actorId &&
    input.event.correlationId === input.context.correlationId &&
    input.event.idempotencyKey === input.context.idempotencyKey
  );
}

function deterministicAuditId(input: {
  kind: string;
  ownerId: string;
  actorId: string;
  idempotencyKey: string;
}): string {
  const digest = createHash("sha256")
    .update(
      [input.kind, input.ownerId, input.actorId, input.idempotencyKey].join(
        "\u0000",
      ),
      "utf8",
    )
    .digest("hex");
  return `growth-audit-${digest}`;
}

function parseStoredLink<Link>(value: string | null): Link | null {
  if (value === null) return null;
  try {
    return JSON.parse(value) as Link;
  } catch {
    return null;
  }
}

export class SqliteSkillRepository implements SkillRepository {
  constructor(private readonly database: SqliteDatabase) {}

  async create(
    input: CreateSkillRecord,
  ): Promise<GrowthWriteResult<SkillRecord>> {
    if (!bindingsValidForCreate(input)) return { kind: "conflict" };

    const transaction = this.database.$client.transaction(() => {
      const existingAlias = this.database.$client
        .prepare(
          `SELECT id, owner_id, alias_slug, skill_id, sequence, action,
                  actor_id, reason, occurred_at, correlation_id,
                  idempotency_key
           FROM skill_alias_events
           WHERE owner_id = ? AND actor_id = ? AND idempotency_key = ?
           ORDER BY occurred_at DESC, id DESC
           LIMIT 1`,
        )
        .get(
          input.context.ownerId,
          input.context.actorId,
          input.context.idempotencyKey,
        ) as AliasEventRow | undefined;

      if (existingAlias !== undefined) {
        const existing = this.getByIdSync(
          input.context.ownerId,
          existingAlias.skill_id,
        );
        if (
          existing === null ||
          existingAlias.action !== "created" ||
          existingAlias.alias_slug !== input.skill.slug ||
          !sameCreateSemantics(existing, input.skill)
        ) {
          return { kind: "conflict" } as const;
        }
        return { kind: "idempotent", value: existing } as const;
      }

      this.database.$client
        .prepare(
          `INSERT INTO skills (
            id, owner_id, slug, name, description, status,
            merged_into_skill_id, created_at, updated_at, version
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          input.skill.id,
          input.skill.ownerId,
          input.skill.slug,
          input.skill.name,
          input.skill.description,
          input.skill.status,
          input.skill.mergedIntoSkillId,
          input.skill.createdAt,
          input.skill.updatedAt,
          input.skill.version,
        );
      this.insertAliasEvent({
        id: input.event.id,
        ownerId: input.skill.ownerId,
        aliasSlug: input.skill.slug,
        skillId: input.skill.id,
        sequence: 1,
        action: "created",
        actorId: input.event.actorId,
        reason: input.event.reason,
        occurredAt: input.event.occurredAt,
        correlationId: input.event.correlationId,
        idempotencyKey: input.event.idempotencyKey,
      });
      this.insertAudit({
        id: `growth-audit-${input.event.id}`,
        actor: input.event.actorId,
        action: input.event.action,
        entityType: "skill",
        entityId: input.skill.id,
        before: null,
        after: input.skill,
        reason: input.event.reason,
        occurredAt: input.event.occurredAt,
        correlationId: input.event.correlationId,
      });
      return { kind: "applied", value: input.skill } as const;
    });

    return transaction.immediate();
  }

  async getById(ownerId: string, skillId: string): Promise<SkillRecord | null> {
    return this.getByIdSync(ownerId, skillId);
  }

  async update(
    input: UpdateSkillRecord,
  ): Promise<GrowthWriteResult<SkillRecord>> {
    if (!bindingsValidForUpdate(input)) return { kind: "conflict" };
    if (
      input.event.action !== "skill.archive" &&
      input.event.action !== "skill.merge"
    ) {
      return { kind: "conflict" };
    }

    const transaction = this.database.$client.transaction(() => {
      const existingAlias = this.database.$client
        .prepare(
          `SELECT id, owner_id, alias_slug, skill_id, sequence, action,
                  actor_id, reason, occurred_at, correlation_id,
                  idempotency_key
           FROM skill_alias_events
           WHERE owner_id = ? AND actor_id = ? AND idempotency_key = ?
           ORDER BY sequence ASC
           LIMIT 1`,
        )
        .get(
          input.context.ownerId,
          input.context.actorId,
          input.context.idempotencyKey,
        ) as AliasEventRow | undefined;

      if (existingAlias !== undefined) {
        const current = this.getByIdSync(
          input.context.ownerId,
          input.before.id,
        );
        if (
          current === null ||
          existingAlias.alias_slug !== input.before.slug ||
          existingAlias.skill_id !== input.before.id ||
          existingAlias.action !== "revoked" ||
          !sameSkill(current, input.after) ||
          !this.replayRedirectMatches(input)
        ) {
          return { kind: "conflict" } as const;
        }
        return { kind: "idempotent", value: current } as const;
      }

      const current = this.getByIdSync(
        input.context.ownerId,
        input.before.id,
      );
      if (current === null || !sameSkill(current, input.before)) {
        return { kind: "conflict" } as const;
      }

      if (input.event.action === "skill.archive") {
        if (
          input.before.status !== "active" ||
          input.after.status !== "archived" ||
          input.after.mergedIntoSkillId !== null
        ) {
          return { kind: "conflict" } as const;
        }
      } else {
        if (
          input.before.status !== "active" ||
          input.after.status !== "merged" ||
          input.after.mergedIntoSkillId === null ||
          input.after.mergedIntoSkillId === input.before.id
        ) {
          return { kind: "conflict" } as const;
        }
        const target = this.getByIdSync(
          input.context.ownerId,
          input.after.mergedIntoSkillId,
        );
        if (target === null || target.status !== "active") {
          return { kind: "conflict" } as const;
        }
      }

      const update = this.database.$client
        .prepare(
          `UPDATE skills
           SET slug = ?, name = ?, description = ?, status = ?,
               merged_into_skill_id = ?, updated_at = ?, version = ?
           WHERE id = ? AND owner_id = ? AND version = ? AND updated_at = ?`,
        )
        .run(
          input.after.slug,
          input.after.name,
          input.after.description,
          input.after.status,
          input.after.mergedIntoSkillId,
          input.after.updatedAt,
          input.after.version,
          input.before.id,
          input.context.ownerId,
          input.before.version,
          input.before.updatedAt,
        );
      if (update.changes !== 1) return { kind: "conflict" } as const;

      const nextSequence = this.nextAliasSequence(
        input.context.ownerId,
        input.before.slug,
      );
      this.insertAliasEvent({
        id: `${input.event.id}:revoke`,
        ownerId: input.context.ownerId,
        aliasSlug: input.before.slug,
        skillId: input.before.id,
        sequence: nextSequence,
        action: "revoked",
        actorId: input.event.actorId,
        reason: input.event.reason,
        occurredAt: input.event.occurredAt,
        correlationId: input.event.correlationId,
        idempotencyKey: input.event.idempotencyKey,
      });

      if (
        input.event.action === "skill.merge" &&
        input.after.mergedIntoSkillId !== null
      ) {
        this.insertAliasEvent({
          id: `${input.event.id}:redirect`,
          ownerId: input.context.ownerId,
          aliasSlug: input.before.slug,
          skillId: input.after.mergedIntoSkillId,
          sequence: nextSequence + 1,
          action: "created",
          actorId: input.event.actorId,
          reason: input.event.reason,
          occurredAt: input.event.occurredAt,
          correlationId: input.event.correlationId,
          idempotencyKey: `${input.event.idempotencyKey}:redirect`,
        });
      }

      this.insertAudit({
        id: `growth-audit-${input.event.id}`,
        actor: input.event.actorId,
        action: input.event.action,
        entityType: "skill",
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

  async isMergeTargetInChain(input: {
    ownerId: string;
    sourceSkillId: string;
    targetSkillId: string;
  }): Promise<boolean> {
    let currentId: string | null = input.targetSkillId;
    const visited = new Set<string>();

    for (let depth = 0; depth < 100 && currentId !== null; depth += 1) {
      if (currentId === input.sourceSkillId) return true;
      if (visited.has(currentId)) return true;
      visited.add(currentId);

      const current = this.getByIdSync(input.ownerId, currentId);
      if (current === null) return true;
      currentId =
        current.status === "merged" ? current.mergedIntoSkillId : null;
    }

    return currentId !== null;
  }

  async linkGoal(input: {
    link: LearningGoalSkillLink;
    expectedGoalVersion: number;
    context: GrowthMutationContext;
  }): Promise<GrowthWriteResult<LearningGoalSkillLink>> {
    const auditId = deterministicAuditId({
      kind: "learning_goal_skill",
      ownerId: input.context.ownerId,
      actorId: input.context.actorId,
      idempotencyKey: input.context.idempotencyKey,
    });

    const transaction = this.database.$client.transaction(() => {
      const replay = this.readLinkReplay<LearningGoalSkillLink>(auditId);
      if (replay !== undefined) {
        return replay !== null &&
          JSON.stringify(replay) === JSON.stringify(input.link)
          ? ({ kind: "idempotent", value: replay } as const)
          : ({ kind: "conflict" } as const);
      }

      const goal = this.database.$client
        .prepare(
          `SELECT version
           FROM learning_goals
           WHERE id = ? AND owner_id = ?`,
        )
        .get(input.link.goalId, input.context.ownerId) as
        | { version: number }
        | undefined;
      if (goal === undefined || goal.version !== input.expectedGoalVersion) {
        return { kind: "conflict" } as const;
      }
      if (!this.isActiveOwnedSkill(input.context.ownerId, input.link.skillId)) {
        return { kind: "conflict" } as const;
      }

      const existingRow = this.database.$client
        .prepare(
          `SELECT goal_id, skill_id, desired_stage, created_at
           FROM learning_goal_skills
           WHERE goal_id = ? AND skill_id = ?`,
        )
        .get(input.link.goalId, input.link.skillId) as GoalSkillRow | undefined;
      const before =
        existingRow === undefined ? null : toGoalSkillLink(existingRow);

      if (existingRow === undefined) {
        this.database.$client
          .prepare(
            `INSERT INTO learning_goal_skills (
              goal_id, skill_id, desired_stage, created_at
            ) VALUES (?, ?, ?, ?)`,
          )
          .run(
            input.link.goalId,
            input.link.skillId,
            input.link.desiredStage,
            input.link.createdAt,
          );
      } else {
        this.database.$client
          .prepare(
            `UPDATE learning_goal_skills
             SET desired_stage = ?, created_at = ?
             WHERE goal_id = ? AND skill_id = ?`,
          )
          .run(
            input.link.desiredStage,
            input.link.createdAt,
            input.link.goalId,
            input.link.skillId,
          );
      }

      this.insertAudit({
        id: auditId,
        actor: input.context.actorId,
        action: "learning_goal_skill.link",
        entityType: "learning_goal_skill",
        entityId: `${input.link.goalId}:${input.link.skillId}`,
        before,
        after: input.link,
        reason: "Link skill to learning goal",
        occurredAt: input.link.createdAt,
        correlationId: input.context.correlationId,
      });
      return { kind: "applied", value: input.link } as const;
    });

    return transaction.immediate();
  }

  async linkCheckpoint(input: {
    link: LearningCheckpointSkillLink;
    expectedCheckpointVersion: number;
    context: GrowthMutationContext;
  }): Promise<GrowthWriteResult<LearningCheckpointSkillLink>> {
    const auditId = deterministicAuditId({
      kind: "learning_checkpoint_skill",
      ownerId: input.context.ownerId,
      actorId: input.context.actorId,
      idempotencyKey: input.context.idempotencyKey,
    });

    const transaction = this.database.$client.transaction(() => {
      const replay = this.readLinkReplay<LearningCheckpointSkillLink>(auditId);
      if (replay !== undefined) {
        return replay !== null &&
          JSON.stringify(replay) === JSON.stringify(input.link)
          ? ({ kind: "idempotent", value: replay } as const)
          : ({ kind: "conflict" } as const);
      }

      const checkpoint = this.database.$client
        .prepare(
          `SELECT checkpoint.version AS version
           FROM learning_checkpoints AS checkpoint
           INNER JOIN learning_goals AS goal ON goal.id = checkpoint.goal_id
           WHERE checkpoint.id = ? AND goal.owner_id = ?`,
        )
        .get(input.link.checkpointId, input.context.ownerId) as
        | { version: number }
        | undefined;
      if (
        checkpoint === undefined ||
        checkpoint.version !== input.expectedCheckpointVersion
      ) {
        return { kind: "conflict" } as const;
      }
      if (!this.isActiveOwnedSkill(input.context.ownerId, input.link.skillId)) {
        return { kind: "conflict" } as const;
      }

      const existingRow = this.database.$client
        .prepare(
          `SELECT checkpoint_id, skill_id, desired_stage, created_at
           FROM learning_checkpoint_skills
           WHERE checkpoint_id = ? AND skill_id = ?`,
        )
        .get(input.link.checkpointId, input.link.skillId) as
        | CheckpointSkillRow
        | undefined;
      const before =
        existingRow === undefined ? null : toCheckpointSkillLink(existingRow);

      if (existingRow === undefined) {
        this.database.$client
          .prepare(
            `INSERT INTO learning_checkpoint_skills (
              checkpoint_id, skill_id, desired_stage, created_at
            ) VALUES (?, ?, ?, ?)`,
          )
          .run(
            input.link.checkpointId,
            input.link.skillId,
            input.link.desiredStage,
            input.link.createdAt,
          );
      } else {
        this.database.$client
          .prepare(
            `UPDATE learning_checkpoint_skills
             SET desired_stage = ?, created_at = ?
             WHERE checkpoint_id = ? AND skill_id = ?`,
          )
          .run(
            input.link.desiredStage,
            input.link.createdAt,
            input.link.checkpointId,
            input.link.skillId,
          );
      }

      this.insertAudit({
        id: auditId,
        actor: input.context.actorId,
        action: "learning_checkpoint_skill.link",
        entityType: "learning_checkpoint_skill",
        entityId: `${input.link.checkpointId}:${input.link.skillId}`,
        before,
        after: input.link,
        reason: "Link skill to learning checkpoint",
        occurredAt: input.link.createdAt,
        correlationId: input.context.correlationId,
      });
      return { kind: "applied", value: input.link } as const;
    });

    return transaction.immediate();
  }

  private getByIdSync(ownerId: string, skillId: string): SkillRecord | null {
    const row = this.database.$client
      .prepare(
        `SELECT id, owner_id, slug, name, description, status,
                merged_into_skill_id, created_at, updated_at, version
         FROM skills
         WHERE id = ? AND owner_id = ?`,
      )
      .get(skillId, ownerId) as SkillRow | undefined;
    return row === undefined ? null : toSkill(row);
  }

  private replayRedirectMatches(input: UpdateSkillRecord): boolean {
    if (input.event.action === "skill.archive") {
      return input.after.status === "archived";
    }
    if (
      input.event.action !== "skill.merge" ||
      input.after.mergedIntoSkillId === null
    ) {
      return false;
    }
    const redirect = this.database.$client
      .prepare(
        `SELECT skill_id, action
         FROM skill_alias_events
         WHERE owner_id = ? AND alias_slug = ? AND idempotency_key = ?`,
      )
      .get(
        input.context.ownerId,
        input.before.slug,
        `${input.context.idempotencyKey}:redirect`,
      ) as { skill_id: string; action: "created" | "revoked" } | undefined;
    return (
      redirect !== undefined &&
      redirect.action === "created" &&
      redirect.skill_id === input.after.mergedIntoSkillId
    );
  }

  private nextAliasSequence(ownerId: string, aliasSlug: string): number {
    const row = this.database.$client
      .prepare(
        `SELECT COALESCE(MAX(sequence), 0) + 1 AS sequence
         FROM skill_alias_events
         WHERE owner_id = ? AND alias_slug = ?`,
      )
      .get(ownerId, aliasSlug) as { sequence: number };
    return row.sequence;
  }

  private isActiveOwnedSkill(ownerId: string, skillId: string): boolean {
    const row = this.database.$client
      .prepare(
        `SELECT status
         FROM skills
         WHERE id = ? AND owner_id = ?`,
      )
      .get(skillId, ownerId) as { status: SkillRecord["status"] } | undefined;
    return row?.status === "active";
  }

  private readLinkReplay<Link>(auditId: string): Link | null | undefined {
    const row = this.database.$client
      .prepare("SELECT after_json FROM audit_events WHERE id = ?")
      .get(auditId) as AuditRow | undefined;
    if (row === undefined) return undefined;
    return parseStoredLink<Link>(row.after_json);
  }

  private insertAliasEvent(input: {
    id: string;
    ownerId: string;
    aliasSlug: string;
    skillId: string;
    sequence: number;
    action: "created" | "revoked";
    actorId: string;
    reason: string;
    occurredAt: string;
    correlationId: string;
    idempotencyKey: string;
  }): void {
    this.database.$client
      .prepare(
        `INSERT INTO skill_alias_events (
          id, owner_id, alias_slug, skill_id, sequence, action, actor_id,
          reason, occurred_at, correlation_id, idempotency_key
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        input.id,
        input.ownerId,
        input.aliasSlug,
        input.skillId,
        input.sequence,
        input.action,
        input.actorId,
        input.reason,
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
