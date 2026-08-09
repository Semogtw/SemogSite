import type {
  RegisteredRepositorySyncTarget,
  RepositorySyncTargetRegistrationAuditEvent,
  RepositorySyncTargetRegistrationRepository,
  RepositorySyncTargetRegistrationStoreResult,
} from "@semogtw/domain";
import type {
  D1DatabaseBinding,
  D1QueryResult,
} from "../adapters/d1";

function assertBatchSucceeded(results: readonly D1QueryResult[]): void {
  const failed = results.find(
    (result) => result.success === false || (result.error?.length ?? 0) > 0,
  );
  if (failed !== undefined) {
    throw new Error("D1 repository target registration batch failed.");
  }
}

function readChangeCount(result: D1QueryResult | undefined): number {
  const changes = result?.meta?.["changes"];
  if (typeof changes !== "number" || !Number.isInteger(changes) || changes < 0) {
    throw new Error(
      "D1 repository target registration result is missing changes metadata.",
    );
  }
  return changes;
}

export class D1RepositoryTargetRegistrationRepository
  implements RepositorySyncTargetRegistrationRepository
{
  constructor(private readonly database: D1DatabaseBinding) {}

  async createWithAudit(
    target: RegisteredRepositorySyncTarget,
    audit: RepositorySyncTargetRegistrationAuditEvent,
  ): Promise<RepositorySyncTargetRegistrationStoreResult> {
    const insert = this.database
      .prepare(
        `INSERT INTO repositories (
          id, project_id, github_node_id, owner, name, full_name, github_url,
          visibility, default_branch, active_branch, role, sync_enabled,
          status, last_synced_at, data_source, created_at, updated_at
        )
        SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
        WHERE EXISTS (
          SELECT 1 FROM projects WHERE id = ? AND status <> 'archived'
        )
          AND NOT EXISTS (SELECT 1 FROM repositories WHERE id = ?)
          AND NOT EXISTS (
            SELECT 1 FROM repositories WHERE lower(full_name) = lower(?)
          )`,
      )
      .bind(
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
        target.projectId,
        target.id,
        target.fullName,
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
        null,
        JSON.stringify(audit.after),
        audit.reason,
        audit.occurredAt,
        audit.source,
        audit.confirmed ? 1 : 0,
        audit.correlationId,
      );

    const results = await this.database.batch([insert, auditInsert]);
    assertBatchSucceeded(results);
    const changed = readChangeCount(results[0]);
    if (changed > 1) {
      throw new Error("D1 repository target registration inserted multiple rows.");
    }
    if (changed === 1) return "created";

    const project = await this.database
      .prepare("SELECT id FROM projects WHERE id = ? AND status <> 'archived' LIMIT 1")
      .bind(target.projectId)
      .first<{ id: string }>();
    if (project === null) return "project_not_found";

    const duplicate = await this.database
      .prepare(
        "SELECT id FROM repositories WHERE lower(full_name) = lower(?) LIMIT 1",
      )
      .bind(target.fullName)
      .first<{ id: string }>();
    if (duplicate !== null) return "duplicate";

    return "conflict";
  }
}
