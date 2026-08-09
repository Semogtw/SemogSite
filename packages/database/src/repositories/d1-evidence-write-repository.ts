import type {
  EvidenceAuditEvent,
  EvidenceWriteRepository,
  RecordedEvidence,
} from "@semogtw/domain";
import type { D1DatabaseBinding } from "../adapters/d1";

export class D1EvidenceWriteRepository implements EvidenceWriteRepository {
  constructor(private readonly database: D1DatabaseBinding) {}

  async insertEvidenceWithAudit(
    record: RecordedEvidence,
    audit: EvidenceAuditEvent,
  ): Promise<void> {
    const evidenceInsert = this.database
      .prepare(
        `INSERT INTO evidence (
          id, project_id, stage_id, session_id, repository_id, kind, title,
          url, external_id, status, summary, occurred_at, captured_at,
          source_hash, data_source
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        record.id,
        record.projectId,
        record.stageId,
        record.sessionId,
        record.repositoryId,
        record.kind,
        record.title,
        record.url,
        record.externalId,
        record.status,
        record.summary,
        record.occurredAt,
        record.capturedAt,
        record.sourceHash,
        record.source,
      );

    const auditInsert = this.database
      .prepare(
        `INSERT INTO audit_events (
          id, actor, action, entity_type, entity_id, before_json, after_json,
          reason, occurred_at, source, confirmed, correlation_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        audit.id,
        audit.actor,
        audit.action,
        audit.entityType,
        audit.entityId,
        null,
        JSON.stringify(audit.after),
        audit.reason,
        audit.occurredAt,
        audit.source,
        audit.confirmed ? 1 : 0,
        audit.correlationId,
      );

    const results = await this.database.batch([evidenceInsert, auditInsert]);
    if (
      results.some(
        (result) =>
          result.success === false || (result.error?.length ?? 0) > 0,
      )
    ) {
      throw new Error("D1 evidence write batch failed.");
    }
  }
}
