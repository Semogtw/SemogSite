import { describe, expect, it } from "vitest";
import type {
  RegisteredRepositorySyncTarget,
  RepositorySyncTargetRegistrationAuditEvent,
} from "@semogtw/domain";
import { createSqliteDatabase, migrate } from "../adapters/sqlite";
import { SqliteRepositoryTargetRegistrationRepository } from "./repository-target-registration-repository";

const now = "2026-08-01T21:30:00.000Z";

function target(
  id = "repository-new",
  fullName = "Semogtw/SemogSite",
): RegisteredRepositorySyncTarget {
  const [owner, name] = fullName.split("/") as [string, string];
  return {
    id,
    projectId: "demo-project-platform",
    githubNodeId: null,
    owner,
    name,
    fullName,
    htmlUrl: `https://github.com/${fullName}`,
    visibility: "private",
    defaultBranch: "main",
    activeBranch: null,
    role: "primary",
    syncEnabled: true,
    status: "active",
    lastSyncedAt: null,
    dataSource: "manual",
    createdAt: now,
    updatedAt: now,
  };
}

function audit(
  value: RegisteredRepositorySyncTarget,
  id = "audit-repository-new",
): RepositorySyncTargetRegistrationAuditEvent {
  return {
    id,
    actor: "semogtw-owner",
    action: "repository.sync_target.create",
    entityType: "repository",
    entityId: value.id,
    before: null,
    after: value,
    reason: "Cadastrar a fonte técnica principal do projeto.",
    occurredAt: now,
    source: "manual",
    confirmed: true,
    correlationId: "correlation-repository-new",
  };
}

describe("SqliteRepositoryTargetRegistrationRepository", () => {
  it("creates the target and audit atomically", async () => {
    const database = createSqliteDatabase(":memory:");
    migrate(database);
    const repository = new SqliteRepositoryTargetRegistrationRepository(
      database,
    );
    const value = target();
    const event = audit(value);

    await expect(
      repository.createWithAudit(value, event),
    ).resolves.toBe("created");
    expect(
      database.$client
        .prepare(
          `SELECT project_id, github_node_id, owner, name, full_name, html_url,
                  visibility, default_branch, active_branch, role, sync_enabled,
                  status, last_synced_at, data_source
           FROM repositories WHERE id = ?`,
        )
        .get(value.id),
    ).toEqual({
      project_id: "demo-project-platform",
      github_node_id: null,
      owner: "Semogtw",
      name: "SemogSite",
      full_name: "Semogtw/SemogSite",
      html_url: "https://github.com/Semogtw/SemogSite",
      visibility: "private",
      default_branch: "main",
      active_branch: null,
      role: "primary",
      sync_enabled: 1,
      status: "active",
      last_synced_at: null,
      data_source: "manual",
    });
    expect(
      database.$client
        .prepare("SELECT action, before_json, after_json FROM audit_events WHERE id = ?")
        .get(event.id),
    ).toEqual({
      action: "repository.sync_target.create",
      before_json: null,
      after_json: JSON.stringify(value),
    });
  });

  it("rejects a missing project and case-insensitive duplicate", async () => {
    const database = createSqliteDatabase(":memory:");
    migrate(database);
    const repository = new SqliteRepositoryTargetRegistrationRepository(
      database,
    );
    const missingProject = {
      ...target("repository-missing-project"),
      projectId: "project-missing",
    };

    await expect(
      repository.createWithAudit(
        missingProject,
        audit(missingProject, "audit-missing-project"),
      ),
    ).resolves.toBe("project_not_found");

    const first = target();
    await repository.createWithAudit(first, audit(first));
    const duplicate = target("repository-duplicate", "semogtw/semogsite");
    await expect(
      repository.createWithAudit(
        duplicate,
        audit(duplicate, "audit-duplicate-repository"),
      ),
    ).resolves.toBe("duplicate");
    expect(
      database.$client
        .prepare("SELECT COUNT(*) AS count FROM repositories WHERE lower(full_name) = lower(?)")
        .get("Semogtw/SemogSite"),
    ).toEqual({ count: 1 });
  });

  it("reports an ID conflict without inserting an audit event", async () => {
    const database = createSqliteDatabase(":memory:");
    migrate(database);
    const repository = new SqliteRepositoryTargetRegistrationRepository(
      database,
    );
    const first = target();
    await repository.createWithAudit(first, audit(first));
    const conflict = target(first.id, "Semogtw/Another");
    const conflictAudit = audit(conflict, "audit-id-conflict");

    await expect(
      repository.createWithAudit(conflict, conflictAudit),
    ).resolves.toBe("conflict");
    expect(
      database.$client
        .prepare("SELECT id FROM audit_events WHERE id = ?")
        .get(conflictAudit.id),
    ).toBeUndefined();
  });

  it("rolls back the repository when audit insertion fails", async () => {
    const database = createSqliteDatabase(":memory:");
    migrate(database);
    const repository = new SqliteRepositoryTargetRegistrationRepository(
      database,
    );
    const value = target("repository-audit-rollback", "Semogtw/Rollback");
    const event = audit(value, "audit-existing");
    database.$client
      .prepare(
        `INSERT INTO audit_events (
          id, actor, action, entity_type, entity_id, before_json, after_json,
          reason, occurred_at, source, confirmed, correlation_id
        ) VALUES (?, 'owner', 'existing', 'repository', 'other', NULL, '{}',
          'existing', ?, 'manual', 1, 'existing-correlation')`,
      )
      .run(event.id, now);

    await expect(
      repository.createWithAudit(value, event),
    ).rejects.toThrow();
    expect(
      database.$client
        .prepare("SELECT id FROM repositories WHERE id = ?")
        .get(value.id),
    ).toBeUndefined();
  });
});
