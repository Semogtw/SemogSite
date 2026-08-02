import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { projects } from "./projects";

export const workstreams = sqliteTable(
  "workstreams",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    status: text("status", {
      enum: ["planned", "active", "validating", "blocked", "operational", "completed"],
    }).notNull(),
    priority: text("priority", { enum: ["critical", "high", "medium", "low"] }).notNull(),
    branch: text("branch"),
    currentDelivery: text("current_delivery").notNull(),
    nextGate: text("next_gate").notNull(),
    testsSummary: text("tests_summary").notNull(),
    evidenceSummary: text("evidence_summary").notNull(),
    lastSignalAt: text("last_signal_at"),
    dataSource: text("data_source", {
      enum: ["manual", "github", "mcp", "migration", "seed_demo"],
    }).notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    index("idx_workstreams_project_status").on(
      table.projectId,
      table.status,
      table.priority,
    ),
  ],
);

export const stages = sqliteTable(
  "stages",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    workstreamId: text("workstream_id").references(() => workstreams.id, {
      onDelete: "set null",
    }),
    orderIndex: integer("order_index").notNull(),
    title: text("title").notNull(),
    area: text("area", {
      enum: ["planning", "implementation", "integration", "validation", "release", "operation"],
    }).notNull(),
    state: text("state", {
      enum: ["backlog", "next", "in_progress", "blocked", "completed"],
    }).notNull(),
    progress: integer("progress").notNull(),
    plannedResult: text("planned_result").notNull(),
    currentPosition: text("current_position").notNull(),
    nextStep: text("next_step"),
    blocker: text("blocker"),
    evidenceSummary: text("evidence_summary"),
    done: integer("done", { mode: "boolean" }).notNull(),
    manualLock: integer("manual_lock", { mode: "boolean" }).notNull(),
    updatedFrom: text("updated_from", {
      enum: ["manual", "github", "mcp", "migration", "seed_demo"],
    }).notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    index("idx_stages_project_order").on(table.projectId, table.orderIndex),
    index("idx_stages_state").on(table.state, table.updatedAt),
  ],
);
