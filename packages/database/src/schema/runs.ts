import {
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { projects } from "./projects";

export const cooperativeRuns = sqliteTable(
  "cooperative_runs",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id").references(() => projects.id, {
      onDelete: "set null",
    }),
    title: text("title").notNull(),
    actorLabel: text("actor_label").notNull(),
    origin: text("origin", {
      enum: ["chatgpt", "codex", "manual", "automation", "other"],
    }).notNull(),
    status: text("status", {
      enum: ["running", "blocked", "completed", "failed", "cancelled"],
    }).notNull(),
    phase: text("phase"),
    progress: integer("progress").notNull(),
    branch: text("branch"),
    summary: text("summary").notNull(),
    blocker: text("blocker"),
    nextAction: text("next_action"),
    startedAt: text("started_at").notNull(),
    lastHeartbeatAt: text("last_heartbeat_at").notNull(),
    finishedAt: text("finished_at"),
    staleAfterSeconds: integer("stale_after_seconds").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    index("idx_cooperative_runs_project").on(
      table.projectId,
      table.status,
      table.updatedAt,
    ),
    index("idx_cooperative_runs_freshness").on(
      table.status,
      table.lastHeartbeatAt,
      table.staleAfterSeconds,
    ),
  ],
);

export const cooperativeRunEvents = sqliteTable(
  "cooperative_run_events",
  {
    id: text("id").primaryKey(),
    runId: text("run_id")
      .notNull()
      .references(() => cooperativeRuns.id, { onDelete: "cascade" }),
    sequence: integer("sequence").notNull(),
    kind: text("kind", {
      enum: [
        "run.registered",
        "run.heartbeat",
        "run.checkpoint",
        "run.blocked",
        "run.resumed",
        "run.completed",
        "run.failed",
        "run.cancelled",
        "run.command_queued",
        "run.command_acknowledged",
        "run.command_completed",
        "run.command_rejected",
      ],
    }).notNull(),
    actor: text("actor").notNull(),
    source: text("source", {
      enum: ["chatgpt", "codex", "manual", "automation", "other"],
    }).notNull(),
    summary: text("summary").notNull(),
    beforeJson: text("before_json"),
    afterJson: text("after_json"),
    occurredAt: text("occurred_at").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    correlationId: text("correlation_id").notNull(),
  },
  (table) => [
    uniqueIndex("cooperative_run_events_sequence_unique").on(
      table.runId,
      table.sequence,
    ),
    uniqueIndex("cooperative_run_events_idempotency_unique").on(
      table.runId,
      table.idempotencyKey,
    ),
    index("idx_cooperative_run_events_history").on(
      table.runId,
      table.sequence,
    ),
    index("idx_cooperative_run_events_correlation").on(
      table.correlationId,
      table.occurredAt,
    ),
  ],
);

export const cooperativeRunCheckpoints = sqliteTable(
  "cooperative_run_checkpoints",
  {
    id: text("id").primaryKey(),
    runId: text("run_id")
      .notNull()
      .references(() => cooperativeRuns.id, { onDelete: "cascade" }),
    eventId: text("event_id")
      .notNull()
      .references(() => cooperativeRunEvents.id, { onDelete: "cascade" }),
    sequence: integer("sequence").notNull(),
    phase: text("phase"),
    progress: integer("progress").notNull(),
    branch: text("branch"),
    summary: text("summary").notNull(),
    commitsJson: text("commits_json").notNull(),
    testsStatus: text("tests_status", {
      enum: ["not_run", "partial", "passed", "failed", "blocked"],
    }).notNull(),
    testsSummary: text("tests_summary").notNull(),
    blockers: text("blockers").notNull(),
    nextStep: text("next_step").notNull(),
    capturedAt: text("captured_at").notNull(),
    sourceHash: text("source_hash"),
  },
  (table) => [
    uniqueIndex("cooperative_run_checkpoints_event_unique").on(table.eventId),
    uniqueIndex("cooperative_run_checkpoints_sequence_unique").on(
      table.runId,
      table.sequence,
    ),
    uniqueIndex("cooperative_run_checkpoints_source_hash_unique").on(
      table.sourceHash,
    ),
    index("idx_cooperative_run_checkpoints_recent").on(
      table.runId,
      table.capturedAt,
    ),
  ],
);

export const cooperativeRunCommands = sqliteTable(
  "cooperative_run_commands",
  {
    id: text("id").primaryKey(),
    runId: text("run_id")
      .notNull()
      .references(() => cooperativeRuns.id, { onDelete: "cascade" }),
    kind: text("kind", {
      enum: [
        "continue",
        "pause",
        "cancel",
        "reprioritize",
        "request_checkpoint",
        "provide_context",
      ],
    }).notNull(),
    status: text("status", {
      enum: ["queued", "acknowledged", "completed", "rejected", "expired"],
    }).notNull(),
    summary: text("summary").notNull(),
    payloadJson: text("payload_json").notNull(),
    reason: text("reason"),
    queuedBy: text("queued_by").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    correlationId: text("correlation_id").notNull(),
    queuedAt: text("queued_at").notNull(),
    acknowledgedAt: text("acknowledged_at"),
    completedAt: text("completed_at"),
    expiresAt: text("expires_at"),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("cooperative_run_commands_idempotency_unique").on(
      table.runId,
      table.idempotencyKey,
    ),
    index("idx_cooperative_run_commands_queue").on(
      table.status,
      table.queuedAt,
    ),
    index("idx_cooperative_run_commands_run").on(
      table.runId,
      table.status,
      table.queuedAt,
    ),
  ],
);
