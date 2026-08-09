import type {
  VerificationObligationAuditEvent,
  VerificationObligationRepository,
  VerificationObligationSnapshot,
  VerificationObligationStoreResult,
} from "@semogtw/domain/orchestration";
import type {
  D1DatabaseBinding,
  D1QueryResult,
} from "../adapters/d1";

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
  confirmed: number | boolean;
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

function parseSnapshot(value: string | null): VerificationObligationSnapshot | null {
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
    JSON.stringify(left.requiredCapabilities) === JSON.stringify(right.requiredCapabilities) &&
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
    (existing.confirmed === true || existing.confirmed === 1) === audit.confirmed &&
    existing.correlation_id === audit.correlationId &&
    sameSnapshotIntent(parseSnapshot(existing.before_json), audit.before) &&
    sameSnapshotIntent(parseSnapshot(existing.after_json), audit.after)
  );
}

function assertBatchSucceeded(results: readonly D1QueryResult[]): void {
  const failed = results.find(
    (result) => result.success === false || (result.error?.length ?? 0) > 0,
  );
  if (failed !== undefined) {
    throw new Error("D1 verification obligation batch failed.");
  }
}

function readChangeCount(result: D1QueryResult | undefined, operation: string): number {
  const changes = result?.meta?.["changes"];
  if (typeof changes !== "number" || !Number.isInteger(changes) || changes < 0) {
    throw new Error(`D1 verification obligation ${operation} is missing changes metadata.`);
  }
  return changes;
}

async function queryExists(
  database: D1DatabaseBinding,
  table: "projects" | "repositories" | "cooperative_runs" | "stages",
  id: string,
): Promise<boolean> {
  const result = await database
    .prepare(`SELECT id FROM ${table} WHERE id = ? LIMIT 1`)
    .bind(id)
    .all<{ id: string }>();
  if (result.success === false || (result.error?.length ?? 0) > 0) {
    throw new Error("D1 verification obligation reference lookup failed.");
  }
  return result.results.length > 0;
}

