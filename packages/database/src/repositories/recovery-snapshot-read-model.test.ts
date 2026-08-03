import { describe, expect, it } from "vitest";
import { createSqliteDatabase, migrate } from "../adapters/sqlite";
import { SqliteRecoverySnapshotReadModel } from "./recovery-snapshot-read-model";

const generatedAt = "2026-08-03T16:00:00.000Z";

function insertRepository(database: ReturnType<typeof createSqliteDatabase>): void {
  database.$client
    .prepare(
      `INSERT INTO repositories (
        id, project_id, owner, name, full_name, role, visibility, status,
        default_branch, active_branch, github_url, github_node_id,
        sync_enabled, last_synced_at, data_source, created_at, updated_at
      ) VALUES (?, ?, 'Semogtw', 'SemogSite', 'Semogtw/SemogSite', 'product',
                'private', 'active', 'main', 'develop/workflow-control-core',
                'https://github.com/Semogtw/SemogSite', NULL, 1, ?, 'manual', ?, ?)`,
    )
    .run(
      "repository-1",
      "demo-project-platform",
      generatedAt,
      generatedAt,
      generatedAt,
    );
}

function insertSnapshot(
  database: ReturnType<typeof createSqliteDatabase>,
  input: {
    id: string;
    generatedAt: string;
    sourceObservedAt: string;
    confidence: "high" | "medium" | "low";
    sha: string;
    hash: string;
    markdown: string;
  },
): void {
  database.$client
    .prepare(
      `INSERT INTO recovery_snapshots (
        id, project_id, repository_id, run_id, branch,
        observed_commit_sha, schema_version, generated_at,
        source_observed_at, confidence, canonical_json, canonical_hash,
        markdown, template_id, template_version, created_by, source,
        idempotency_key, correlation_id
      ) VALUES (?, 'demo-project-platform', 'repository-1', NULL,
                'develop/workflow-control-core', ?, 1, ?, ?, ?, '{}', ?, ?,
                'workflow-resume', 1, 'owner-1', 'manual', ?, ?)`,
    )
    .run(
      input.id,
      input.sha,
      input.generatedAt,
      input.sourceObservedAt,
      input.confidence,
      input.hash,
      input.markdown,
      `attempt-${input.id}`,
      `correlation-${input.id}`,
    );
}

describe("SqliteRecoverySnapshotReadModel", () => {
  it("lists immutable snapshots newest first with repository identity", async () => {
    const database = createSqliteDatabase(":memory:");
    migrate(database);
    insertRepository(database);
    insertSnapshot(database, {
      id: "snapshot-old",
      generatedAt: "2026-08-03T14:00:00.000Z",
      sourceObservedAt: "2026-08-03T13:50:00.000Z",
      confidence: "medium",
      sha: "a".repeat(40),
      hash: "b".repeat(64),
      markdown: "# Old snapshot",
    });
    insertSnapshot(database, {
      id: "snapshot-new",
      generatedAt: "2026-08-03T15:00:00.000Z",
      sourceObservedAt: "2026-08-03T14:58:00.000Z",
      confidence: "high",
      sha: "c".repeat(40),
      hash: "d".repeat(64),
      markdown: "# New snapshot",
    });

    const model = new SqliteRecoverySnapshotReadModel(database);
    await expect(model.listRecent(10)).resolves.toEqual([
      {
        id: "snapshot-new",
        projectId: "demo-project-platform",
        projectName: "Semogtw Platform — demonstração",
        repositoryId: "repository-1",
        repositoryFullName: "Semogtw/SemogSite",
        branch: "develop/workflow-control-core",
        observedCommitSha: "c".repeat(40),
        generatedAt: "2026-08-03T15:00:00.000Z",
        sourceObservedAt: "2026-08-03T14:58:00.000Z",
        confidence: "high",
        canonicalHash: "d".repeat(64),
        markdown: "# New snapshot",
        templateId: "workflow-resume",
        templateVersion: 1,
      },
      {
        id: "snapshot-old",
        projectId: "demo-project-platform",
        projectName: "Semogtw Platform — demonstração",
        repositoryId: "repository-1",
        repositoryFullName: "Semogtw/SemogSite",
        branch: "develop/workflow-control-core",
        observedCommitSha: "a".repeat(40),
        generatedAt: "2026-08-03T14:00:00.000Z",
        sourceObservedAt: "2026-08-03T13:50:00.000Z",
        confidence: "medium",
        canonicalHash: "b".repeat(64),
        markdown: "# Old snapshot",
        templateId: "workflow-resume",
        templateVersion: 1,
      },
    ]);
    database.$client.close();
  });

  it("enforces a bounded result limit", async () => {
    const database = createSqliteDatabase(":memory:");
    migrate(database);
    const model = new SqliteRecoverySnapshotReadModel(database);

    await expect(model.listRecent(0)).rejects.toThrow(
      "RECOVERY_SNAPSHOT_LIMIT_INVALID",
    );
    await expect(model.listRecent(101)).rejects.toThrow(
      "RECOVERY_SNAPSHOT_LIMIT_INVALID",
    );
    database.$client.close();
  });
});
