import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

const editorialKinds = ["project", "note", "experiment", "page"] as const;
const editorialWorkflowStatuses = ["draft", "in_review", "approved"] as const;
const editorialPublicationStatuses = [
  "unpublished",
  "published",
  "withdrawn",
] as const;
const editorialEventKinds = [
  "editorial.document_created",
  "editorial.revision_created",
  "editorial.submitted_for_review",
  "editorial.reopened_as_draft",
  "editorial.approved",
  "editorial.published",
  "editorial.withdrawn",
  "editorial.rolled_back",
] as const;

export const editorialDocuments = sqliteTable(
  "editorial_documents",
  {
    id: text("id").primaryKey(),
    kind: text("kind", { enum: editorialKinds }).notNull(),
    slug: text("slug").notNull(),
    workflowStatus: text("workflow_status", {
      enum: editorialWorkflowStatuses,
    }).notNull(),
    publicationStatus: text("publication_status", {
      enum: editorialPublicationStatuses,
    }).notNull(),
    workingRevisionId: text("working_revision_id").notNull(),
    approvedRevisionId: text("approved_revision_id"),
    publishedRevisionId: text("published_revision_id"),
    lastPublishedRevisionId: text("last_published_revision_id"),
    version: integer("version").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("editorial_documents_slug_unique").on(table.slug),
    index("editorial_documents_workflow_status_index").on(
      table.workflowStatus,
      table.updatedAt,
    ),
    index("editorial_documents_publication_status_index").on(
      table.publicationStatus,
      table.updatedAt,
    ),
    check("editorial_documents_version_positive", sql`${table.version} >= 1`),
    check(
      "editorial_documents_approval_pointer_consistent",
      sql`(
        (${table.workflowStatus} = 'approved' AND ${table.approvedRevisionId} = ${table.workingRevisionId})
        OR (${table.workflowStatus} <> 'approved' AND ${table.approvedRevisionId} IS NULL)
      )`,
    ),
    check(
      "editorial_documents_publication_pointer_consistent",
      sql`(
        (${table.publicationStatus} = 'published' AND ${table.publishedRevisionId} IS NOT NULL)
        OR (${table.publicationStatus} <> 'published' AND ${table.publishedRevisionId} IS NULL)
      )`,
    ),
  ],
);

export const editorialRevisions = sqliteTable(
  "editorial_revisions",
  {
    id: text("id").primaryKey(),
    documentId: text("document_id")
      .notNull()
      .references(() => editorialDocuments.id, { onDelete: "restrict" }),
    sequence: integer("sequence").notNull(),
    title: text("title").notNull(),
    excerpt: text("excerpt").notNull(),
    bodyMarkdown: text("body_markdown").notNull(),
    tagsJson: text("tags_json").notNull(),
    contentHash: text("content_hash").notNull(),
    createdBy: text("created_by").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    uniqueIndex("editorial_revisions_document_sequence_unique").on(
      table.documentId,
      table.sequence,
    ),
    index("editorial_revisions_document_created_index").on(
      table.documentId,
      table.createdAt,
    ),
    index("editorial_revisions_content_hash_index").on(
      table.documentId,
      table.contentHash,
    ),
    check("editorial_revisions_sequence_positive", sql`${table.sequence} >= 1`),
    check(
      "editorial_revisions_hash_length",
      sql`length(${table.contentHash}) = 64`,
    ),
  ],
);

export const editorialReviews = sqliteTable(
  "editorial_reviews",
  {
    id: text("id").primaryKey(),
    documentId: text("document_id")
      .notNull()
      .references(() => editorialDocuments.id, { onDelete: "restrict" }),
    revisionId: text("revision_id")
      .notNull()
      .references(() => editorialRevisions.id, { onDelete: "restrict" }),
    contentHash: text("content_hash").notNull(),
    reviewerId: text("reviewer_id").notNull(),
    reason: text("reason").notNull(),
    notes: text("notes"),
    credentialsReviewed: integer("credentials_reviewed", {
      mode: "boolean",
    }).notNull(),
    personalDataReviewed: integer("personal_data_reviewed", {
      mode: "boolean",
    }).notNull(),
    operationalMetadataReviewed: integer("operational_metadata_reviewed", {
      mode: "boolean",
    }).notNull(),
    externalLinksReviewed: integer("external_links_reviewed", {
      mode: "boolean",
    }).notNull(),
    legalAttributionReviewed: integer("legal_attribution_reviewed", {
      mode: "boolean",
    }).notNull(),
    factualClaimsReviewed: integer("factual_claims_reviewed", {
      mode: "boolean",
    }).notNull(),
    markdownSafetyReviewed: integer("markdown_safety_reviewed", {
      mode: "boolean",
    }).notNull(),
    reviewedAt: text("reviewed_at").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
  },
  (table) => [
    uniqueIndex("editorial_reviews_document_idempotency_unique").on(
      table.documentId,
      table.idempotencyKey,
    ),
    index("editorial_reviews_revision_index").on(
      table.revisionId,
      table.reviewedAt,
    ),
    check(
      "editorial_reviews_hash_length",
      sql`length(${table.contentHash}) = 64`,
    ),
    check(
      "editorial_reviews_all_checks_complete",
      sql`${table.credentialsReviewed} = 1
        AND ${table.personalDataReviewed} = 1
        AND ${table.operationalMetadataReviewed} = 1
        AND ${table.externalLinksReviewed} = 1
        AND ${table.legalAttributionReviewed} = 1
        AND ${table.factualClaimsReviewed} = 1
        AND ${table.markdownSafetyReviewed} = 1`,
    ),
  ],
);

export const editorialEvents = sqliteTable(
  "editorial_events",
  {
    id: text("id").primaryKey(),
    documentId: text("document_id")
      .notNull()
      .references(() => editorialDocuments.id, { onDelete: "restrict" }),
    sequence: integer("sequence").notNull(),
    kind: text("kind", { enum: editorialEventKinds }).notNull(),
    actor: text("actor").notNull(),
    revisionId: text("revision_id").references(() => editorialRevisions.id, {
      onDelete: "restrict",
    }),
    summary: text("summary").notNull(),
    reason: text("reason"),
    beforeJson: text("before_json"),
    afterJson: text("after_json").notNull(),
    occurredAt: text("occurred_at").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    correlationId: text("correlation_id").notNull(),
  },
  (table) => [
    uniqueIndex("editorial_events_document_sequence_unique").on(
      table.documentId,
      table.sequence,
    ),
    uniqueIndex("editorial_events_document_idempotency_unique").on(
      table.documentId,
      table.idempotencyKey,
    ),
    index("editorial_events_document_occurred_index").on(
      table.documentId,
      table.occurredAt,
    ),
    check("editorial_events_sequence_positive", sql`${table.sequence} >= 1`),
  ],
);
