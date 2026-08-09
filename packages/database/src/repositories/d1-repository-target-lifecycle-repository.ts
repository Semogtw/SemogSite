import type {
  RepositorySyncTargetLifecycleAuditEvent,
  RepositorySyncTargetLifecycleRepository,
  RepositorySyncTargetLifecycleSnapshot,
} from "@semogtw/domain";
import type {
  D1DatabaseBinding,
  D1QueryResult,
} from "../adapters/d1";

type TargetRow = {
  id: string;
  full_name: string;
  sync_enabled: number | boolean;
  updated_at: string;
};

function assertBatchSucceeded(results: readonly D1QueryResult[]): void {
  const failed = results.find(
    (result) => result.success === false || (result.error?.length ?? 0) > 0,
  );
  if (failed !== undefined) {
    throw new Error("D1 repository target lifecycle batch failed.");
  }
}

function readChangeCount(result: D1QueryResult | undefined): number {
  const changes = result?.meta?.["changes"];
  if (typeof changes !== "number" || !Number.isInteger(changes) || changes < 0) {
    throw new Error(
      "D1 repository target lifecycle result is missing changes metadata.",
    );
  }
  return changes;
}

export class D1RepositoryTargetLifecycleRepository
  implements RepositorySyncTargetLifecycleRepository
{
  constructor(private readonly database: D1DatabaseBinding) {}

  async findTarget(
    repositoryId: string,
  ): Promise<RepositorySyncTargetLifecycleSnapshot | null> {
    const result = await this.database
      .prepare(
        `SELECT id, full_name, sync_enabled, updated_at
        FROM repositories
        WHERE id = ? AND status = 'active'
        LIMIT 1`,
      )
      .bind(repositoryId)
      .all<TargetRow>();

    if (result.success === false || (result.error?.length ?? 0) > 0) {
      throw new Error("D1 repository target lifecycle lookup failed.");
    }
    const row = result.results[0];
    return row === undefined
      ? null
      : {
          id: row.id,
          fullName: row.full_name,
          syncEnabled: row.sync_enabled === true || row.sync_enabled === 1,
          updatedAt: row.updated_at,
        };
  }

  async changeWithAudit(
    before: RepositorySyncTargetLifecycleSnapshot,
    after: RepositorySyncTargetLifecycleSnapshot,
    audit: RepositorySyncTargetLifecycleAuditEvent,
  ): Promise<boolean> {
    const transition = this.database
      .prepare(
        `UPDATE repositories
        SET sync_enabled = ?, updated_at = ?
        WHERE id = ?
          AND status = 'active'
          AND sync_enabled = ?
          AND updated_at = ?`,
      )
      .bind(
        after.syncEnabled ? 1 : 0,
        after.updatedAt,
        before.id,
        before.syncEnabled ? 1 : 0,
        before.updatedAt,
      );

    const auditInsert = this.database
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

    const results = await this.database.batch([transition, auditInsert]);
    assertBatchSucceeded(results);
    const changed = readChangeCount(results[0]);
    if (changed > 1) {
      throw new Error("D1 repository target lifecycle CAS changed more than one row.");
    }
    return changed === 1;
  }
}
