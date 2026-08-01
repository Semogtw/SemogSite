import { describe, expect, it } from "vitest";
import { createSqliteDatabase, migrate } from "../adapters/sqlite";
import { SqliteGitHubSyncReadModel } from "./github-sync-read-model";

const now = "2026-08-01T20:00:00.000Z";

function seedRepository(database: ReturnType<typeof createSqliteDatabase>): void {
  database.$client
    .prepare(
      `INSERT INTO repositories (
        id, project_id, github_node_id, owner, name, full_name, html_url,
        visibility, default_branch, active_branch, role, sync_enabled, status,
        last_synced_at, data_source, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      "repository-1",
      "demo-project-platform",
      "R_repo",
      "Semogtw",
      "SemogSite",
      "Semogtw/SemogSite",
      "https://github.com/Semogtw/SemogSite",
      "private",
      "main",
      "develop/foundation-bootstrap",
      "primary",
      1,
      "active",
      now,
      "github",
      now,
      now,
    );
}

function seedObservation(database: ReturnType<typeof createSqliteDatabase>): void {
  database.$client
    .prepare(
      `INSERT INTO sync_runs (
        id, integration, scope, status, started_at, finished_at,
        created_count, updated_count, skipped_count, error_count,
        warnings_json, error_summary, cursor, rate_limit_remaining,
        rate_limit_reset_at, metadata_json
      ) VALUES (?, 'github', 'repositories', 'partial', ?, ?, 1, 0, 0, 1, ?, ?, NULL, 42, ?, ?)`,
    )
    .run(
      "sync-run-1",
      "2026-08-01T19:50:00.000Z",
      now,
      JSON.stringify(["repository-1:PARTIAL_OBSERVATION"]),
      "1 alvo(s) com falha ou observação parcial.",
      "2026-08-01T21:00:00.000Z",
      JSON.stringify({ processedTargets: 1 }),
    );
  database.$client
    .prepare(
      `INSERT INTO github_repository_observations (
        id, sync_run_id, repository_id, github_node_id, full_name,
        visibility, default_branch, html_url, archived, pushed_at,
        provider_updated_at, observed_at, api_version, etag,
        rate_limit_remaining, rate_limit_reset_at, branches_truncated,
        source_hash
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      "observation-1",
      "sync-run-1",
      "repository-1",
      "R_repo",
      "Semogtw/SemogSite",
      "private",
      "main",
      "https://github.com/Semogtw/SemogSite",
      0,
      now,
      now,
      now,
      "2026-03-10",
      "etag",
      42,
      "2026-08-01T21:00:00.000Z",
      1,
      "observation-hash",
    );
  database.$client
    .prepare(
      `INSERT INTO github_branch_recommendations (
        id, repository_observation_id, repository_id, status, branch,
        confidence, reason, warnings_json, evidence_json, observed_at,
        source_hash
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      "recommendation-1",
      "observation-1",
      "repository-1",
      "recommended",
      "develop/foundation-bootstrap",
      "high",
      "Head único claramente mais recente.",
      JSON.stringify(["BRANCH_LIST_BOUNDED"]),
      JSON.stringify([{ name: "develop/foundation-bootstrap" }]),
      now,
      "recommendation-hash",
    );
}

describe("SqliteGitHubSyncReadModel", () => {
  it("returns the last run and latest recommendation per configured repository", async () => {
    const database = createSqliteDatabase(":memory:");
    migrate(database);
    seedRepository(database);
    seedObservation(database);
    const model = new SqliteGitHubSyncReadModel(database);

    await expect(model.getDashboard()).resolves.toMatchObject({
      configuredTargets: 1,
      lastRun: {
        id: "sync-run-1",
        status: "partial",
        createdCount: 1,
        errorCount: 1,
        warnings: ["repository-1:PARTIAL_OBSERVATION"],
        processedTargets: 1,
        malformedJson: [],
      },
      repositories: [
        {
          id: "repository-1",
          fullName: "Semogtw/SemogSite",
          activeBranch: "develop/foundation-bootstrap",
          recommendation: {
            status: "recommended",
            branch: "develop/foundation-bootstrap",
            confidence: "high",
            branchesTruncated: true,
          },
        },
      ],
    });
  });

  it("returns an empty honest state when no target or run exists", async () => {
    const database = createSqliteDatabase(":memory:");
    migrate(database);
    const model = new SqliteGitHubSyncReadModel(database);

    await expect(model.getDashboard()).resolves.toEqual({
      configuredTargets: 0,
      lastRun: null,
      repositories: [],
    });
  });

  it("sanitizes malformed run JSON without failing the dashboard", async () => {
    const database = createSqliteDatabase(":memory:");
    migrate(database);
    database.$client
      .prepare(
        `INSERT INTO sync_runs (
          id, integration, scope, status, started_at, finished_at,
          created_count, updated_count, skipped_count, error_count,
          warnings_json, error_summary, cursor, rate_limit_remaining,
          rate_limit_reset_at, metadata_json
        ) VALUES (?, 'github', 'repositories', 'failed', ?, ?, 0, 0, 0, 1, ?, NULL, NULL, NULL, NULL, ?)`,
      )
      .run("sync-broken", now, now, "{broken", "[]");
    const model = new SqliteGitHubSyncReadModel(database);

    await expect(model.getDashboard()).resolves.toMatchObject({
      lastRun: {
        id: "sync-broken",
        warnings: [],
        processedTargets: null,
        malformedJson: ["warnings", "metadata"],
      },
    });
  });
});