export class D1VerificationObligationRepository
  implements VerificationObligationRepository
{
  constructor(private readonly database: D1DatabaseBinding) {}

  async findById(id: string): Promise<VerificationObligationSnapshot | null> {
    const result = await this.database
      .prepare(
        `SELECT id, project_id, repository_id, run_id, stage_id, branch,
                target_commit_sha, gate_name, command,
                required_capabilities_json, responsible_actor, next_action,
                toolchain_manifest, status, failure_classification,
                failure_signature, result_summary, evidence_urls_json,
                created_at, last_attempt_at, resolved_at, version
         FROM verification_obligations WHERE id = ? LIMIT 1`,
      )
      .bind(id)
      .all<ObligationRow>();
    if (result.success === false || (result.error?.length ?? 0) > 0) {
      throw new Error("D1 verification obligation lookup failed.");
    }
    const row = result.results[0];
    return row === undefined ? null : rowToSnapshot(row);
  }

  async create(
    obligation: VerificationObligationSnapshot,
    audit: VerificationObligationAuditEvent,
  ): Promise<VerificationObligationStoreResult> {
    if (
      audit.action !== "verification_obligation.create" ||
      audit.entityType !== "verification_obligation" ||
      audit.entityId !== obligation.id ||
      audit.before !== null ||
      !sameSnapshotIntent(audit.after, obligation)
    ) {
      return "conflict";
    }

    const insert = this.database
      .prepare(
        `INSERT INTO verification_obligations (
          id, project_id, repository_id, run_id, stage_id, branch,
          target_commit_sha, gate_name, command, required_capabilities_json,
          responsible_actor, next_action, toolchain_manifest, status,
          failure_classification, failure_signature, result_summary,
          evidence_urls_json, created_at, last_attempt_at, resolved_at, version
        )
        SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
        WHERE (? IS NULL OR EXISTS (SELECT 1 FROM projects WHERE id = ?))
          AND EXISTS (SELECT 1 FROM repositories WHERE id = ?)
          AND (? IS NULL OR EXISTS (SELECT 1 FROM cooperative_runs WHERE id = ?))
          AND (? IS NULL OR EXISTS (SELECT 1 FROM stages WHERE id = ?))
          AND NOT EXISTS (SELECT 1 FROM verification_obligations WHERE id = ?)
          AND NOT EXISTS (
            SELECT 1 FROM verification_obligation_events
            WHERE obligation_id = ? AND idempotency_key = ?
          )`,
      )
      .bind(
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
        obligation.projectId,
        obligation.projectId,
        obligation.repositoryId,
        obligation.runId,
        obligation.runId,
        obligation.stageId,
        obligation.stageId,
        obligation.id,
        obligation.id,
        audit.idempotencyKey,
      );

    const insertEvent = this.database
      .prepare(
        `INSERT INTO verification_obligation_events (
          id, obligation_id, sequence, action, actor, before_json, after_json,
          reason, occurred_at, source, confirmed, idempotency_key, correlation_id
        )
        SELECT ?, ?, 1, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?
        WHERE changes() = 1`,
      )
      .bind(
        audit.id,
        audit.entityId,
        audit.action,
        audit.actor,
        JSON.stringify(audit.after),
        audit.reason,
        audit.occurredAt,
        audit.source,
        audit.confirmed ? 1 : 0,
        audit.idempotencyKey,
        audit.correlationId,
      );

    const insertAudit = this.database
      .prepare(
        `INSERT INTO audit_events (
          id, actor, action, entity_type, entity_id, before_json, after_json,
          reason, occurred_at, source, confirmed, correlation_id
        )
        SELECT ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?
        WHERE changes() = 1`,
      )
      .bind(
        audit.id,
        audit.actor,
        audit.action,
        audit.entityType,
        audit.entityId,
        JSON.stringify(audit.after),
        audit.reason,
        audit.occurredAt,
        audit.source,
        audit.confirmed ? 1 : 0,
        audit.correlationId,
      );

    const results = await this.database.batch([insert, insertEvent, insertAudit]);
    assertBatchSucceeded(results);
    const inserted = readChangeCount(results[0], "create");
    if (inserted > 1) throw new Error("D1 verification obligation inserted multiple rows.");
    if (inserted === 1) {
      if (
        readChangeCount(results[1], "event insert") !== 1 ||
        readChangeCount(results[2], "audit insert") !== 1
      ) {
        throw new Error("D1 verification obligation create ledger is incomplete.");
      }
      return "created";
    }

    const existing = await this.selectEvent(obligation.id, audit.idempotencyKey);
    if (existing !== null) {
      return sameStoredIntent(existing, audit) ? "duplicate" : "conflict";
    }
    if (
      obligation.projectId !== null &&
      !(await queryExists(this.database, "projects", obligation.projectId))
    ) {
      return "project_not_found";
    }
    if (!(await queryExists(this.database, "repositories", obligation.repositoryId))) {
      return "repository_not_found";
    }
    if (
      obligation.runId !== null &&
      !(await queryExists(this.database, "cooperative_runs", obligation.runId))
    ) {
      return "run_not_found";
    }
    if (
      obligation.stageId !== null &&
      !(await queryExists(this.database, "stages", obligation.stageId))
    ) {
      return "stage_not_found";
    }
    return "conflict";
  }

  async update(
    before: VerificationObligationSnapshot,
    after: VerificationObligationSnapshot,
    audit: VerificationObligationAuditEvent,
  ): Promise<VerificationObligationStoreResult> {
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

    const update = this.database
      .prepare(
        `UPDATE verification_obligations
         SET project_id = ?, repository_id = ?, run_id = ?, stage_id = ?,
             branch = ?, target_commit_sha = ?, gate_name = ?, command = ?,
             required_capabilities_json = ?, responsible_actor = ?,
             next_action = ?, toolchain_manifest = ?, status = ?,
             failure_classification = ?, failure_signature = ?,
             result_summary = ?, evidence_urls_json = ?, created_at = ?,
             last_attempt_at = ?, resolved_at = ?, version = ?
         WHERE id = ? AND version = ? AND status = ?
           AND NOT EXISTS (
             SELECT 1 FROM verification_obligation_events
             WHERE obligation_id = ? AND idempotency_key = ?
           )`,
      )
      .bind(
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
        after.id,
        audit.idempotencyKey,
      );

    const insertEvent = this.database
      .prepare(
        `INSERT INTO verification_obligation_events (
          id, obligation_id, sequence, action, actor, before_json, after_json,
          reason, occurred_at, source, confirmed, idempotency_key, correlation_id
        )
        SELECT ?, ?,
          COALESCE((SELECT MAX(sequence) FROM verification_obligation_events WHERE obligation_id = ?), 0) + 1,
          ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
        WHERE changes() = 1`,
      )
      .bind(
        audit.id,
        audit.entityId,
        audit.entityId,
        audit.action,
        audit.actor,
        JSON.stringify(audit.before),
        JSON.stringify(audit.after),
        audit.reason,
        audit.occurredAt,
        audit.source,
        audit.confirmed ? 1 : 0,
        audit.idempotencyKey,
        audit.correlationId,
      );

    const insertAudit = this.database
      .prepare(
        `INSERT INTO audit_events (
          id, actor, action, entity_type, entity_id, before_json, after_json,
          reason, occurred_at, source, confirmed, correlation_id
        )
        SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
        WHERE changes() = 1`,
      )
      .bind(
        audit.id,
        audit.actor,
        audit.action,
        audit.entityType,
        audit.entityId,
        JSON.stringify(audit.before),
        JSON.stringify(audit.after),
        audit.reason,
        audit.occurredAt,
        audit.source,
        audit.confirmed ? 1 : 0,
        audit.correlationId,
      );

    const results = await this.database.batch([update, insertEvent, insertAudit]);
    assertBatchSucceeded(results);
    const changed = readChangeCount(results[0], "update");
    if (changed > 1) throw new Error("D1 verification obligation updated multiple rows.");
    if (changed === 1) {
      if (
        readChangeCount(results[1], "event insert") !== 1 ||
        readChangeCount(results[2], "audit insert") !== 1
      ) {
        throw new Error("D1 verification obligation update ledger is incomplete.");
      }
      return "updated";
    }

    const existing = await this.selectEvent(after.id, audit.idempotencyKey);
    if (existing !== null && sameStoredIntent(existing, audit)) return "duplicate";
    return "conflict";
  }

  private async selectEvent(
    obligationId: string,
    idempotencyKey: string,
  ): Promise<ExistingObligationEvent | null> {
    const result = await this.database
      .prepare(
        `SELECT id, action, actor, before_json, after_json, reason,
                source, confirmed, correlation_id
         FROM verification_obligation_events
         WHERE obligation_id = ? AND idempotency_key = ?
         LIMIT 1`,
      )
      .bind(obligationId, idempotencyKey)
      .all<ExistingObligationEvent>();
    if (result.success === false || (result.error?.length ?? 0) > 0) {
      throw new Error("D1 verification obligation event lookup failed.");
    }
    return result.results[0] ?? null;
  }
}
