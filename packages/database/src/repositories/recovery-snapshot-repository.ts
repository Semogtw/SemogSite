import type {
  RecoverySnapshotAuditEvent,
  RecoverySnapshotRecord,
  RecoverySnapshotRepository,
  RecoverySnapshotStoreResult,
} from "@semogtw/domain/orchestration";
import type { SqliteDatabase } from "../adapters/sqlite";

type ExistingSnapshotRow = {
  id: string;
  project_id: string;
  repository_id: string;
  run_id: string | null;
  branch: string;
  observed_commit_sha: string;
  schema_version: number;
  generated_at: string;
  source_observed_at: string;
  confidence: RecoverySnapshotRecord["snapshot"]["confidence"];
  canonical_json: string;
  canonical_hash: string;
  markdown: string;
  template_id: string;
  template_version: number;
  created_by: string;
  source: RecoverySnapshotAuditEvent["source"];
  idempotency_key: string;
  correlation_id: string;
};

function recordMatches(
  row: ExistingSnapshotRow,
  record: RecoverySnapshotRecord,
  audit: RecoverySnapshotAuditEvent,
): boolean {
  const snapshot = record.snapshot;
  return (
    row.id === record.id &&
    row.project_id === snapshot.project.id &&
    row.repository_id === snapshot.repository.id &&
    row.run_id === (snapshot.run?.id ?? null) &&
    row.branch === snapshot.repository.branch &&
    row.observed_commit_sha === snapshot.repository.observedCommitSha &&
    row.schema_version === snapshot.schemaVersion &&
    row.generated_at === snapshot.generatedAt &&
    row.source_observed_at === snapshot.sourceObservedAt &&
    row.confidence === snapshot.confidence &&
    row.canonical_json === record.canonicalJson &&
    row.canonical_hash === record.canonicalHash &&
    row.markdown === record.markdown &&
    row.template_id === snapshot.continuation.templateId &&
    row.template_version === snapshot.continuation.templateVersion &&
    row.created_by === audit.actor &&
    row.source === audit.source &&
    row.idempotency_key === audit.idempotencyKey &&
    row.correlation_id === audit.correlationId
  );
}

function referenceExists(
  database: SqliteDatabase,
  table: "projects" | "repositories" | "cooperative_runs",
  id: string,
): boolean {
  return (
    database.$client.prepare(`SELECT id FROM ${table} WHERE id = ?`).get(id) !==
    undefined
  );
}

export class SqliteRecoverySnapshotRepository
  implements RecoverySnapshotRepository
{
  constructor(private readonly database: SqliteDatabase) {}

  async store(
    record: RecoverySnapshotRecord,
    audit: RecoverySnapshotAuditEvent,
  ): Promise<RecoverySnapshotStoreResult> {
    const transaction = this.database.$client.transaction(() => {
      const snapshot = record.snapshot;
      if (
        audit.action !== "recovery_snapshot.create" ||
        audit.entityType !== "recovery_snapshot" ||
        audit.entityId !== record.id ||
        audit.before !== null ||
        audit.after.canonicalHash !== record.canonicalHash ||
        audit.after.schemaVersion !== snapshot.schemaVersion ||
        audit.after.projectId !== snapshot.project.id ||
        audit.after.repositoryId !== snapshot.repository.id ||
        audit.after.branch !== snapshot.repository.branch ||
        audit.after.observedCommitSha !== snapshot.repository.observedCommitSha ||
        audit.after.generatedAt !== snapshot.generatedAt
      ) {
        return "conflict";
      }

      const existingIntent = this.database.$client
        .prepare(
          `SELECT id, project_id, repository_id, run_id, branch,
                  observed_commit_sha, schema_version, generated_at,
                  source_observed_at, confidence, canonical_json,
                  canonical_hash, markdown, template_id, template_version,
                  created_by, source, idempotency_key, correlation_id
           FROM recovery_snapshots
           WHERE created_by = ? AND idempotency_key = ?`,
        )
        .get(audit.actor, audit.idempotencyKey) as ExistingSnapshotRow | undefined;
      if (existingIntent !== undefined) {
        return recordMatches(existingIntent, record, audit)
          ? "duplicate"
          : "conflict";
      }

      const existingHash = this.database.$client
        .prepare("SELECT id FROM recovery_snapshots WHERE canonical_hash = ?")
        .get(record.canonicalHash) as { id: string } | undefined;
      if (existingHash !== undefined) return "duplicate";

      if (!referenceExists(this.database, "projects", snapshot.project.id)) {
        return "project_not_found";
      }
      if (
        !referenceExists(this.database, "repositories", snapshot.repository.id)
      ) {
        return "repository_not_found";
      }
      if (
        snapshot.run !== null &&
        !referenceExists(this.database, "cooperative_runs", snapshot.run.id)
      ) {
        return "run_not_found";
      }

      this.database.$client
        .prepare(
          `INSERT INTO recovery_snapshots (
            id, project_id, repository_id, run_id, branch,
            observed_commit_sha, schema_version, generated_at,
            source_observed_at, confidence, canonical_json, canonical_hash,
            markdown, template_id, template_version, created_by, source,
            idempotency_key, correlation_id
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          record.id,
          snapshot.project.id,
          snapshot.repository.id,
          snapshot.run?.id ?? null,
          snapshot.repository.branch,
          snapshot.repository.observedCommitSha,
          snapshot.schemaVersion,
          snapshot.generatedAt,
          snapshot.sourceObservedAt,
          snapshot.confidence,
          record.canonicalJson,
          record.canonicalHash,
          record.markdown,
          snapshot.continuation.templateId,
          snapshot.continuation.templateVersion,
          audit.actor,
          audit.source,
          audit.idempotencyKey,
          audit.correlationId,
        );

      this.database.$client
        .prepare(
          `INSERT INTO audit_events (
            id, actor, action, entity_type, entity_id, before_json, after_json,
            reason, occurred_at, source, confirmed, correlation_id
          ) VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, 1, ?)`,
        )
        .run(
          audit.id,
          audit.actor,
          audit.action,
          audit.entityType,
          audit.entityId,
          JSON.stringify(audit.after),
          audit.reason,
          audit.occurredAt,
          audit.source,
          audit.correlationId,
        );
      return "created";
    });

    return transaction.immediate();
  }
}
