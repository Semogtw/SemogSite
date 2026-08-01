import { describe, expect, it } from "vitest";
import type {
  GitHubSyncRunFinish,
  RepositoryObservationAggregate,
} from "@semogtw/domain";
import { createSqliteDatabase, migrate } from "../adapters/sqlite";
import { SqliteGitHubSyncStore } from "./github-sync-store";

const observedAt = "2026-08-01T19:30:00.000Z";

function insertRepository(
  database: ReturnType<typeof createSqliteDatabase>,
  input: {
    id: string;
    fullName: string;
    syncEnabled: boolean;
    status: "active" | "historical" | "archived";
    activeBranch: string | null;
    role?: "primary" | "secondary" | "archive";
  },
): void {
  const [owner, name] = input.fullName.split("/");
  database.$client
    .prepare(
      `INSERT INTO repositories (
        id, project_id, github_node_id, owner, name, full_name, html_url,
        visibility, default_branch, active_branch, role, sync_enabled, status,
        last_synced_at, data_source, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      input.id,
      "demo-project-platform",
      null,
      owner,
      name,
      input.fullName,
      `https://github.com/${input.fullName}`,
      "private",
      "main",
      input.activeBranch,
      input.role ?? "primary",
      input.syncEnabled ? 1 : 0,
      input.status,
      null,
      "manual",
      observedAt,
      observedAt,
    );
}

function aggregate(): RepositoryObservationAggregate {
  return {
    repository: {
      id: "repository-observation-1",
      syncRunId: "sync-run-1",
      repositoryId: "repository-1",
      githubNodeId: "R_repo",
      fullName: "Semogtw/SemogSite-renamed",
      visibility: "private",
      defaultBranch: "trunk",
      htmlUrl: "https://github.com/Semogtw/SemogSite-renamed",
      archived: false,
      pushedAt: "2026-08-01T19:10:00.000Z",
      providerUpdatedAt: "2026-08-01T19:15:00.000Z",
      observedAt,
      apiVersion: "2026-03-10",
      etag: "repo-etag",
      rateLimitRemaining: 4980,
      rateLimitResetAt: "2026-08-01T20:00:00.000Z",
      branchesTruncated: false,
      sourceHash: "repository-source-hash",
    },
    branches: [
      {
        id: "branch-observation-1",
        repositoryObservationId: "repository-observation-1",
        repositoryId: "repository-1",
        name: "develop/foundation-bootstrap",
        headSha: "abcdef1234567",
        committedAt: "2026-08-01T19:00:00.000Z",
        protected: false,
        isDefault: false,
        observedAt,
        sourceHash: "branch-source-hash",
      },
    ],
    recommendation: {
      id: "recommendation-1",
      repositoryObservationId: "repository-observation-1",
      repositoryId: "repository-1",
      status: "recommended",
      branch: "develop/foundation-bootstrap",
      confidence: "high",
      reason: "Head único claramente mais recente.",
      warnings: [],
      evidence: [{ name: "develop/foundation-bootstrap" }],
      observedAt,
      sourceHash: "recommendation-source-hash",
    },
  };
}

