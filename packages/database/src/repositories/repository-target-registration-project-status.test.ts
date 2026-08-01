import { describe, expect, it } from "vitest";
import type {
  RegisteredRepositorySyncTarget,
  RepositorySyncTargetRegistrationAuditEvent,
} from "@semogtw/domain";
import { createSqliteDatabase, migrate } from "../adapters/sqlite";
import { SqliteRepositoryTargetRegistrationRepository } from "./repository-target-registration-repository";

const now = "2026-08-02T00:20:00.000Z";

describe("SqliteRepositoryTargetRegistrationRepository project status", () => {
  it("treats an archived project as unavailable and writes nothing", async () => {
    const database = createSqliteDatabase(":memory:");
    migrate(database);
    database.$client
      .prepare("UPDATE projects SET status = 'archived' WHERE id = ?")
      .run("demo-project-platform");
    const repository = new SqliteRepositoryTargetRegistrationRepository(
      database,
    );
    const target: RegisteredRepositorySyncTarget = {
      id: "repository-archived-project",
      projectId: "demo-project-platform",
      githubNodeId: null,
      owner: "Semogtw",
      name: "ArchivedTarget",
      fullName: "Semogtw/ArchivedTarget",
      htmlUrl: "https://github.com/Semogtw/ArchivedTarget",
      visibility: "private",
      defaultBranch: "main",
      activeBranch: null,
      role: "experiment",
      syncEnabled: true,
      status: "active",
      lastSyncedAt: null,
      dataSource: "manual",
      createdAt: now,
      updatedAt: now,
    };
    const audit: RepositorySyncTargetRegistrationAuditEvent = {
      id: "audit-archived-project",
      actor: "semogtw-owner",
      action: "repository.sync_target.create",
      entityType: "repository",
      entityId: target.id,
      before: null,
      after: target,
      reason: "Não deve ser persistido.",
      occurredAt: now,
      source: "manual",
      confirmed: true,
      correlationId: "correlation-archived-project",
    };

    await expect(
      repository.createWithAudit(target, audit),
    ).resolves.toBe("project_not_found");
    expect(
      database.$client
        .prepare("SELECT id FROM repositories WHERE id = ?")
        .get(target.id),
    ).toBeUndefined();
    expect(
      database.$client
        .prepare("SELECT id FROM audit_events WHERE id = ?")
        .get(audit.id),
    ).toBeUndefined();
    database.$client.close();
  });
});
