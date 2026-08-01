import type {
  RegisteredRepositorySyncTarget,
  RepositorySyncTargetRegistrationAuditEvent,
  RepositorySyncTargetRegistrationRepository,
  RepositorySyncTargetRegistrationStoreResult,
} from "@semogtw/domain";
import type { SqliteDatabase } from "../adapters/sqlite";

export class SqliteRepositoryTargetRegistrationRepository
  implements RepositorySyncTargetRegistrationRepository
{
  constructor(private readonly database: SqliteDatabase) {}

  async createWithAudit(
    target: RegisteredRepositorySyncTarget,
    audit: RepositorySyncTargetRegistrationAuditEvent,
  ): Promise<RepositorySyncTargetRegistrationStoreResult> {
    const transaction = this.database.$client.transaction(() => {
      const project = this.database.$client
        .prepare("SELECT id FROM projects WHERE id = ?")
        .get(target.projectId) as { id: string } | undefined;
      if (project === undefined) return "project_not_found";

      const idConflict = this.database.$client
        .prepare("SELECT id FROM repositories WHERE id = ?")
        .get(target.id) as { id: string } | undefined;
      if (idConflict !== undefined) return "conflict";

      const duplicate = this.database.$client
        .prepare(
          "SELECT id FROM repositories WHERE lower(full_name) = lower(?) LIMIT 1",
        )
        .get(target.fullName) as { id: string } | undefined;
      if (duplicate !== undefined) return "duplicate";

      this.database.$client
        .prepare(
          `INSERT INTO repositories (
            id, project_id, github_node_id, owner, name, full_name, html_url,
            visibility, default_branch, active_branch, role, sync_enabled,
            status, last_synced_at, data_source, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          target.id,
          target.projectId,
          target.githubNodeId,
          target.owner,
          target.name,
          target.fullName,
          target.htmlUrl,
          target.visibility,
          target.defaultBranch,
          target.activeBranch,
          target.role,
          target.syncEnabled ? 1 : 0,
          target.status,
          target.lastSyncedAt,
          target.dataSource,
          target.createdAt,
          target.updatedAt,
        );

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
          null,
          JSON.stringify(audit.after),
          audit.reason,
          audit.occurredAt,
          audit.source,
          audit.confirmed ? 1 : 0,
          audit.correlationId,
        );

      return "created";
    });

    return transaction.immediate();
  }
}
