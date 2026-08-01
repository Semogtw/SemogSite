import { describe, expect, it } from "vitest";
import type { RepositoryObservationAggregate } from "@semogtw/domain";
import { createSqliteDatabase, migrate } from "../adapters/sqlite";
import { SqliteGitHubObservationRepository } from "./github-observation-repository";

const observedAt = "2026-08-01T18:30:00.000Z";

function seedTarget(database: ReturnType<typeof createSqliteDatabase>): void {
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
      null,
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
      null,
      "manual",
      observedAt,
      observedAt,
    );
  database.$client
    .prepare(
      `INSERT INTO sync_runs (
        id, integration, scope, status, started_at, finished_at,
        created_count, updated_count, skipped_count, error_count,
        warnings_json, error_summary, cursor, rate_limit_remaining,
        rate_limit_reset_at, metadata_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      "sync-run-1",
      "github",
      "repositories",
      "running",
      observedAt,
      null,
      0,
      0,
      0,
      0,
      "[]",
      null,
      null,
      4990,
      "2026-08-01T19:00:00.000Z",
      "{}",
    );
}

function aggregate(suffix = "1"): RepositoryObservationAggregate {
  return {
    repository: {
      id: `repository-observation-${suffix}`,
      syncRunId: "sync-run-1",
      repositoryId: "repository-1",
      githubNodeId: "R_repo",
      fullName: "Semogtw/SemogSite",
      visibility: "private",
      defaultBranch: "main",
      htmlUrl: "https://github.com/Semogtw/SemogSite",
      archived: false,
      pushedAt: "2026-08-01T18:20:00.000Z",
      providerUpdatedAt: "2026-08-01T18:21:00.000Z",
      observedAt,
      apiVersion: "2026-03-10",
      etag: '"repo-etag"',
      rateLimitRemaining: 4990,
      rateLimitResetAt: "2026-08-01T19:00:00.000Z",
      branchesTruncated: false,
      sourceHash: `repository-hash-${suffix}`,
    },
    branches: [
      {
        id: `branch-observation-${suffix}`,
        repositoryObservationId: `repository-observation-${suffix}`,
        repositoryId: "repository-1",
        name: "develop/foundation-bootstrap",
        headSha: "abcdef1234567",
        committedAt: "2026-08-01T18:15:00.000Z",
        protected: false,
        isDefault: false,
        observedAt,
        sourceHash: `branch-hash-${suffix}`,
      },
    ],
    recommendation: {
      id: `recommendation-${suffix}`,
      repositoryObservationId: `repository-observation-${suffix}`,
      repositoryId: "repository-1",
      status: "recommended",
      branch: "develop/foundation-bootstrap",
      confidence: "high",
      reason: "Head único claramente mais recente.",
      warnings: ["BRANCH_LIST_BOUNDED"],
      evidence: [{ name: "develop/foundation-bootstrap", headSha: "abcdef1234567" }],
      observedAt,
      sourceHash: `recommendation-hash-${suffix}`,
    },
  };
}

describe("SqliteGitHubObservationRepository", () => {
  it("persists one aggregate atomically and returns its latest recommendation", async () => {
    const database = createSqliteDatabase(":memory:");
    migrate(database);
    seedTarget(database);
    const repository = new SqliteGitHubObservationRepository(database);

    await expect(repository.insertObservation(aggregate())).resolves.toBe("inserted");
    await expect(repository.latestRecommendation("repository-1")).resolves.toMatchObject({
      repositoryId: "repository-1",
      fullName: "Semogtw/SemogSite",
      status: "recommended",
      branch: "develop/foundation-bootstrap",
      confidence: "high",
      warnings: ["BRANCH_LIST_BOUNDED"],
      evidence: [{ name: "develop/foundation-bootstrap", headSha: "abcdef1234567" }],
      malformedJson: [],
    });
  });

  it("treats a repeated repository source hash as an idempotent duplicate", async () => {
    const database = createSqliteDatabase(":memory:");
    migrate(database);
    seedTarget(database);
    const repository = new SqliteGitHubObservationRepository(database);
    const value = aggregate();

    await expect(repository.insertObservation(value)).resolves.toBe("inserted");
    await expect(repository.insertObservation(value)).resolves.toBe("duplicate");
    expect(
      database.$client.prepare("SELECT COUNT(*) AS count FROM github_repository_observations").get(),
    ).toEqual({ count: 1 });
    expect(
      database.$client.prepare("SELECT COUNT(*) AS count FROM github_branch_observations").get(),
    ).toEqual({ count: 1 });
  });

  it("rolls back the parent when a child source hash conflicts", async () => {
    const database = createSqliteDatabase(":memory:");
    migrate(database);
    seedTarget(database);
    const repository = new SqliteGitHubObservationRepository(database);
    await repository.insertObservation(aggregate());
    const conflicting = aggregate("2");
    conflicting.branches[0]!.sourceHash = "branch-hash-1";

    await expect(repository.insertObservation(conflicting)).rejects.toThrow();
    expect(
      database.$client
        .prepare("SELECT id FROM github_repository_observations WHERE id = ?")
        .get("repository-observation-2"),
    ).toBeUndefined();
  });

  it("sanitizes malformed historical recommendation JSON", async () => {
    const database = createSqliteDatabase(":memory:");
    migrate(database);
    seedTarget(database);
    const repository = new SqliteGitHubObservationRepository(database);
    await repository.insertObservation(aggregate());
    database.$client
      .prepare(
        "UPDATE github_branch_recommendations SET warnings_json = ?, evidence_json = ? WHERE id = ?",
      )
      .run("{broken", "[]", "recommendation-1");

    await expect(repository.latestRecommendation("repository-1")).resolves.toMatchObject({
      warnings: [],
      evidence: [],
      malformedJson: ["warnings"],
    });
  });
});
