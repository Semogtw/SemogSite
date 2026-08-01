import { describe, expect, it } from "vitest";
import type {
  RepositorySyncTargetLifecycleAuditEvent,
  RepositorySyncTargetLifecycleSnapshot,
} from "@semogtw/domain";
import { createSqliteDatabase, migrate } from "../adapters/sqlite";
import { SqliteRepositoryTargetLifecycleRepository } from "./repository-target-lifecycle-repository";

const before: RepositorySyncTargetLifecycleSnapshot = {
  id: "repository-1",
  fullName: "Semogtw/SemogSite",
  syncEnabled: true,
  updatedAt: "2026-08-01T21:00:00.000Z",
};
const after: RepositorySyncTargetLifecycleSnapshot = {
  ...before,
  syncEnabled: false,
  updatedAt: "2026-08-01T22:00:00.000Z",
};

function seedRepository(database: ReturnType<typeof createSqliteDatabase>): void {
  database.$client
    .prepare(
      `INSERT INTO repositories (
        id, project_id, github_node_id, owner, name, full_name, github_url,
        visibility, default_branch, active_branch, role, sync_enabled, status,
        last_synced_at, data_source, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      before.id,
      "demo-project-platform",
      "R_repo",
      "Semogtw",
      "SemogSite",
      before.fullName,
      "https://github.com/Semogtw/SemogSite",
      "private",
      "main",
      "develop/foundation-bootstrap",
      "product",
      1,
      "active",
      before.updatedAt,
      "github",
      before.updatedAt,
      before.updatedAt,
    );
}

function audit(
  id = "audit-target-disable",
): RepositorySyncTargetLifecycleAuditEvent {
  return {
    id,
    actor: "semogtw-owner",
    action: "repository.sync_target.disable",
    entityType: "repository",
    entityId: before.id,
    before,
    after,
    reason: "Pausar observações durante uma migração.",
    occurredAt: after.updatedAt,
    source: "manual",
    confirmed: true,
    correlationId: "correlation-target-disable",
  };
}

describe("SqliteRepositoryTargetLifecycleRepository", () => {
  it("hydrates the lifecycle snapshot", async () => {
    const database = createSqliteDatabase(":memory:");
    migrate(database);
    seedRepository(database);
    const repository = new SqliteRepositoryTargetLifecycleRepository(database);

    await expect(repository.findTarget(before.id)).resolves.toEqual(before);
    await expect(repository.findTarget("missing")).resolves.toBeNull();
    database.$client.close();
  });

  it("updates only sync state and inserts audit atomically", async () => {
    const database = createSqliteDatabase(":memory:");
    migrate(database);
    seedRepository(database);
    const repository = new SqliteRepositoryTargetLifecycleRepository(database);
    const event = audit();

    await expect(
      repository.changeWithAudit(before, after, event),
    ).resolves.toBe(true);
    expect(
      database.$client
        .prepare(
          `SELECT sync_enabled, updated_at, full_name, default_branch,
                  active_branch, github_node_id, role, status, data_source
           FROM repositories WHERE id = ?`,
        )
        .get(before.id),
    ).toEqual({
      sync_enabled: 0,
      updated_at: after.updatedAt,
      full_name: before.fullName,
      default_branch: "main",
      active_branch: "develop/foundation-bootstrap",
      github_node_id: "R_repo",
      role: "product",
      status: "active",
      data_source: "github",
    });
    expect(
      database.$client
        .prepare("SELECT action, before_json, after_json FROM audit_events WHERE id = ?")
        .get(event.id),
    ).toEqual({
      action: "repository.sync_target.disable",
      before_json: JSON.stringify(before),
      after_json: JSON.stringify(after),
    });
    database.$client.close();
  });

  it("rejects stale state without an audit event", async () => {
    const database = createSqliteDatabase(":memory:");
    migrate(database);
    seedRepository(database);
    const repository = new SqliteRepositoryTargetLifecycleRepository(database);
    database.$client
      .prepare("UPDATE repositories SET updated_at = ? WHERE id = ?")
      .run("2026-08-01T21:30:00.000Z", before.id);
    const event = audit("audit-stale-target");

    await expect(
      repository.changeWithAudit(before, after, event),
    ).resolves.toBe(false);
    expect(
      database.$client
        .prepare("SELECT id FROM audit_events WHERE id = ?")
        .get(event.id),
    ).toBeUndefined();
    database.$client.close();
  });

  it("rolls back the sync state when audit insertion fails", async () => {
    const database = createSqliteDatabase(":memory:");
    migrate(database);
    seedRepository(database);
    const repository = new SqliteRepositoryTargetLifecycleRepository(database);
    const event = audit("audit-existing");
    database.$client
      .prepare(
        `INSERT INTO audit_events (
          id, actor, action, entity_type, entity_id, before_json, after_json,
          reason, occurred_at, source, confirmed, correlation_id
        ) VALUES (?, 'owner', 'existing', 'repository', 'other', '{}', '{}',
          'existing', ?, 'manual', 1, 'existing-correlation')`,
      )
      .run(event.id, before.updatedAt);

    await expect(
      repository.changeWithAudit(before, after, event),
    ).rejects.toThrow();
    expect(
      database.$client
        .prepare("SELECT sync_enabled, updated_at FROM repositories WHERE id = ?")
        .get(before.id),
    ).toEqual({ sync_enabled: 1, updated_at: before.updatedAt });
    database.$client.close();
  });
});
