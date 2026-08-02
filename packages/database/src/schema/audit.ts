import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const syncRuns = sqliteTable(
  "sync_runs",
  {
    id: text("id").primaryKey(),
    integration: text("integration", {
      enum: ["legacy", "github", "notion", "migration", "mcp"],
    }).notNull(),
    scope: text("scope").notNull(),
    trigger: text("trigger", {
      enum: ["manual", "scheduled_work", "webhook", "mcp", "migration"],
    }).notNull(),
    startedAt: text("started_at").notNull(),
    finishedAt: text("finished_at"),
    status: text("status", {
      enum: ["running", "success", "partial", "failed"],
    }).notNull(),
    repositoriesChecked: integer("repositories_checked").notNull(),
    changesApplied: integer("changes_applied").notNull(),
    createdCount: integer("created_count").notNull(),
    updatedCount: integer("updated_count").notNull(),
    skippedCount: integer("skipped_count").notNull(),
    errorCount: integer("error_count").notNull(),
    warningsJson: text("warnings_json").notNull(),
    errorSummary: text("error_summary"),
    cursor: text("cursor"),
    rateLimitRemaining: integer("rate_limit_remaining"),
    rateLimitResetAt: text("rate_limit_reset_at"),
    metadataJson: text("metadata_json").notNull(),
  },
  (table) => [
    index("idx_sync_runs_started").on(table.startedAt),
    index("idx_sync_runs_integration_started").on(
      table.integration,
      table.startedAt,
    ),
  ],
);

export const auditEvents = sqliteTable(
  "audit_events",
  {
    id: text("id").primaryKey(),
    actor: text("actor").notNull(),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    beforeJson: text("before_json"),
    afterJson: text("after_json"),
    reason: text("reason"),
    occurredAt: text("occurred_at").notNull(),
    source: text("source").notNull(),
    confirmed: integer("confirmed", { mode: "boolean" }).notNull(),
    correlationId: text("correlation_id").notNull(),
  },
  (table) => [
    index("idx_audit_entity").on(table.entityType, table.entityId, table.occurredAt),
    index("idx_audit_correlation").on(table.correlationId),
  ],
);

export const appSettings = sqliteTable("app_settings", {
  key: text("key").primaryKey(),
  valueJson: text("value_json").notNull(),
  updatedAt: text("updated_at").notNull(),
});