describe("SqliteGitHubSyncStore", () => {
  it("lists only active enabled targets in deterministic priority order", async () => {
    const database = createSqliteDatabase(":memory:");
    migrate(database);
    insertRepository(database, {
      id: "repository-secondary",
      fullName: "Semogtw/Secondary",
      syncEnabled: true,
      status: "active",
      activeBranch: "develop",
      role: "secondary",
    });
    insertRepository(database, {
      id: "repository-primary",
      fullName: "Semogtw/Primary",
      syncEnabled: true,
      status: "active",
      activeBranch: "main",
      role: "primary",
    });
    insertRepository(database, {
      id: "repository-disabled",
      fullName: "Semogtw/Disabled",
      syncEnabled: false,
      status: "active",
      activeBranch: null,
    });
    insertRepository(database, {
      id: "repository-archived",
      fullName: "Semogtw/Archived",
      syncEnabled: true,
      status: "archived",
      activeBranch: null,
    });
    const store = new SqliteGitHubSyncStore(database);

    await expect(store.listTargets(10)).resolves.toEqual([
      {
        id: "repository-primary",
        owner: "Semogtw",
        name: "Primary",
        fullName: "Semogtw/Primary",
        defaultBranch: "main",
        currentActiveBranch: "main",
      },
      {
        id: "repository-secondary",
        owner: "Semogtw",
        name: "Secondary",
        fullName: "Semogtw/Secondary",
        defaultBranch: "main",
        currentActiveBranch: "develop",
      },
    ]);
  });

  it("starts, records and finishes a sync run without changing active_branch", async () => {
    const database = createSqliteDatabase(":memory:");
    migrate(database);
    insertRepository(database, {
      id: "repository-1",
      fullName: "Semogtw/SemogSite",
      syncEnabled: true,
      status: "active",
      activeBranch: "develop/foundation-bootstrap",
    });
    const store = new SqliteGitHubSyncStore(database);

    await store.startRun({
      id: "sync-run-1",
      integration: "github",
      scope: "repositories",
      status: "running",
      startedAt: observedAt,
    });
    await expect(store.recordObservation(aggregate())).resolves.toBe("inserted");

    expect(
      database.$client
        .prepare(
          "SELECT github_node_id, full_name, html_url, visibility, default_branch, active_branch, last_synced_at, data_source FROM repositories WHERE id = ?",
        )
        .get("repository-1"),
    ).toEqual({
      github_node_id: "R_repo",
      full_name: "Semogtw/SemogSite-renamed",
      html_url: "https://github.com/Semogtw/SemogSite-renamed",
      visibility: "private",
      default_branch: "trunk",
      active_branch: "develop/foundation-bootstrap",
      last_synced_at: observedAt,
      data_source: "github",
    });

    const finish: GitHubSyncRunFinish = {
      id: "sync-run-1",
      status: "success",
      finishedAt: observedAt,
      createdCount: 1,
      updatedCount: 0,
      skippedCount: 0,
      errorCount: 0,
      warnings: [],
      rateLimitRemaining: 4980,
      rateLimitResetAt: "2026-08-01T20:00:00.000Z",
      processedTargets: 1,
    };
    await store.finishRun(finish);

    expect(
      database.$client
        .prepare(
          "SELECT status, created_count, updated_count, skipped_count, error_count, warnings_json, rate_limit_remaining, rate_limit_reset_at, metadata_json FROM sync_runs WHERE id = ?",
        )
        .get("sync-run-1"),
    ).toEqual({
      status: "success",
      created_count: 1,
      updated_count: 0,
      skipped_count: 0,
      error_count: 0,
      warnings_json: "[]",
      rate_limit_remaining: 4980,
      rate_limit_reset_at: "2026-08-01T20:00:00.000Z",
      metadata_json: JSON.stringify({ processedTargets: 1 }),
    });
  });

  it("returns duplicate idempotently while refreshing observed metadata", async () => {
    const database = createSqliteDatabase(":memory:");
    migrate(database);
    insertRepository(database, {
      id: "repository-1",
      fullName: "Semogtw/SemogSite",
      syncEnabled: true,
      status: "active",
      activeBranch: "develop/foundation-bootstrap",
    });
    const store = new SqliteGitHubSyncStore(database);
    await store.startRun({
      id: "sync-run-1",
      integration: "github",
      scope: "repositories",
      status: "running",
      startedAt: observedAt,
    });

    await expect(store.recordObservation(aggregate())).resolves.toBe("inserted");
    await expect(store.recordObservation(aggregate())).resolves.toBe("duplicate");
    expect(
      database.$client
        .prepare("SELECT COUNT(*) AS count FROM github_repository_observations")
        .get(),
    ).toEqual({ count: 1 });
  });

  it("rolls back observation rows when the repository metadata update cannot match", async () => {
    const database = createSqliteDatabase(":memory:");
    migrate(database);
    database.$client
      .prepare(
        `INSERT INTO sync_runs (
          id, integration, scope, status, started_at, finished_at,
          created_count, updated_count, skipped_count, error_count,
          warnings_json, error_summary, cursor, rate_limit_remaining,
          rate_limit_reset_at, metadata_json
        ) VALUES (?, 'github', 'repositories', 'running', ?, NULL, 0, 0, 0, 0, '[]', NULL, NULL, NULL, NULL, '{}')`,
      )
      .run("sync-run-1", observedAt);
    const store = new SqliteGitHubSyncStore(database);

    await expect(store.recordObservation(aggregate())).rejects.toThrow();
    expect(
      database.$client
        .prepare("SELECT COUNT(*) AS count FROM github_repository_observations")
        .get(),
    ).toEqual({ count: 0 });
  });
});
