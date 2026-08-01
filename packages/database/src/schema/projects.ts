import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const projects = sqliteTable(
  "projects",
  {
    id: text("id").primaryKey(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    icon: text("icon"),
    status: text("status", { enum: ["planning", "active", "paused", "archived"] }).notNull(),
    health: text("health", { enum: ["healthy", "attention", "blocked", "unknown"] }).notNull(),
    priority: text("priority", { enum: ["critical", "high", "medium", "low"] }).notNull(),
    progressEstimate: integer("progress_estimate").notNull(),
    focus: text("focus").notNull(),
    nextAction: text("next_action").notNull(),
    branchSummary: text("branch_summary"),
    statusBasis: text("status_basis").notNull(),
    confidence: text("confidence", { enum: ["high", "medium", "low"] }).notNull(),
    visibility: text("visibility", { enum: ["private", "unlisted", "public"] }).notNull(),
    publicSummary: text("public_summary"),
    privateSummary: text("private_summary"),
    publicProgress: integer("public_progress"),
    featured: integer("featured", { mode: "boolean" }).notNull(),
    coverAssetId: text("cover_asset_id"),
    liveUrl: text("live_url"),
    documentationUrl: text("documentation_url"),
    lastActivityAt: text("last_activity_at"),
    lastSyncedAt: text("last_synced_at"),
    manualLock: integer("manual_lock", { mode: "boolean" }).notNull(),
    dataSource: text("data_source", {
      enum: ["manual", "github", "mcp", "migration", "seed_demo"],
    }).notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("projects_slug_unique").on(table.slug),
    index("idx_projects_active").on(table.status, table.priority, table.updatedAt),
    index("idx_projects_visibility").on(table.visibility, table.featured, table.updatedAt),
  ],
);

export const repositories = sqliteTable(
  "repositories",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id").references(() => projects.id, { onDelete: "set null" }),
    owner: text("owner").notNull(),
    name: text("name").notNull(),
    fullName: text("full_name").notNull(),
    role: text("role", {
      enum: ["product", "core", "integration", "infrastructure", "academic", "experiment"],
    }).notNull(),
    visibility: text("visibility", { enum: ["public", "private"] }).notNull(),
    status: text("status", { enum: ["active", "paused", "historical", "experiment"] }).notNull(),
    defaultBranch: text("default_branch").notNull(),
    activeBranch: text("active_branch"),
    githubUrl: text("github_url").notNull(),
    githubNodeId: text("github_node_id"),
    syncEnabled: integer("sync_enabled", { mode: "boolean" }).notNull(),
    lastSyncedAt: text("last_synced_at"),
    dataSource: text("data_source", {
      enum: ["manual", "github", "mcp", "migration", "seed_demo"],
    }).notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("repositories_full_name_unique").on(table.fullName),
    index("idx_repositories_project").on(table.projectId, table.status),
  ],
);
