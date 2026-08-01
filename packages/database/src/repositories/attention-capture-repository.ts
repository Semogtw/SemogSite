import type {
  AttentionCaptureRepository,
  CaptureAuditEvent,
  CapturedAttention,
} from "@semogtw/domain";
import type { SqliteDatabase } from "../adapters/sqlite";
import { auditEvents } from "../schema/audit";
import { attentionItems } from "../schema/operations";

export class SqliteAttentionCaptureRepository
  implements AttentionCaptureRepository
{
  constructor(private readonly database: SqliteDatabase) {}

  async insertAttentionWithAudit(
    attention: CapturedAttention,
    audit: CaptureAuditEvent,
  ): Promise<void> {
    this.database.transaction((transaction) => {
      transaction.insert(attentionItems).values(attention).run();
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
