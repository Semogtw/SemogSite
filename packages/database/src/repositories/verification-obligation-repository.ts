import type {
  VerificationObligationAuditEvent,
  VerificationObligationRepository,
  VerificationObligationSnapshot,
  VerificationObligationStoreResult,
} from "@semogtw/domain/orchestration";
import type { SqliteDatabase } from "../adapters/sqlite";

type ObligationRow = {
  id: string;
  project_id: string | null;
  repository_id: string;
  run_id: string | null;
  stage_id: string | null;
  branch: string;
  target_commit_sha: string;
  gate_name: string;
  command: string;
  required_capabilities_json: string;
  responsible_actor: string;
  next_action: string;
  toolchain_manifest: string | null;
  status: VerificationObligationSnapshot["status"];
  failure_classification: VerificationObligationSnapshot["failureClassification"];
  failure_signature: string | null;
  result_summary: string | null;
  evidence_urls_json: string;
  created_at: string;
  last_attempt_at: string | null;
  resolved_at: string | null;
  version: number;
};

type ExistingObligationEvent = {
  id: string;
  action: VerificationObligationAuditEvent["action"];
  actor: string;
  before_json: string | null;
  after_json: string;
  reason: string;
  source: VerificationObligationAuditEvent["source"];
  confirmed: number;
  correlation_id: string;
};

function parseStringArray(value: string): string[] {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) && parsed.every((item) => typeof item === "string")
      ? parsed
      : [];
  } catch {
    return [];
  }
}

function parseSnapshot(
  value: string | null,
): VerificationObligationSnapshot | null {
  if (value === null) return null;
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as VerificationObligationSnapshot)
      : null;
  } catch {
    return null;
  }
}

function rowToSnapshot(row: ObligationRow): VerificationObligationSnapshot {
  return {
    id: row.id,
    projectId: row.project_id,
    repositoryId: row.repository_id,
    runId: row.run_id,
    stageId: row.stage_id,
    branch: row.branch,
    targetCommitSha: row.target_commit_sha,
    gateName: row.gate_name,
    command: row.command,
    requiredCapabilities: parseStringArray(row.required_capabilities_json),
    responsibleActor: row.responsible_actor,
    nextAction: row.next_action,
    toolchainManifest: row.toolchain_manifest,
    status: row.status,
    failureClassification: row.failure_classification,
    failureSignature: row.failure_signature,
    resultSummary: row.result_summary,
    evidenceUrls: parseStringArray(row.evidence_urls_json),
    createdAt: row.created_at,
    lastAttemptAt: row.last_attempt_at,
    resolvedAt: row.resolved_at,
    version: row.version,
  };
}

function sameSnapshotIntent(
  left: VerificationObligationSnapshot | null,
  right: VerificationObligationSnapshot | null,
): boolean {
  if (left === null || right === null) return left === right;
  return (
    left.id === right.id &&
    left.projectId === right.projectId &&
    left.repositoryId === right.repositoryId &&
    left.runId === right.runId &&
    left.stageId === right.stageId &&
    left.branch === right.branch &&
    left.targetCommitSha === right.targetCommitSha &&
    left.gateName === right.gateName &&
    left.command === right.command &&
    JSON.stringify(left.requiredCapabilities) ===
      JSON.stringify(right.requiredCapabilities) &&
    left.responsibleActor === right.responsibleActor &&
    left.nextAction === right.nextAction &&
    left.toolchainManifest === right.toolchainManifest &&
    left.status === right.status &&
    left.failureClassification === right.failureClassification &&
    left.failureSignature === right.failureSignature &&
    left.resultSummary === right.resultSummary &&
    JSON.stringify(left.evidenceUrls) === JSON.stringify(right.evidenceUrls) &&
    left.version === right.version
  );
}

function sameStoredIntent(
  existing: ExistingObligationEvent,
  audit: VerificationObligationAuditEvent,
): boolean {
  return (
    existing.id === audit.id &&
    existing.action === audit.action &&
    existing.actor === audit.actor &&
    existing.reason === audit.reason &&
    existing.source === audit.source &&
    (existing.confirmed === 1) === audit.confirmed &&
    existing.correlation_id === audit.correlationId &&
    sameSnapshotIntent(parseSnapshot(existing.before_json), audit.before) &&
    sameSnapshotIntent(parseSnapshot(existing.after_json), audit.after)
  );
}

