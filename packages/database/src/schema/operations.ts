import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { projects, repositories } from "./projects";
import { stages } from "./roadmap";

export const attentionItems = sqliteTable(
  "attention_items",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id").references(() => projects.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    status: text("status", { enum: ["open", "monitoring", "resolved", "dismissed"] }).notNull(),
    impact: text("impact", { enum: ["high", "medium", "low"] }).notNull(),
    type: text("type", {
      enum: ["risk", "blocker", "decision", "local_test", "external_dependency", "technical_debt", "security"],
    }).notNull(),
    owner: text("owner", { enum: ["owner", "gpt", "external_environment", "shared"] }).notNull(),
    nextAction: text("next_action").notNull(),
    sourceUrl: text("source_url"),
    resolvedAt: text("resolved_at"),
    dataSource: text("data_source", {
      enum: ["manual", "github", "mcp", "migration", "seed_demo"],
    }).notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    index("idx_attention_open").on(table.status, table.impact, table.owner, table.updatedAt),
  ],
);

export const developmentSessions = sqliteTable(
  "development_sessions",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id").references(() => projects.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    sessionDate: text("session_date").notNull(),
    actor: text("actor").notNull(),
    branch: text("branch"),
    commitsJson: text("commits_json").notNull(),
    completedSummary: text("completed_summary").notNull(),
    testsStatus: text("tests_status", {
      enum: ["not_run", "partial", "passed", "failed", "blocked"],
    }).notNull(),
    testsSummary: text("tests_summary").notNull(),
    blockers: text("blockers").notNull(),
    nextStep: text("next_step").notNull(),
    result: text("result", {
      enum: ["significant", "partial", "maintenance", "no_change", "failed"],
    }).notNull(),
    sourceUrl: text("source_url"),
    automatic: integer("automatic", { mode: "boolean" }).notNull(),
    sourceHash: text("source_hash"),
    dataSource: text("data_source", {
      enum: ["manual", "github", "mcp", "migration", "seed_demo"],
    }).notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("development_sessions_source_hash_unique").on(table.sourceHash),
    index("idx_sessions_project_date").on(table.projectId, table.sessionDate),
  ],
);

export const evidence = sqliteTable(
  "evidence",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    stageId: text("stage_id").references(() => stages.id, { onDelete: "set null" }),
    sessionId: text("session_id").references(() => developmentSessions.id, {
      onDelete: "set null",
    }),
    repositoryId: text("repository_id").references(() => repositories.id, {
      onDelete: "set null",
    }),
    kind: text("kind", {
      enum: ["commit", "pull_request", "issue", "workflow_run", "test", "document", "manual_note"],
    }).notNull(),
    title: text("title").notNull(),
    url: text("url"),
    externalId: text("external_id"),
    status: text("status", {
      enum: ["observed", "passed", "failed", "pending", "superseded"],
    }).notNull(),
    summary: text("summary").notNull(),
    occurredAt: text("occurred_at").notNull(),
    capturedAt: text("captured_at").notNull(),
    sourceHash: text("source_hash"),
    dataSource: text("data_source", {
      enum: ["manual", "github", "mcp", "migration", "seed_demo"],
    }).notNull(),
  },
  (table) => [
    uniqueIndex("evidence_kind_external_unique").on(table.kind, table.externalId),
    index("idx_evidence_stage").on(table.stageId, table.occurredAt),
    index("idx_evidence_project").on(table.projectId, table.occurredAt),
  ],
);
