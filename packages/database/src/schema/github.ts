import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { repositories } from "./projects";

export const syncRuns = sqliteTable(
  "sync_runs",
  {
    id: text("id").primaryKey(),
    integration: text("integration", {
      enum: ["notion", "github", "manual", "migration"],
    }).notNull(),
    scope: text("scope").notNull(),
    status: text("status", {
      enum: ["running", "success", "partial", "failed"],
    }).notNull(),
    startedAt: text("started_at").notNull(),
    finishedAt: text("finished_at"),
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
  (table) => [index("idx_sync_runs_integration").on(table.integration, table.startedAt)],
);

export const githubRepositoryObservations = sqliteTable(
  "github_repository_observations",
  {
    id: text("id").primaryKey(),
    syncRunId: text("sync_run_id")
      .notNull()
      .references(() => syncRuns.id, { onDelete: "cascade" }),
    repositoryId: text("repository_id")
      .notNull()
      .references(() => repositories.id, { onDelete: "cascade" }),
    githubNodeId: text("github_node_id").notNull(),
    fullName: text("full_name").notNull(),
    visibility: text("visibility", { enum: ["public", "private"] }).notNull(),
    defaultBranch: text("default_branch").notNull(),
    htmlUrl: text("html_url").notNull(),
    archived: integer("archived", { mode: "boolean" }).notNull(),
    pushedAt: text("pushed_at"),
    providerUpdatedAt: text("provider_updated_at").notNull(),
    observedAt: text("observed_at").notNull(),
    apiVersion: text("api_version").notNull(),
    etag: text("etag"),
    rateLimitRemaining: integer("rate_limit_remaining"),
    rateLimitResetAt: text("rate_limit_reset_at"),
    branchesTruncated: integer("branches_truncated", { mode: "boolean" }).notNull(),
    sourceHash: text("source_hash").notNull(),
  },
  (table) => [
    uniqueIndex("github_repository_observations_source_hash_unique").on(
      table.sourceHash,
    ),
    index("idx_github_repository_observations_latest").on(
      table.repositoryId,
      table.observedAt,
    ),
    index("idx_github_repository_observations_run").on(
      table.syncRunId,
      table.repositoryId,
    ),
  ],
);

export const githubBranchObservations = sqliteTable(
  "github_branch_observations",
  {
    id: text("id").primaryKey(),
    repositoryObservationId: text("repository_observation_id")
      .notNull()
      .references(() => githubRepositoryObservations.id, { onDelete: "cascade" }),
    repositoryId: text("repository_id")
      .notNull()
      .references(() => repositories.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    headSha: text("head_sha").notNull(),
    committedAt: text("committed_at").notNull(),
    protected: integer("protected", { mode: "boolean" }).notNull(),
    isDefault: integer("is_default", { mode: "boolean" }).notNull(),
    observedAt: text("observed_at").notNull(),
    sourceHash: text("source_hash").notNull(),
  },
  (table) => [
    uniqueIndex("github_branch_observations_source_hash_unique").on(
      table.sourceHash,
    ),
    index("idx_github_branch_observations_latest").on(
      table.repositoryId,
      table.name,
      table.observedAt,
    ),
    index("idx_github_branch_observations_parent").on(
      table.repositoryObservationId,
      table.committedAt,
    ),
  ],
);

export const githubBranchRecommendations = sqliteTable(
  "github_branch_recommendations",
  {
    id: text("id").primaryKey(),
    repositoryObservationId: text("repository_observation_id")
      .notNull()
      .references(() => githubRepositoryObservations.id, { onDelete: "cascade" }),
    repositoryId: text("repository_id")
      .notNull()
      .references(() => repositories.id, { onDelete: "cascade" }),
    status: text("status", { enum: ["unavailable", "recommended"] }).notNull(),
    branch: text("branch"),
    confidence: text("confidence", { enum: ["high", "medium", "low"] }).notNull(),
    reason: text("reason").notNull(),
    warningsJson: text("warnings_json").notNull(),
    evidenceJson: text("evidence_json").notNull(),
    observedAt: text("observed_at").notNull(),
    sourceHash: text("source_hash").notNull(),
  },
  (table) => [
    uniqueIndex("github_branch_recommendations_observation_unique").on(
      table.repositoryObservationId,
    ),
    uniqueIndex("github_branch_recommendations_source_hash_unique").on(
      table.sourceHash,
    ),
    index("idx_github_branch_recommendations_latest").on(
      table.repositoryId,
      table.observedAt,
    ),
  ],
);