function selectEvent(
  database: SqliteDatabase,
  obligationId: string,
  idempotencyKey: string,
): ExistingObligationEvent | undefined {
  return database.$client
    .prepare(
      `SELECT id, action, actor, before_json, after_json, reason,
              source, confirmed, correlation_id
       FROM verification_obligation_events
       WHERE obligation_id = ? AND idempotency_key = ?`,
    )
    .get(obligationId, idempotencyKey) as ExistingObligationEvent | undefined;
}

function insertEventAndAudit(
  database: SqliteDatabase,
  sequence: number,
  audit: VerificationObligationAuditEvent,
): void {
  database.$client
    .prepare(
      `INSERT INTO verification_obligation_events (
        id, obligation_id, sequence, action, actor, before_json, after_json,
        reason, occurred_at, source, confirmed, idempotency_key, correlation_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      audit.id,
      audit.entityId,
      sequence,
      audit.action,
      audit.actor,
      audit.before === null ? null : JSON.stringify(audit.before),
      JSON.stringify(audit.after),
      audit.reason,
      audit.occurredAt,
      audit.source,
      audit.confirmed ? 1 : 0,
      audit.idempotencyKey,
      audit.correlationId,
    );

  database.$client
    .prepare(
      `INSERT INTO audit_events (
        id, actor, action, entity_type, entity_id, before_json, after_json,
        reason, occurred_at, source, confirmed, correlation_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      audit.id,
      audit.actor,
      audit.action,
      audit.entityType,
      audit.entityId,
      audit.before === null ? null : JSON.stringify(audit.before),
      JSON.stringify(audit.after),
      audit.reason,
      audit.occurredAt,
      audit.source,
      audit.confirmed ? 1 : 0,
      audit.correlationId,
    );
}

function referenceExists(
  database: SqliteDatabase,
  table: "projects" | "repositories" | "cooperative_runs" | "stages",
  id: string,
): boolean {
  return (
    database.$client.prepare(`SELECT id FROM ${table} WHERE id = ?`).get(id) !==
    undefined
  );
}

export class SqliteVerificationObligationRepository
  implements VerificationObligationRepository
{
  constructor(private readonly database: SqliteDatabase) {}

  async findById(id: string): Promise<VerificationObligationSnapshot | null> {
    const row = this.database.$client
      .prepare(
        `SELECT id, project_id, repository_id, run_id, stage_id, branch,
                target_commit_sha, gate_name, command,
                required_capabilities_json, responsible_actor, next_action,
                toolchain_manifest, status, failure_classification,
                failure_signature, result_summary, evidence_urls_json,
                created_at, last_attempt_at, resolved_at, version
         FROM verification_obligations WHERE id = ?`,
      )
      .get(id) as ObligationRow | undefined;
    return row === undefined ? null : rowToSnapshot(row);
  }

  async create(
    obligation: VerificationObligationSnapshot,
    audit: VerificationObligationAuditEvent,
  ): Promise<VerificationObligationStoreResult> {
    const transaction = this.database.$client.transaction(() => {
      if (
        audit.action !== "verification_obligation.create" ||
        audit.entityType !== "verification_obligation" ||
        audit.entityId !== obligation.id ||
        audit.before !== null ||
        !sameSnapshotIntent(audit.after, obligation)
      ) {
        return "conflict";
      }

      const existingEvent = selectEvent(
        this.database,
        obligation.id,
        audit.idempotencyKey,
      );
      if (existingEvent !== undefined) {
        return sameStoredIntent(existingEvent, audit) ? "duplicate" : "conflict";
      }

      if (
        obligation.projectId !== null &&
        !referenceExists(this.database, "projects", obligation.projectId)
      ) {
        return "project_not_found";
      }
      if (!referenceExists(this.database, "repositories", obligation.repositoryId)) {
        return "repository_not_found";
      }
      if (
        obligation.runId !== null &&
        !referenceExists(this.database, "cooperative_runs", obligation.runId)
      ) {
        return "run_not_found";
      }
      if (
        obligation.stageId !== null &&
        !referenceExists(this.database, "stages", obligation.stageId)
      ) {
        return "stage_not_found";
      }
      if (
        this.database.$client
          .prepare("SELECT id FROM verification_obligations WHERE id = ?")
          .get(obligation.id) !== undefined
      ) {
        return "conflict";
      }

      this.database.$client
        .prepare(
          `INSERT INTO verification_obligations (
            id, project_id, repository_id, run_id, stage_id, branch,
            target_commit_sha, gate_name, command,
            required_capabilities_json, responsible_actor, next_action,
            toolchain_manifest, status, failure_classification,
            failure_signature, result_summary, evidence_urls_json,
            created_at, last_attempt_at, resolved_at, version
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          obligation.id,
          obligation.projectId,
          obligation.repositoryId,
          obligation.runId,
          obligation.stageId,
          obligation.branch,
          obligation.targetCommitSha,
          obligation.gateName,
          obligation.command,
          JSON.stringify(obligation.requiredCapabilities),
          obligation.responsibleActor,
          obligation.nextAction,
          obligation.toolchainManifest,
          obligation.status,
          obligation.failureClassification,
          obligation.failureSignature,
          obligation.resultSummary,
          JSON.stringify(obligation.evidenceUrls),
          obligation.createdAt,
          obligation.lastAttemptAt,
          obligation.resolvedAt,
          obligation.version,
        );
      insertEventAndAudit(this.database, 1, audit);
      return "created";
    });

    return transaction.immediate();
  }

  async update(
    before: VerificationObligationSnapshot,
    after: VerificationObligationSnapshot,
    audit: VerificationObligationAuditEvent,
  ): Promise<VerificationObligationStoreResult> {
    const transaction = this.database.$client.transaction(() => {
      if (
        audit.action === "verification_obligation.create" ||
        audit.entityType !== "verification_obligation" ||
        before.id !== after.id ||
        audit.entityId !== after.id ||
        after.version !== before.version + 1 ||
        !sameSnapshotIntent(audit.before, before) ||
        !sameSnapshotIntent(audit.after, after)
      ) {
        return "conflict";
      }

      const existingEvent = selectEvent(
        this.database,
        after.id,
        audit.idempotencyKey,
      );
      if (existingEvent !== undefined) {
        return sameStoredIntent(existingEvent, audit) ? "duplicate" : "conflict";
      }

      const update = this.database.$client
        .prepare(
          `UPDATE verification_obligations
           SET project_id = ?, repository_id = ?, run_id = ?, stage_id = ?,
               branch = ?, target_commit_sha = ?, gate_name = ?, command = ?,
               required_capabilities_json = ?, responsible_actor = ?,
               next_action = ?, toolchain_manifest = ?, status = ?,
               failure_classification = ?, failure_signature = ?,
               result_summary = ?, evidence_urls_json = ?, created_at = ?,
               last_attempt_at = ?, resolved_at = ?, version = ?
           WHERE id = ? AND version = ? AND status = ?`,
        )
        .run(
          after.projectId,
          after.repositoryId,
          after.runId,
          after.stageId,
          after.branch,
          after.targetCommitSha,
          after.gateName,
          after.command,
          JSON.stringify(after.requiredCapabilities),
          after.responsibleActor,
          after.nextAction,
          after.toolchainManifest,
          after.status,
          after.failureClassification,
          after.failureSignature,
          after.resultSummary,
          JSON.stringify(after.evidenceUrls),
          after.createdAt,
          after.lastAttemptAt,
          after.resolvedAt,
          after.version,
          before.id,
          before.version,
          before.status,
        );
      if (update.changes !== 1) return "conflict";

      const sequence = this.database.$client
        .prepare(
          `SELECT COALESCE(MAX(sequence), 0) + 1 AS sequence
           FROM verification_obligation_events WHERE obligation_id = ?`,
        )
        .get(after.id) as { sequence: number };
      insertEventAndAudit(this.database, sequence.sequence, audit);
      return "updated";
    });

    return transaction.immediate();
  }
}
