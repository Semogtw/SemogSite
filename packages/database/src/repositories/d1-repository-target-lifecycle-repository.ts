import type {
  RepositorySyncTargetLifecycleAuditEvent,
  RepositorySyncTargetLifecycleRepository,
  RepositorySyncTargetLifecycleSnapshot,
} from "@semogtw/domain";
import type {
  D1DatabaseBinding,
  D1QueryResult,
} from "../adapters/d1";
import {
  assertD1BatchSucceeded,
  readD1SingleRowChange,
} from "./d1-write-result";

type TargetRow = {
  id: string;
  full_name: string;
  sync_enabled: number | boolean;
  updated_at: string;
};


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
    assertD1BatchSucceeded(results, "repository target lifecycle");
    const changed = readD1SingleRowChange(results[0], "repository target lifecycle");
    return changed === 1;
  }
}
