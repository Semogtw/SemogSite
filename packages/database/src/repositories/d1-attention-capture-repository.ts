import type {
  AttentionCaptureRepository,
  CaptureAuditEvent,
  CapturedAttention,
} from "@semogtw/domain";
import type { D1DatabaseBinding } from "../adapters/d1";

function toPersistenceType(
  type: CapturedAttention["type"],
): "risk" | "blocker" | "decision" | "local_test" | "external_dependency" {
  return type === "critical_test" ? "local_test" : type;
}

function assertBatchSucceeded(
  results: Awaited<ReturnType<D1DatabaseBinding["batch"]>>,
): void {
  const failed = results.find(
    (result) => result.success === false || (result.error?.length ?? 0) > 0,
  );
  if (failed !== undefined) {
    throw new Error("D1 attention capture batch failed.");
  }
}

/**
 * Worker-safe attention capture persistence.
 *
 * D1 batch is used so the canonical attention row and its mandatory audit
 * event are submitted as one storage unit. The repository never accepts an
 * unaudited write; confirmation and normalization remain domain concerns.
 */
export class D1AttentionCaptureRepository
  implements AttentionCaptureRepository
{
  constructor(private readonly database: D1DatabaseBinding) {}

  async insertAttentionWithAudit(
    attention: CapturedAttention,
    audit: CaptureAuditEvent,
  ): Promise<void> {
    const attentionInsert = this.database
      .prepare(
        `INSERT INTO attention_items (
          id, project_id, title, status, impact, type, owner, next_action,
          source_url, resolved_at, data_source, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        attention.id,
        attention.projectId,
        attention.title,
        attention.status,
        attention.impact,
        toPersistenceType(attention.type),
        attention.owner,
        attention.nextAction,
        null,
        null,
        attention.source,
        attention.createdAt,
        attention.updatedAt,
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

    assertBatchSucceeded(await this.database.batch([attentionInsert, auditInsert]));
  }
}
