import {
  type AnySQLiteColumn,
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const learningGoals = sqliteTable(
  "learning_goals",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id").notNull(),
    slug: text("slug").notNull(),
    title: text("title").notNull(),
    description: text("description").notNull(),
    motivation: text("motivation"),
    status: text("status", {
      enum: ["draft", "active", "paused", "completed", "cancelled", "archived"],
    }).notNull(),
    priority: text("priority", {
      enum: ["critical", "high", "medium", "low"],
    }).notNull(),
    targetDate: text("target_date"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    version: integer("version").notNull(),
  },
  (table) => [
    uniqueIndex("learning_goals_owner_slug_unique").on(
      table.ownerId,
      table.slug,
    ),
    index("idx_learning_goals_owner_status").on(
      table.ownerId,
      table.status,
      table.priority,
      table.updatedAt,
    ),
    index("idx_learning_goals_target_date").on(
      table.ownerId,
      table.targetDate,
      table.status,
    ),
  ],
);

export const learningGoalEvents = sqliteTable(
  "learning_goal_events",
  {
    id: text("id").primaryKey(),
    goalId: text("goal_id")
      .notNull()
      .references(() => learningGoals.id, { onDelete: "restrict" }),
    sequence: integer("sequence").notNull(),
    action: text("action").notNull(),
    beforeJson: text("before_json"),
    afterJson: text("after_json").notNull(),
    reason: text("reason").notNull(),
    actorId: text("actor_id").notNull(),
    occurredAt: text("occurred_at").notNull(),
    correlationId: text("correlation_id").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
  },
  (table) => [
    uniqueIndex("learning_goal_events_goal_sequence_unique").on(
      table.goalId,
      table.sequence,
    ),
    uniqueIndex("learning_goal_events_goal_idempotency_unique").on(
      table.goalId,
      table.idempotencyKey,
    ),
    index("idx_learning_goal_events_goal").on(
      table.goalId,
      table.sequence,
    ),
  ],
);

export const learningCheckpoints = sqliteTable(
  "learning_checkpoints",
  {
    id: text("id").primaryKey(),
    goalId: text("goal_id")
      .notNull()
      .references(() => learningGoals.id, { onDelete: "restrict" }),
    title: text("title").notNull(),
    description: text("description").notNull(),
    status: text("status", {
      enum: ["pending", "in_progress", "completed", "waived", "cancelled"],
    }).notNull(),
    required: integer("required", { mode: "boolean" }).notNull(),
    sequence: integer("sequence").notNull(),
    weight: integer("weight").notNull(),
    weightMode: text("weight_mode", {
      enum: ["automatic", "custom"],
    }).notNull(),
    completionMode: text("completion_mode", {
      enum: ["binary", "numeric"],
    }).notNull(),
    numericUnit: text("numeric_unit"),
    numericTarget: real("numeric_target"),
    acceptedValue: real("accepted_value"),
    dueDate: text("due_date"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    version: integer("version").notNull(),
  },
  (table) => [
    uniqueIndex("learning_checkpoints_goal_sequence_unique").on(
      table.goalId,
      table.sequence,
    ),
    index("idx_learning_checkpoints_goal_sequence").on(
      table.goalId,
      table.sequence,
    ),
    index("idx_learning_checkpoints_due").on(
      table.dueDate,
      table.status,
    ),
  ],
);

export const learningCheckpointEvents = sqliteTable(
  "learning_checkpoint_events",
  {
    id: text("id").primaryKey(),
    checkpointId: text("checkpoint_id")
      .notNull()
      .references(() => learningCheckpoints.id, { onDelete: "restrict" }),
    sequence: integer("sequence").notNull(),
    action: text("action").notNull(),
    beforeJson: text("before_json"),
    afterJson: text("after_json").notNull(),
    reason: text("reason").notNull(),
    actorId: text("actor_id").notNull(),
    occurredAt: text("occurred_at").notNull(),
    correlationId: text("correlation_id").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
  },
  (table) => [
    uniqueIndex("learning_checkpoint_events_checkpoint_sequence_unique").on(
      table.checkpointId,
      table.sequence,
    ),
    uniqueIndex(
      "learning_checkpoint_events_checkpoint_idempotency_unique",
    ).on(table.checkpointId, table.idempotencyKey),
    index("idx_learning_checkpoint_events_checkpoint").on(
      table.checkpointId,
      table.sequence,
    ),
  ],
);

export const skills = sqliteTable(
  "skills",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id").notNull(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    description: text("description").notNull(),
    status: text("status", {
      enum: ["active", "archived", "merged"],
    }).notNull(),
    mergedIntoSkillId: text("merged_into_skill_id").references(
      (): AnySQLiteColumn => skills.id,
      { onDelete: "restrict" },
    ),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    version: integer("version").notNull(),
  },
  (table) => [
    uniqueIndex("skills_owner_slug_unique").on(table.ownerId, table.slug),
    index("idx_skills_owner_status").on(
      table.ownerId,
      table.status,
      table.name,
    ),
  ],
);

export const skillAliasEvents = sqliteTable(
  "skill_alias_events",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id").notNull(),
    aliasSlug: text("alias_slug").notNull(),
    skillId: text("skill_id")
      .notNull()
      .references(() => skills.id, { onDelete: "restrict" }),
    sequence: integer("sequence").notNull(),
    action: text("action", { enum: ["created", "revoked"] }).notNull(),
    actorId: text("actor_id").notNull(),
    reason: text("reason").notNull(),
    occurredAt: text("occurred_at").notNull(),
    correlationId: text("correlation_id").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
  },
  (table) => [
    uniqueIndex("skill_alias_events_alias_sequence_unique").on(
      table.ownerId,
      table.aliasSlug,
      table.sequence,
    ),
    uniqueIndex("skill_alias_events_alias_idempotency_unique").on(
      table.ownerId,
      table.aliasSlug,
      table.idempotencyKey,
    ),
    index("idx_skill_alias_events_lookup").on(
      table.ownerId,
      table.aliasSlug,
      table.sequence,
    ),
  ],
);

export const learningGoalSkills = sqliteTable(
  "learning_goal_skills",
  {
    goalId: text("goal_id")
      .notNull()
      .references(() => learningGoals.id, { onDelete: "restrict" }),
    skillId: text("skill_id")
      .notNull()
      .references(() => skills.id, { onDelete: "restrict" }),
    desiredStage: text("desired_stage", {
      enum: ["introduced", "practicing", "applied", "demonstrated"],
    }).notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [primaryKey({ columns: [table.goalId, table.skillId] })],
);

export const learningCheckpointSkills = sqliteTable(
  "learning_checkpoint_skills",
  {
    checkpointId: text("checkpoint_id")
      .notNull()
      .references(() => learningCheckpoints.id, { onDelete: "restrict" }),
    skillId: text("skill_id")
      .notNull()
      .references(() => skills.id, { onDelete: "restrict" }),
    desiredStage: text("desired_stage", {
      enum: ["introduced", "practicing", "applied", "demonstrated"],
    }).notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.checkpointId, table.skillId] }),
  ],
);
