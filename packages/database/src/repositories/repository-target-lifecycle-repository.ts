import type {
  RepositorySyncTargetLifecycleAuditEvent,
  RepositorySyncTargetLifecycleRepository,
  RepositorySyncTargetLifecycleSnapshot,
} from "@semogtw/domain";
import type { SqliteDatabase } from "../adapters/sqlite";

export class SqliteRepositoryTargetLifecycleRepository
  implements RepositorySyncTargetLifecycleRepository
{
  constructor(private readonly database: SqliteDatabase) {}

  async findTarget(
    repositoryId: string,
  ): Promise<RepositorySyncTargetLifecycleSnapshot | null> {
    const row = this.database.$client
      .prepare(
        `SELECT id, full_name, sync_enabled, updated_at
         FROM repositories
         WHERE id = ?`,
      )
      .get(repositoryId) as
      | {
          id: string;
          full_name: string;
          sync_enabled: number;
          updated_at: string;
        }
      | undefined;

    return row === undefined
      ? null
      : {
          id: row.id,
          fullName: row.full_name,
          syncEnabled: row.sync_enabled === 1,
          updatedAt: row.updated_at,
        };
  }

  async changeWithAudit(
    before: RepositorySyncTargetLifecycleSnapshot,
    after: RepositorySyncTargetLifecycleSnapshot,
    audit: RepositorySyncTargetLifecycleAuditEvent,
  ): Promise<boolean> {
    const transaction = this.database.$client.transaction(() => {
      const update = this.database.$client
        .prepare(
          `UPDATE repositories
           SET sync_enabled = ?, updated_at = ?
           WHERE id = ?
             AND sync_enabled = ?
             AND updated_at = ?`,
        )
        .run(
          after.syncEnabled ? 1 : 0,
          after.updatedAt,
          before.id,
          before.syncEnabled ? 1 : 0,
          before.updatedAt,
        );
      if (update.changes !== 1) return false;

      this.database.$client
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
          JSON.stringify(audit.before),
          JSON.stringify(audit.after),
          audit.reason,
          audit.occurredAt,
          audit.source,
          audit.confirmed ? 1 : 0,
          audit.correlationId,
        );

      return true;
    });

    return transaction.immediate();
  }
}
