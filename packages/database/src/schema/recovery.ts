import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { projects, repositories } from "./projects";
import { cooperativeRuns } from "./runs";

export const recoverySnapshots = sqliteTable(
  "recovery_snapshots",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "restrict" }),
    repositoryId: text("repository_id")
      .notNull()
      .references(() => repositories.id, { onDelete: "restrict" }),
    runId: text("run_id").references(() => cooperativeRuns.id, {
      onDelete: "set null",
    }),
    branch: text("branch").notNull(),
    observedCommitSha: text("observed_commit_sha").notNull(),
    schemaVersion: integer("schema_version").notNull(),
    generatedAt: text("generated_at").notNull(),
    sourceObservedAt: text("source_observed_at").notNull(),
    confidence: text("confidence", {
      enum: ["high", "medium", "low"],
    }).notNull(),
    canonicalJson: text("canonical_json").notNull(),
    canonicalHash: text("canonical_hash").notNull(),
    markdown: text("markdown").notNull(),
    templateId: text("template_id").notNull(),
    templateVersion: integer("template_version").notNull(),
    createdBy: text("created_by").notNull(),
    source: text("source", { enum: ["manual", "agent"] }).notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    correlationId: text("correlation_id").notNull(),
  },
  (table) => [
    uniqueIndex("recovery_snapshots_canonical_hash_unique").on(
      table.canonicalHash,
    ),
    uniqueIndex("recovery_snapshots_actor_idempotency_unique").on(
      table.createdBy,
      table.idempotencyKey,
    ),
    index("idx_recovery_snapshots_repository").on(
      table.repositoryId,
      table.generatedAt,
    ),
    index("idx_recovery_snapshots_project").on(
      table.projectId,
      table.generatedAt,
    ),
    index("idx_recovery_snapshots_run").on(
      table.runId,
      table.generatedAt,
    ),
    index("idx_recovery_snapshots_correlation").on(
      table.correlationId,
      table.generatedAt,
    ),
  ],
);
