import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { developmentSessions } from "./operations";
import { projects } from "./projects";

export const mediaAssets = sqliteTable("media_assets", {
  id: text("id").primaryKey(),
  kind: text("kind", { enum: ["image", "video", "document", "external_embed"] }).notNull(),
  storageKey: text("storage_key"),
  externalUrl: text("external_url"),
  altText: text("alt_text").notNull(),
  caption: text("caption"),
  visibility: text("visibility", { enum: ["private", "unlisted", "public"] }).notNull(),
  width: integer("width"),
  height: integer("height"),
  createdAt: text("created_at").notNull(),
});

export const publications = sqliteTable(
  "publications",
  {
    id: text("id").primaryKey(),
    slug: text("slug").notNull(),
    title: text("title").notNull(),
    type: text("type", {
      enum: ["technical_note", "case_study", "retrospective", "decision", "changelog", "tutorial"],
    }).notNull(),
    status: text("status", {
      enum: ["private_draft", "review", "scheduled", "published", "archived"],
    }).notNull(),
    visibility: text("visibility", { enum: ["private", "unlisted", "public"] }).notNull(),
    excerpt: text("excerpt").notNull(),
    bodyMarkdown: text("body_markdown").notNull(),
    projectId: text("project_id").references(() => projects.id, { onDelete: "set null" }),
    coverAssetId: text("cover_asset_id").references(() => mediaAssets.id, {
      onDelete: "set null",
    }),
    publishedAt: text("published_at"),
    generatedFromSessionId: text("generated_from_session_id").references(
      () => developmentSessions.id,
      { onDelete: "set null" },
    ),
    approvedByOwner: integer("approved_by_owner", { mode: "boolean" }).notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("publications_slug_unique").on(table.slug),
    index("idx_publications_public").on(
      table.status,
      table.visibility,
      table.publishedAt,
    ),
  ],
);

export const timelineEntries = sqliteTable("timeline_entries", {
  id: text("id").primaryKey(),
  entryDate: text("entry_date").notNull(),
  title: text("title").notNull(),
  summary: text("summary").notNull(),
  kind: text("kind", {
    enum: ["education", "project", "milestone", "work", "learning", "release"],
  }).notNull(),
  visibility: text("visibility", { enum: ["private", "unlisted", "public"] }).notNull(),
  projectId: text("project_id").references(() => projects.id, { onDelete: "set null" }),
  orderIndex: integer("order_index").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});
