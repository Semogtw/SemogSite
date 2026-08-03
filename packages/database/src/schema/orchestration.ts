import {
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { projects, repositories } from "./projects";
import { stages } from "./roadmap";
import { cooperativeRuns } from "./runs";

export const scopeReservations = sqliteTable(
  "scope_reservations",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id").references(() => projects.id, {
      onDelete: "set null",
    }),
    repositoryId: text("repository_id")
      .notNull()
      .references(() => repositories.id, { onDelete: "cascade" }),
    runId: text("run_id").references(() => cooperativeRuns.id, {
      onDelete: "set null",
    }),
    branch: text("branch").notNull(),
    kind: text("kind", {
      enum: ["repository", "directory", "files", "issue", "stage", "custom"],
    }).notNull(),
    patternsJson: text("patterns_json").notNull(),
    holderLabel: text("holder_label").notNull(),
    purpose: text("purpose").notNull(),
    state: text("state", {
      enum: ["active", "released", "transferred", "overridden"],
    }).notNull(),
    acquiredAt: text("acquired_at").notNull(),
    renewedAt: text("renewed_at").notNull(),
    expiresAt: text("expires_at").notNull(),
    releasedAt: text("released_at"),
    version: integer("version").notNull(),
  },
  (table) => [
    index("idx_scope_reservations_active").on(
      table.repositoryId,
      table.branch,
      table.state,
      table.expiresAt,
    ),
    index("idx_scope_reservations_run").on(
      table.runId,
      table.state,
      table.renewedAt,
    ),
    index("idx_scope_reservations_project").on(
      table.projectId,
      table.state,
      table.renewedAt,
    ),
  ],
);

export const scopeReservationEvents = sqliteTable(
  "scope_reservation_events",
  {
    id: text("id").primaryKey(),
    reservationId: text("reservation_id")
      .notNull()
      .references(() => scopeReservations.id, { onDelete: "cascade" }),
    sequence: integer("sequence").notNull(),
    action: text("action", {
      enum: [
        "scope_reservation.acquire",
        "scope_reservation.renew",
        "scope_reservation.release",
        "scope_reservation.override",
      ],
    }).notNull(),
    actor: text("actor").notNull(),
    beforeJson: text("before_json"),
    afterJson: text("after_json").notNull(),
    reason: text("reason").notNull(),
    overlapIdsJson: text("overlap_ids_json").notNull(),
    occurredAt: text("occurred_at").notNull(),
    source: text("source", { enum: ["manual", "agent"] }).notNull(),
    confirmed: integer("confirmed", { mode: "boolean" }).notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    correlationId: text("correlation_id").notNull(),
  },
  (table) => [
    uniqueIndex("scope_reservation_events_sequence_unique").on(
      table.reservationId,
      table.sequence,
    ),
    uniqueIndex("scope_reservation_events_idempotency_unique").on(
      table.reservationId,
      table.idempotencyKey,
    ),
    index("idx_scope_reservation_events_history").on(
      table.reservationId,
      table.sequence,
    ),
    index("idx_scope_reservation_events_correlation").on(
      table.correlationId,
      table.occurredAt,
    ),
  ],
);

export const verificationObligations = sqliteTable(
  "verification_obligations",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id").references(() => projects.id, {
      onDelete: "set null",
    }),
    repositoryId: text("repository_id")
      .notNull()
      .references(() => repositories.id, { onDelete: "cascade" }),
    runId: text("run_id").references(() => cooperativeRuns.id, {
      onDelete: "set null",
    }),
    stageId: text("stage_id").references(() => stages.id, {
      onDelete: "set null",
    }),
    branch: text("branch").notNull(),
    targetCommitSha: text("target_commit_sha").notNull(),
    gateName: text("gate_name").notNull(),
    command: text("command").notNull(),
    requiredCapabilitiesJson: text("required_capabilities_json").notNull(),
    responsibleActor: text("responsible_actor").notNull(),
    nextAction: text("next_action").notNull(),
    toolchainManifest: text("toolchain_manifest"),
    status: text("status", {
      enum: [
        "pending",
        "running",
        "passed",
        "failed",
        "blocked",
        "superseded",
        "waived",
      ],
    }).notNull(),
    failureClassification: text("failure_classification", {
      enum: [
        "code_failure",
        "environment_missing",
        "flaky",
        "timeout",
        "quota",
        "configuration",
        "external_dependency",
        "unknown",
      ],
    }),
    failureSignature: text("failure_signature"),
    resultSummary: text("result_summary"),
    evidenceUrlsJson: text("evidence_urls_json").notNull(),
    createdAt: text("created_at").notNull(),
    lastAttemptAt: text("last_attempt_at"),
    resolvedAt: text("resolved_at"),
    version: integer("version").notNull(),
  },
  (table) => [
    index("idx_verification_obligations_target").on(
      table.repositoryId,
      table.branch,
      table.targetCommitSha,
      table.status,
    ),
    index("idx_verification_obligations_stage").on(
      table.stageId,
      table.status,
      table.createdAt,
    ),
    index("idx_verification_obligations_run").on(
      table.runId,
      table.status,
      table.createdAt,
    ),
    index("idx_verification_obligations_failure_signature").on(
      table.failureSignature,
      table.lastAttemptAt,
    ),
  ],
);

export const verificationObligationEvents = sqliteTable(
  "verification_obligation_events",
  {
    id: text("id").primaryKey(),
    obligationId: text("obligation_id")
      .notNull()
      .references(() => verificationObligations.id, { onDelete: "cascade" }),
    sequence: integer("sequence").notNull(),
    action: text("action", {
      enum: [
        "verification_obligation.create",
        "verification_obligation.result",
        "verification_obligation.supersede",
        "verification_obligation.waive",
      ],
    }).notNull(),
    actor: text("actor").notNull(),
    beforeJson: text("before_json"),
    afterJson: text("after_json").notNull(),
    reason: text("reason").notNull(),
    occurredAt: text("occurred_at").notNull(),
    source: text("source", { enum: ["manual", "agent"] }).notNull(),
    confirmed: integer("confirmed", { mode: "boolean" }).notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    correlationId: text("correlation_id").notNull(),
  },
  (table) => [
    uniqueIndex("verification_obligation_events_sequence_unique").on(
      table.obligationId,
      table.sequence,
    ),
    uniqueIndex("verification_obligation_events_idempotency_unique").on(
      table.obligationId,
      table.idempotencyKey,
    ),
    index("idx_verification_obligation_events_history").on(
      table.obligationId,
      table.sequence,
    ),
    index("idx_verification_obligation_events_correlation").on(
      table.correlationId,
      table.occurredAt,
    ),
  ],
);
