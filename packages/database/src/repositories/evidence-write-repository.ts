import type {
  EvidenceAuditEvent,
  EvidenceWriteRepository,
  RecordedEvidence,
} from "@semogtw/domain";
import type { SqliteDatabase } from "../adapters/sqlite";
import { auditEvents } from "../schema/audit";
import { evidence } from "../schema/operations";

export class SqliteEvidenceWriteRepository implements EvidenceWriteRepository {
  constructor(private readonly database: SqliteDatabase) {}

  async insertEvidenceWithAudit(
    record: RecordedEvidence,
    audit: EvidenceAuditEvent,
  ): Promise<void> {
    this.database.transaction((transaction) => {
      transaction
        .insert(evidence)
        .values({
          id: record.id,
          projectId: record.projectId,
          stageId: record.stageId,
          sessionId: record.sessionId,
          repositoryId: record.repositoryId,
          kind: record.kind,
          title: record.title,
          url: record.url,
          externalId: record.externalId,
          status: record.status,
          summary: record.summary,
          occurredAt: record.occurredAt,
          capturedAt: record.capturedAt,
          sourceHash: record.sourceHash,
          dataSource: record.source,
        })
        .run();
      transaction
        .insert(auditEvents)
        .values({
          id: audit.id,
          actor: audit.actor,
          action: audit.action,
          entityType: audit.entityType,
          entityId: audit.entityId,
          beforeJson: null,
          afterJson: JSON.stringify(audit.after),
          reason: audit.reason,
          occurredAt: audit.occurredAt,
          source: audit.source,
          confirmed: audit.confirmed,
          correlationId: audit.correlationId,
        })
        .run();
    });
  }
}
