import type {
  AttentionLifecycleAuditEvent,
  AttentionLifecycleRepository,
  AttentionLifecycleSnapshot,
  AttentionLifecycleType,
} from "@semogtw/domain";
import { and, eq } from "drizzle-orm";
import type { SqliteDatabase } from "../adapters/sqlite";
import { auditEvents } from "../schema/audit";
import { attentionItems } from "../schema/operations";

type PersistedAttentionType =
  | "risk"
  | "blocker"
  | "decision"
  | "local_test"
  | "external_dependency"
  | "technical_debt"
  | "security";

function toDomainType(type: PersistedAttentionType): AttentionLifecycleType {
  return type === "local_test" ? "critical_test" : type;
}

function toPersistenceType(type: AttentionLifecycleType): PersistedAttentionType {
  return type === "critical_test" ? "local_test" : type;
}

export class SqliteAttentionLifecycleRepository
  implements AttentionLifecycleRepository
{
  constructor(private readonly database: SqliteDatabase) {}

  findByIdSync(id: string): AttentionLifecycleSnapshot | null {
    const row = this.database
      .select({
        id: attentionItems.id,
        projectId: attentionItems.projectId,
        type: attentionItems.type,
        status: attentionItems.status,
        impact: attentionItems.impact,
        title: attentionItems.title,
        owner: attentionItems.owner,
        nextAction: attentionItems.nextAction,
        source: attentionItems.dataSource,
        resolvedAt: attentionItems.resolvedAt,
        createdAt: attentionItems.createdAt,
        updatedAt: attentionItems.updatedAt,
      })
      .from(attentionItems)
      .where(eq(attentionItems.id, id))
      .get();

    if (row === undefined) return null;
    return {
      ...row,
      type: toDomainType(row.type),
    };
  }

  async findById(id: string): Promise<AttentionLifecycleSnapshot | null> {
    return this.findByIdSync(id);
  }

  transitionWithAuditSync(
    before: AttentionLifecycleSnapshot,
    after: AttentionLifecycleSnapshot,
    audit: AttentionLifecycleAuditEvent,
  ): boolean {
    const update = this.database
      .update(attentionItems)
      .set({
        status: after.status,
        type: toPersistenceType(after.type),
        resolvedAt: after.resolvedAt,
        updatedAt: after.updatedAt,
      })
      .where(
        and(
          eq(attentionItems.id, before.id),
          eq(attentionItems.status, before.status),
          eq(attentionItems.updatedAt, before.updatedAt),
        ),
      )
      .run();

    if (update.changes !== 1) return false;

    this.database
      .insert(auditEvents)
      .values({
        id: audit.id,
        actor: audit.actor,
        action: audit.action,
        entityType: audit.entityType,
        entityId: audit.entityId,
        beforeJson: JSON.stringify(audit.before),
        afterJson: JSON.stringify(audit.after),
        reason: audit.reason,
        occurredAt: audit.occurredAt,
        source: audit.source,
        confirmed: audit.confirmed,
        correlationId: audit.correlationId,
      })
      .run();
    return true;
  }

  async transitionWithAudit(
    before: AttentionLifecycleSnapshot,
    after: AttentionLifecycleSnapshot,
    audit: AttentionLifecycleAuditEvent,
  ): Promise<boolean> {
    const transaction = this.database.$client.transaction(() =>
      this.transitionWithAuditSync(before, after, audit),
    );
    return transaction.immediate();
  }
}
