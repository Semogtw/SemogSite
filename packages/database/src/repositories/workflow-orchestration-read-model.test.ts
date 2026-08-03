import { describe, expect, it } from "vitest";
import { createSqliteDatabase, migrate } from "../adapters/sqlite";
import { SqliteWorkflowOrchestrationReadModel } from "./workflow-orchestration-read-model";

const observedAt = "2026-08-03T12:00:00.000Z";

function insertRepository(database: ReturnType<typeof createSqliteDatabase>): void {
  database.$client
    .prepare(
      `INSERT INTO repositories (
        id, project_id, owner, name, full_name, role, visibility, status,
        default_branch, active_branch, github_url, github_node_id,
        sync_enabled, last_synced_at, data_source, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 1, NULL, ?, ?, ?)`,
    )
    .run(
      "repository-1",
      "demo-project-platform",
      "Semogtw",
      "SemogSite",
      "Semogtw/SemogSite",
      "product",
      "private",
      "active",
      "main",
      "develop/workflow-control-core",
      "https://github.com/Semogtw/SemogSite",
      "manual",
      observedAt,
      observedAt,
    );
}

describe("SqliteWorkflowOrchestrationReadModel", () => {
  it("returns conservative reservation freshness and unresolved gate counts", async () => {
    const database = createSqliteDatabase(":memory:");
    migrate(database);
    insertRepository(database);

    database.$client
      .prepare(
        `INSERT INTO scope_reservations (
          id, project_id, repository_id, run_id, branch, kind,
          patterns_json, holder_label, purpose, state, acquired_at,
          renewed_at, expires_at, released_at, version
        ) VALUES
          ('reservation-active', 'demo-project-platform', 'repository-1', NULL,
           'develop/workflow-control-core', 'directory', '["packages/domain/**"]',
           'agent-a', 'Implement domain services', 'active',
           '2026-08-03T10:00:00.000Z', '2026-08-03T11:30:00.000Z',
           '2026-08-03T12:30:00.000Z', NULL, 2),
          ('reservation-expired', 'demo-project-platform', 'repository-1', NULL,
           'develop/workflow-control-core', 'directory', '["packages/database/**"]',
           'agent-b', 'Old persistence work', 'active',
           '2026-08-03T08:00:00.000Z', '2026-08-03T08:30:00.000Z',
           '2026-08-03T09:30:00.000Z', NULL, 1)`,
      )
      .run();

    database.$client
      .prepare(
        `INSERT INTO verification_obligations (
          id, project_id, repository_id, run_id, stage_id, branch,
          target_commit_sha, gate_name, command, required_capabilities_json,
          responsible_actor, next_action, toolchain_manifest, status,
          failure_classification, failure_signature, result_summary,
          evidence_urls_json, created_at, last_attempt_at, resolved_at, version
        ) VALUES
          ('gate-pending', 'demo-project-platform', 'repository-1', NULL, NULL,
           'develop/workflow-control-core', ?, 'Database typecheck',
           'pnpm --filter @semogtw/database typecheck', '["node-22"]',
           'agent-a', 'Run after native SQLite hydration', NULL, 'pending',
           NULL, NULL, NULL, '[]', '2026-08-03T11:00:00.000Z', NULL, NULL, 1),
          ('gate-blocked', 'demo-project-platform', 'repository-1', NULL, NULL,
           'develop/workflow-control-core', ?, 'Android E2E',
           'pnpm test:android', '["android-sdk"]', 'owner',
           'Run on the local Android machine', NULL, 'blocked',
           'environment_missing', 'android e2e|environment_missing|android sdk missing',
           'Android SDK missing', '[]', '2026-08-03T10:00:00.000Z',
           '2026-08-03T10:30:00.000Z', NULL, 2),
          ('gate-passed', 'demo-project-platform', 'repository-1', NULL, NULL,
           'develop/workflow-control-core', ?, 'Domain tests',
           'pnpm test:domain', '["node-22"]', 'agent-a',
           'Preserve evidence', NULL, 'passed', NULL, NULL,
           'Passed with zero failures', '["https://example.com/run"]',
           '2026-08-03T09:00:00.000Z', '2026-08-03T09:30:00.000Z',
           '2026-08-03T09:30:00.000Z', 2)`,
      )
      .run("a".repeat(40), "b".repeat(40), "c".repeat(40));

    const model = new SqliteWorkflowOrchestrationReadModel(database);
    const dashboard = await model.getDashboard(observedAt);

    expect(dashboard.summary).toEqual({
      activeReservations: 1,
      expiredReservations: 1,
      unresolvedObligations: 2,
      environmentBlockedObligations: 1,
    });
    expect(dashboard.reservations).toEqual([
      expect.objectContaining({
        id: "reservation-active",
        repositoryFullName: "Semogtw/SemogSite",
        freshness: "active",
        patterns: ["packages/domain/**"],
      }),
      expect.objectContaining({
        id: "reservation-expired",
        freshness: "expired",
      }),
    ]);
    expect(dashboard.obligations.map((item) => item.id)).toEqual([
      "gate-blocked",
      "gate-pending",
      "gate-passed",
    ]);
    expect(dashboard.obligations[0]).toMatchObject({
      status: "blocked",
      failureClassification: "environment_missing",
      targetCommitSha: "b".repeat(40),
    });
    expect(dashboard.observedAt).toBe(observedAt);

    database.$client.close();
  });

  it("rejects an invalid observation time", async () => {
    const database = createSqliteDatabase(":memory:");
    migrate(database);
    const model = new SqliteWorkflowOrchestrationReadModel(database);

    await expect(model.getDashboard("invalid")).rejects.toThrow(
      "WORKFLOW_ORCHESTRATION_OBSERVED_AT_INVALID",
    );
    database.$client.close();
  });
});
